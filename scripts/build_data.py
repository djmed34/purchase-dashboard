"""매입 원본(xlsx) → 정제·분류·집계 → public/data/*.json

정제 규칙(PRD Section 2):
  R1 협력사 키 = 구매처코드, 표시명은 최신 연도 표기(NFKC 정규화)
  R2 코드 재사용 예외는 data/config/supplier-exceptions.csv 로 분리
  R3 매입액 = 순매입액(반품·차감·소급정산 포함)
  R4 단가 계산은 수량>0 이고 단가>0 인 행만 사용
  R5 기준일 = 입고일(명세서마감일)
  R6 품목군 = data/config/category-map.csv (영문 접두어 / 숫자 앞 2자리)

보안(로그인):
  GitHub Pages는 정적 호스팅이라 서버 인증이 없다. 그래서 집계 데이터를 빌드 시 AES-256-GCM으로
  암호화해 public/data/secure.json 으로만 게시하고, 브라우저는 로그인(아이디·비밀번호) 성공 시에만
  복호화한다. 사용자 목록은 환경변수 DASHBOARD_USERS("아이디:비밀번호;아이디2:비밀번호2")로 받는다.
  로컬은 .env, CI는 GitHub Secrets 사용. 코드에 비밀번호를 넣지 않는다.

사용: python scripts/build_data.py            # 암호화 산출물 (DASHBOARD_USERS 필요)
      python scripts/build_data.py --no-auth  # 평문 산출물 (로컬 개발 전용, 게시 금지)
"""
from __future__ import annotations

import base64
import gzip
import hashlib
import json
import os
import re
import secrets
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
CONFIG_DIR = ROOT / "data" / "config"
OUT_DIR = ROOT / "public" / "data"

UNMAPPED_ALPHA = ("완제품", "미분류")
UNMAPPED_NUMERIC = ("부품", "기타 부품")
PBKDF2_ITERATIONS = 600_000  # OWASP 2023 권고(PBKDF2-HMAC-SHA256)
MIN_PASSWORD_LEN = 12


def b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def load_users() -> list[tuple[str, str]]:
    """DASHBOARD_USERS 환경변수 → 없으면 프로젝트 .env 에서 읽음"""
    raw = os.environ.get("DASHBOARD_USERS")
    env_file = ROOT / ".env"
    if not raw and env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("DASHBOARD_USERS="):
                raw = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not raw:
        sys.exit("[오류] DASHBOARD_USERS 가 없습니다. .env(로컬) 또는 GitHub Secrets(CI)에 설정하십시오. (.env.example 참고)")
    users = []
    for entry in re.split(r"[;\n]", raw):
        if not entry.strip():
            continue
        if ":" not in entry:
            sys.exit("[오류] DASHBOARD_USERS 형식은 '아이디:비밀번호;아이디2:비밀번호2' 입니다.")
        uid, pw = entry.split(":", 1)
        uid = uid.strip()
        if len(pw) < MIN_PASSWORD_LEN:
            # 짧은 비밀번호는 암호화 파일을 내려받아 대입하면 쉽게 풀림 → 배포(CI)에서는 차단, 로컬 확인만 허용
            if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
                sys.exit(f"[오류] '{uid}' 비밀번호가 너무 짧습니다 ({MIN_PASSWORD_LEN}자 이상). 배포 빌드에서는 허용하지 않습니다.")
            print(f"[경고] '{uid}' 비밀번호가 {MIN_PASSWORD_LEN}자 미만입니다. 로컬 확인 전용 — 이 산출물을 게시하지 마십시오.")
        users.append((uid, pw))
    return users


def encrypt_bundle(payload: dict, users: list[tuple[str, str]]) -> dict:
    """데이터키(무작위 256bit)로 본문 암호화 → 사용자별 비밀번호 파생키로 데이터키를 감싸 저장(envelope)"""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    data_key = AESGCM.generate_key(bit_length=256)
    iv = secrets.token_bytes(12)
    body = gzip.compress(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    ct = AESGCM(data_key).encrypt(iv, body, None)

    wrapped = []
    for uid, pw in users:
        salt = secrets.token_bytes(16)
        kek = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, PBKDF2_ITERATIONS, dklen=32)
        wiv = secrets.token_bytes(12)
        wrapped.append({
            "u": hashlib.sha256(uid.encode("utf-8")).hexdigest(),  # 아이디도 평문으로 노출하지 않음
            "salt": b64(salt), "iv": b64(wiv),
            "key": b64(AESGCM(kek).encrypt(wiv, data_key, None)),
        })
    return {"v": 1, "alg": "AES-256-GCM", "kdf": {"name": "PBKDF2-SHA256", "iter": PBKDF2_ITERATIONS},
            "users": wrapped, "iv": b64(iv), "ct": b64(ct)}


