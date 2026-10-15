"use client";

import * as React from "react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "./ui";
import { cn } from "@/lib/format";
import type { Insight } from "@/lib/types";
import type { SupplierMetric } from "@/lib/metrics";

/** 차트 색상: CSS 변수를 읽어 Recharts에 전달 (라이트/다크 자동 전환) */
const VARS = [
  "series-1",
  "series-2",
  "series-3",
  "series-4",
  "series-5",
  "series-other",
  "chart-grid",
  "chart-axis",
  "chart-surface",
  "status-critical",
  "status-warning",
  "card",
  "border",
  "foreground",
  "muted-foreground",
] as const;
export type ChartColors = Record<(typeof VARS)[number], string>;

export function useChartColors(): ChartColors {
  const read = React.useCallback(() => {
    const cs = typeof window === "undefined" ? null : getComputedStyle(document.documentElement);
    return Object.fromEntries(VARS.map((v) => [v, cs?.getPropertyValue(`--${v}`).trim() || "#888"])) as ChartColors;
  }, []);
  const [c, setC] = React.useState<ChartColors>(read);
  React.useEffect(() => {
    setC(read());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setC(read());
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [read]);
  return c;
}

export const SERIES = ["series-1", "series-2", "series-3", "series-4", "series-5"] as const;

export function ChartTooltip({
  title,
  rows,
}: {
  title: React.ReactNode;
  rows: { label: string; value: string; color?: string }[];
}) {
  return (
    <div className="min-w-40 rounded-md border bg-card px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.color && <span className="inline-block size-2 rounded-sm" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="tabular font-medium">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

type Direction = "upBad" | "upGood" | "neutral";

export function KpiTile({
  label,
  value,
  delta,
  deltaValue,
  direction = "neutral",
  context,
  source,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaValue?: number | null;
  direction?: Direction;
  context?: React.ReactNode;
  source: string;
}) {
  let tone = "text-muted-foreground";
  if (deltaValue && direction !== "neutral") {
    const bad = direction === "upBad" ? deltaValue > 0 : deltaValue < 0;
    tone = bad ? "text-delta-down" : "text-delta-up";
  }
  const arrow = !deltaValue ? "" : deltaValue > 0 ? "▲ " : "▼ ";
  return (
    <Card className="flex flex-col">
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="text-[13px] text-muted-foreground">{label}</div>
        <div className="text-[26px] font-semibold leading-tight">{value}</div>
        {delta && (
          <div className={cn("text-xs font-medium", tone)}>
            {arrow}
            {delta}
          </div>
        )}
        {context && <div className="text-xs text-muted-foreground">{context}</div>}
      </div>
      <div className="border-t px-4 py-2 text-[11px] text-muted-foreground" title={source}>
        출처: {source}
      </div>
    </Card>
  );
}

export function InsightPanel({ insights }: { insights: Insight[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>살펴볼 지점</CardTitle>
        <p className="text-xs text-muted-foreground">규칙 기반 자동 탐지 결과입니다. 판단 전 근거 수치를 확인하십시오.</p>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">현재 필터 조건에서 탐지된 항목이 없습니다.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-3">
            {insights.map((i, k) => (
              <li key={k} className="rounded-lg border bg-muted/40 p-3">
                <Badge tone={i.kind === "추세 경고" ? "critical" : i.kind === "이상 탐지" ? "warning" : "good"}>
                  {i.kind === "추세 경고" ? "↗" : i.kind === "이상 탐지" ? "!" : "＋"} {i.kind}
                </Badge>
                <p className="mt-2 text-[13px] leading-relaxed">{i.text}</p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">근거: {i.basis}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** 의존도 상태 배지 — 색만으로 의미 전달하지 않도록 아이콘+라벨 동반 */
export function DependencyBadge({ m, min }: { m: SupplierMetric; min: number }) {
  if (m.high) return <Badge tone="critical">● 고의존</Badge>;
  if (m.criteriaMet >= Math.max(1, min - 1)) return <Badge tone="warning">◐ 주의</Badge>;
  return <Badge tone="muted">○ 일반</Badge>;
}

export function CriteriaDots({ m }: { m: SupplierMetric }) {
  const items: [boolean, string][] = [
    [m.criteria.share, "품목군 비중"],
    [m.criteria.single, "단독 공급"],
    [m.criteria.trend, "3년 상승"],
  ];
  return (
    <span className="inline-flex gap-1" aria-label="충족 기준">
      {items.map(([on, l]) => (
        <span
          key={l}
          title={`${l}: ${on ? "충족" : "미충족"}`}
          className={cn(
            "rounded px-1 text-[10px] leading-4",
            on ? "bg-status-critical/15 text-foreground" : "text-muted-foreground/60",
          )}
        >
          {l}
        </span>
      ))}
    </span>
  );
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-1">
      <h2 className="text-lg font-semibold">{children}</h2>
      {sub && <p className="text-[13px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
