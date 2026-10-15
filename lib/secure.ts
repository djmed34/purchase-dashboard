import type { Meta, PurchaseData } from "./types";

/**
 * 정적 호스팅(GitHub Pages)용 로그인 — 서버가 없으므로 "데이터를 읽을 수 있는 키"를 비밀번호로 보호한다.
 * secure.json = 데이터키로 암호화한 본문 + 사용자별(PBKDF2 파생키) 감싼 데이터키. (scripts/build_data.py)
 * 로그인 성공 → 데이터키를 sessionStorage(탭 단위)에 보관 → 탭을 닫거나 로그아웃하면 사라짐.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SESSION_KEY = "pd.session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8시간

interface Bundle {
  v: number;
  kdf: { name: string; iter: number };
  users: { u: string; salt: string; iv: string; key: string }[];
  iv: string;
  ct: string;
}
export interface Session {
  k: string; // base64 데이터키
  u: string; // 표시용 아이디
  at: number;
}
export interface Loaded {
  data: PurchaseData;
  meta: Meta;
  mode: "secure" | "plain";
}

export class AuthError extends Error {}

const ub64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));

async function sha256Hex(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

let bundleCache: Promise<Bundle | null> | null = null;
/** secure.json 조회. 없으면 null (로컬 평문 개발 모드) */
export function fetchBundle(): Promise<Bundle | null> {
  bundleCache ??= fetch(`${BASE}/data/secure.json`, { cache: "no-store" }).then((r) => {
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`secure.json ${r.status}`);
    return r.json();
  });
  return bundleCache;
}

export async function login(id: string, password: string): Promise<Session> {
  const bundle = await fetchBundle();
  if (!bundle) throw new Error("암호화 데이터가 없습니다");
  const uid = id.trim();
  const hash = await sha256Hex(uid);
  const user = bundle.users.find((x) => x.u === hash);
  if (!user) throw new AuthError();

  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const kek = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: ub64(user.salt), iterations: bundle.kdf.iter, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  let raw: ArrayBuffer;
  try {
    raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ub64(user.iv) }, kek, ub64(user.key));
  } catch {
    throw new AuthError(); // 비밀번호 불일치 → GCM 인증 실패
  }
  const session: Session = { k: b64(raw), u: uid, at: Date.now() };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* 저장 불가 환경(프라이빗 모드 등)에서는 이번 페이지에서만 유효 */
  }
  return session;
}

export function getSession(): Session | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    if (!s || Date.now() - s.at > SESSION_TTL_MS) return null;
    return s;
  } catch {
    return null;
  }
}

export function logout() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

async function gunzipJson<T>(buf: ArrayBuffer): Promise<T> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

/** 세션 키로 데이터 복호화. 키가 맞지 않으면(재배포로 데이터키 변경 등) AuthError */
export async function loadData(session: Session | null): Promise<Loaded> {
  const bundle = await fetchBundle();
  if (!bundle) {
    // 로컬 개발(--no-auth) 평문 모드
    const [data, meta] = await Promise.all([
      fetch(`${BASE}/data/purchase.json`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`${BASE}/data/meta.json`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    return { data, meta, mode: "plain" };
  }
  if (!session) throw new AuthError();
  try {
    const key = await crypto.subtle.importKey("raw", ub64(session.k), "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ub64(bundle.iv) }, key, ub64(bundle.ct));
    const { data, meta } = await gunzipJson<{ data: PurchaseData; meta: Meta }>(plain);
    return { data, meta, mode: "secure" };
  } catch {
    logout();
    throw new AuthError();
  }
}