def norm_name(s: str) -> str:
    s = unicodedata.normalize("NFKC", str(s))
    return re.sub(r"\s+", " ", s).strip()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()[:16]


def load_raw() -> tuple[pd.DataFrame, list[dict]]:
    files = sorted(p for p in RAW_DIR.glob("*.xlsx") if re.match(r"^\d{4}매입\.xlsx$", p.name))
    if not files:
        sys.exit(f"[오류] 원본 파일이 없습니다: {RAW_DIR}")
    frames, sources = [], []
    for f in files:
        df = pd.read_excel(f, dtype={"구매처": str, "품번": str, "구매처명": str, "품명": str})
        df["파일연도"] = int(f.name[:4])
        frames.append(df)
        sources.append({"file": f.name, "rows": len(df), "sha256": sha256(f), "amount": float(df["금액"].sum())})
    return pd.concat(frames, ignore_index=True), sources


def apply_supplier_keys(df: pd.DataFrame) -> pd.DataFrame:
    df["구매처"] = df["구매처"].astype(str).str.strip()
    df["구매처명_정규"] = df["구매처명"].map(norm_name)
    df["supplier_key"] = df["구매처"]
    exc = pd.read_csv(CONFIG_DIR / "supplier-exceptions.csv", dtype=str)
    for _, r in exc.iterrows():
        m = (df["구매처"] == r["code"]) & df["구매처명_정규"].str.contains(norm_name(r["name_contains"]), regex=False)
        df.loc[m, "supplier_key"] = r["key"]
    return df


def classify(df: pd.DataFrame) -> pd.DataFrame:
    cmap = pd.read_csv(CONFIG_DIR / "category-map.csv", dtype=str).fillna("")
    alpha = {r.prefix.upper(): (r.l1, r.l2) for r in cmap.itertuples() if r.scheme == "alpha"}
    numeric = {r.prefix.zfill(2): (r.l1, r.l2) for r in cmap.itertuples() if r.scheme == "numeric"}

    def cat(code: str) -> tuple[str, str]:
        code = norm_name(code).upper()
        if code[:1].isdigit():
            return numeric.get(code[:2], UNMAPPED_NUMERIC)
        m = re.match(r"^([A-Z]+)", code)
        return alpha.get(m.group(1), UNMAPPED_ALPHA) if m else UNMAPPED_ALPHA

    codes = df["품번"].astype(str).str.strip()
    lookup = {c: cat(c) for c in codes.unique()}
    df["품번"] = codes
    df["l1"] = codes.map(lambda c: lookup[c][0])
    df["l2"] = codes.map(lambda c: lookup[c][1])
    return df


