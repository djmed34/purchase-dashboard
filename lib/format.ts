import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** 원 → 억원 (대시보드 금액 단위 통일) */
export function eok(v: number, digits?: number) {
  const x = v / 1e8;
  const d = digits ?? (Math.abs(x) >= 10 ? 1 : 2);
  return `${x.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d })}억`;
}

export const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}`;

export function pct(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return `${(v * 100).toFixed(digits)}%`;
}

export function signedPct(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const s = (v * 100).toFixed(digits);
  return `${v > 0 ? "+" : ""}${s}%`;
}

/** %p 차이 */
export function pp(v: number, digits = 1) {
  const s = (v * 100).toFixed(digits);
  return `${v > 0 ? "+" : ""}${s}%p`;
}