def main() -> None:
    no_auth = "--no-auth" in sys.argv
    users = [] if no_auth else load_users()
    df, sources = load_raw()
    df = apply_supplier_keys(df)
    df = classify(df)

    d = pd.to_datetime(df["입고일(명세서마감일)"].astype("Int64").astype(str), format="%Y%m%d", errors="coerce")
    if d.isna().any():
        sys.exit(f"[오류] 입고일 변환 실패 {int(d.isna().sum())}건")
    df["year"] = d.dt.year
    df["quarter"] = d.dt.quarter
    mismatch = int((df["year"] != df["파일연도"]).sum())

    df["금액"] = df["금액"].fillna(0).astype(float)
    df["수량"] = df["수량"].fillna(0).astype(float)
    df["단가"] = df["단가"].fillna(0).astype(float)
    valid = (df["수량"] > 0) & (df["단가"] > 0)  # R4
    df["vq"] = df["수량"].where(valid, 0)
    df["vv"] = (df["수량"] * df["단가"]).where(valid, 0)

    # 협력사 마스터: 최신 연도에서 가장 많이 쓰인 표기를 표시명으로 (R1)
    years = sorted(df["year"].unique().tolist())
    first_y, last_y = years[0], years[-1]
    suppliers = []
    for key, g in df.groupby("supplier_key", sort=False):
        latest = g[g["year"] == g["year"].max()]
        name = latest["구매처명_정규"].value_counts().index[0]
        aliases = sorted(set(g["구매처명_정규"]) - {name})
        ys = sorted(g.loc[g["금액"] != 0, "year"].unique().tolist()) or sorted(g["year"].unique().tolist())
        if last_y not in ys:
            status = "중단"
        elif ys[0] > first_y:
            status = "신규"
        else:
            status = "지속"
        suppliers.append({"k": key, "code": str(g["구매처"].iloc[0]), "name": name, "aliases": aliases,
                          "first": int(ys[0]), "last": int(ys[-1]), "status": status})
    suppliers.sort(key=lambda s: s["k"])
    s_idx = {s["k"]: i for i, s in enumerate(suppliers)}

    # 품목 마스터
    items_df = (df.sort_values("year").groupby("품번")
                .agg(name=("품명", "last"), spec=("규격", "last"), l1=("l1", "first"), l2=("l2", "first"))
                .reset_index())
    cats = sorted({(r.l1, r.l2) for r in items_df.itertuples()})
    c_idx = {c: i for i, c in enumerate(cats)}
    items = [{"c": r.품번, "n": norm_name(r.name), "s": norm_name(r.spec) if pd.notna(r.spec) else "",
              "cat": c_idx[(r.l1, r.l2)]} for r in items_df.itertuples()]
    i_idx = {it["c"]: i for i, it in enumerate(items)}

    # 팩트: 협력사 × 품번 × 연 × 분기
    df["s"] = df["supplier_key"].map(s_idx)
    df["i"] = df["품번"].map(i_idx)
    fact = (df.groupby(["s", "i", "year", "quarter"], as_index=False)
            .agg(amt=("금액", "sum"), vq=("vq", "sum"), vv=("vv", "sum")))
    facts = [[int(r.s), int(r.i), int(r.year), int(r.quarter), round(float(r.amt)), round(float(r.vq), 2), round(float(r.vv))]
             for r in fact.itertuples()]

    # 검증: 연도별 합계가 원본과 일치해야 함 (불일치 시 빌드 실패)
    checks = []
    for src in sources:
        y = int(src["file"][:4])
        got = float(fact.loc[fact["year"] == y, "amt"].sum())
        ok = abs(got - src["amount"]) < 1
        checks.append({"year": y, "source": round(src["amount"]), "built": round(got), "ok": ok})
    if not all(c["ok"] for c in checks) or mismatch:
        print(json.dumps(checks, ensure_ascii=False, indent=2))
        sys.exit(f"[오류] 합계 검증 실패 (파일연도≠입고연도 {mismatch}건)")

    unmapped = df["l2"].isin([UNMAPPED_ALPHA[1], UNMAPPED_NUMERIC[1]])
    rules = json.loads((CONFIG_DIR / "dependency-rules.json").read_text(encoding="utf-8"))
    meta = {
        "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "period": {"from": str(d.min().date()), "to": str(d.max().date())},
        "years": [int(y) for y in years],
        "rows": len(df),
        "sources": [{k: v for k, v in s.items() if k != "amount"} for s in sources],
        "validation": checks,
        "mapping": {"version": "draft-" + sha256(CONFIG_DIR / "category-map.csv")[:8], "isDraft": True,
                    "unmappedItems": int(df.loc[unmapped, "품번"].nunique()),
                    "unmappedAmount": round(float(df.loc[unmapped, "금액"].sum()))},
        "rules": rules,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    data = {"suppliers": suppliers, "items": items,
            "categories": [{"l1": a, "l2": b} for a, b in cats], "facts": facts}
    plain = [OUT_DIR / "purchase.json", OUT_DIR / "meta.json"]
    secure = OUT_DIR / "secure.json"
    if no_auth:
        secure.unlink(missing_ok=True)
        plain[0].write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        plain[1].write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        out, mode = plain[0], "평문(로컬 개발 전용 — 게시 금지)"
    else:
        for p in plain:  # 평문이 함께 게시되지 않도록 제거
            p.unlink(missing_ok=True)
        secure.write_text(json.dumps(encrypt_bundle({"data": data, "meta": meta}, users)), encoding="utf-8")
        out, mode = secure, f"암호화(사용자 {len(users)}명)"
    size_kb = out.stat().st_size / 1024
    print(f"[완료] 원본 {len(df):,}행 → 협력사 {len(suppliers)} / 품번 {len(items):,} / 팩트 {len(facts):,}행 ({size_kb:,.0f} KB, {mode})")
    print(f"       미분류 품번 {meta['mapping']['unmappedItems']}개, 금액 {meta['mapping']['unmappedAmount']:,}원")


if __name__ == "__main__":
    main()
