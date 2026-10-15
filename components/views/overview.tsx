"use client";

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "../ui";
import { ChartTooltip, CriteriaDots, DependencyBadge, InsightPanel, KpiTile, useChartColors } from "../parts";
import { dependencyRanking, topNConcentration, type Context, type PeriodMetrics } from "@/lib/metrics";
import { overviewInsights } from "@/lib/insights";
import { eok, pct, pp, signedPct } from "@/lib/format";

interface Props {
  ctx: Context;
  pm: PeriodMetrics;
  cur: PeriodMetrics;
  prev: PeriodMetrics | null;
  onOpenSupplier: (s: number) => void;
}

export default function OverviewView({ ctx, pm, cur, prev, onOpenSupplier }: Props) {
  const c = useChartColors();
  const r = ctx.rules;
  const status = ctx.filters.status;
  const ranking = React.useMemo(() => dependencyRanking(pm, status), [pm, status]);
  const [showAll, setShowAll] = React.useState(false);
  const shown = showAll ? ranking : ranking.slice(0, 10);

  const highCount = (p: PeriodMetrics) =>
    p.suppliers.filter((m) => m.high && (status === "전체" || m.status === status)).length;
  const conc = (p: PeriodMetrics) => topNConcentration(p)[0]?.share ?? 0;
  const single = (p: PeriodMetrics) => (p.total > 0 ? p.singleAmt / p.total : 0);
  const concSeries = React.useMemo(() => topNConcentration(pm), [pm]);
  const periodConc = React.useMemo(() => {
    const sorted = [...pm.suppliers].sort((a, b) => b.total - a.total);
    return pm.total > 0 ? sorted.slice(0, 10).reduce((a, m) => a + m.total, 0) / pm.total : 0;
  }, [pm]);
  const insights = React.useMemo(() => overviewInsights(ctx, pm, ranking, cur, prev), [ctx, pm, ranking, cur, prev]);

  const Y = cur.years[0];
  const yLabel = prev ? `${Y}년, 전년 대비` : `${Y}년`;
  const scatter = pm.suppliers
    .filter((m) => m.total > 0 && (status === "전체" || m.status === status))
    .map((m) => ({ x: m.total, y: m.catShare, s: m.s, name: m.name, high: m.high, cat: ctx.data.categories[m.repCat].l2 }));
  const periodLabel = `${pm.years[0]}~${pm.years[pm.years.length - 1]}`;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="고의존 협력사 수"
          value={`${highCount(cur)}개사`}
          delta={prev ? `${highCount(cur) - highCount(prev) >= 0 ? "+" : ""}${highCount(cur) - highCount(prev)}개사` : undefined}
          deltaValue={prev ? highCount(cur) - highCount(prev) : null}
          direction="upBad"
          context={`${yLabel} · 선택 기간(${periodLabel}) ${pm.suppliers.filter((m) => m.high).length}개사`}
          source="매입내역, 의존도 기준 2개 이상 충족"
        />
        <KpiTile
          label="상위 10개사 매입 집중도"
          value={pct(conc(cur))}
          delta={prev ? pp(conc(cur) - conc(prev)) : undefined}
          deltaValue={prev ? conc(cur) - conc(prev) : null}
          direction="upBad"
          context={`${yLabel} · 선택 기간 누적 ${pct(periodConc)}`}
          source="상위 10개사 매입 ÷ 전체 매입"
        />
        <KpiTile
          label="단독 공급 품번 매입 비중"
          value={pct(single(cur))}
          delta={prev ? pp(single(cur) - single(prev)) : undefined}
          deltaValue={prev ? single(cur) - single(prev) : null}
          direction="upBad"
          context={`${yLabel} · 공급사 1곳인 품번 기준`}
          source="연도 내 공급사 1곳 품번 매입 ÷ 전체"
        />
        <KpiTile
          label="총 순매입액"
          value={eok(cur.total)}
          delta={prev && prev.total ? signedPct(cur.total / prev.total - 1) : undefined}
          deltaValue={prev ? cur.total - prev.total : null}
          direction="neutral"
          context={`${yLabel} · 선택 기간 누적 ${eok(pm.total)}`}
          source="Σ금액 (반품·소급정산 포함)"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>의존도 상위 {showAll ? ranking.length : Math.min(10, ranking.length)}개 협력사</CardTitle>
              <CardDescription>
                {periodLabel}년 · 매입 {eok(r.rankingMinAmount, 0)} 이상 {ranking.length}개사 대상 · 행을 선택하면 협력사
                상세로 이동합니다
              </CardDescription>
            </div>
            {ranking.length > 10 && (
              <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "상위 10개만" : `전체 ${ranking.length}개 보기`}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH className="w-8">#</TH>
                <TH>협력사</TH>
                <TH>상태</TH>
                <TH className="text-right">의존도 점수</TH>
                <TH>대표 품목군</TH>
                <TH className="text-right">품목군 내 비중</TH>
                <TH className="text-right">단독 공급 비중</TH>
                <TH>최근 {r.trendYears}년 비중</TH>
                <TH className="text-right">매입액</TH>
                <TH className="text-right">CAGR</TH>
              </TR>
            </THead>
            <TBody>
              {shown.map((m, k) => (
                <TR
                  key={m.s}
                  onClick={() => onOpenSupplier(m.s)}
                  className="cursor-pointer hover:bg-accent"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onOpenSupplier(m.s)}
                >
                  <TD className="tabular text-muted-foreground">{k + 1}</TD>
                  <TD>
                    <div className="font-medium">{m.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {m.code} · {m.status}
                    </div>
                  </TD>
                  <TD>
                    <div className="flex flex-col items-start gap-1">
                      <DependencyBadge m={m} min={r.highDependencyMinCriteria} />
                      <CriteriaDots m={m} />
                    </div>
                  </TD>
                  <TD className="text-right">
                    <ScoreBar v={m.score} color={m.high ? c["status-critical"] : c["series-1"]} track={c["chart-grid"]} />
                  </TD>
                  <TD>{ctx.data.categories[m.repCat].l2}</TD>
                  <TD className="tabular text-right">{pct(m.catShare)}</TD>
                  <TD className="tabular text-right">{pct(m.singleShare)}</TD>
                  <TD className="tabular whitespace-nowrap">
                    {m.trendSeries.map((v) => (v * 100).toFixed(0)).join("→")}%{" "}
                    {m.trendUp && <span className="text-delta-down">↗</span>}
                  </TD>
                  <TD className="tabular text-right">{eok(m.total)}</TD>
                  <TD className="tabular text-right">
                    {m.cagr === null ? <span className="text-muted-foreground">산출 불가</span> : signedPct(m.cagr)}
                    {m.cagr !== null && m.cagrPartial && (
                      <span className="ml-0.5 text-muted-foreground" title="거래 기간 기준">
                        *
                      </span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="mt-2 text-[11px] text-muted-foreground">
            * 거래 기간 기준 CAGR(선택 기간 일부만 거래). 품목군 내 비중은 매입액이 가장 큰 품목군 기준.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>매입 규모와 품목군 내 비중</CardTitle>
            <CardDescription>
              오른쪽 위(규모 큼 + 비중 높음)가 최우선 검토 대상입니다 · 점을 선택하면 협력사 상세로 이동합니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full" style={{ background: c["status-critical"] }} />
                고의존
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-full" style={{ background: c["series-1"] }} />
                그 외
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0 w-4 border-t border-dashed" style={{ borderColor: c["chart-axis"] }} />
                기준 {r.categoryShareThreshold * 100}%
              </span>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
                  <CartesianGrid stroke={c["chart-grid"]} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    scale="log"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(v) => eok(v, v >= 1e9 ? 0 : 1)}
                    tick={{ fill: c["chart-axis"], fontSize: 11 }}
                    stroke={c["chart-grid"]}
                    label={{ value: "매입액 (로그 축)", position: "insideBottom", offset: -8, fill: c["chart-axis"], fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[0, 1]}
                    tickFormatter={(v) => `${Math.round(v * 100)}%`}
                    tick={{ fill: c["chart-axis"], fontSize: 11 }}
                    stroke={c["chart-grid"]}
                    width={44}
                  />
                  <ZAxis range={[60, 60]} />
                  <ReferenceLine y={r.categoryShareThreshold} stroke={c["chart-axis"]} strokeDasharray="4 4" />
                  <Tooltip
                    cursor={false}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as (typeof scatter)[number];
                      return (
                        <ChartTooltip
                          title={d.name}
                          rows={[
                            { label: "매입액", value: eok(d.x) },
                            { label: `${d.cat} 내 비중`, value: pct(d.y) },
                          ]}
                        />
                      );
                    }}
                  />
                  <Scatter
                    isAnimationActive={false}
                    data={scatter.filter((d) => !d.high)}
                    fill={c["series-1"]}
                    fillOpacity={0.75}
                    stroke={c["chart-surface"]}
                    strokeWidth={2}
                    onClick={(d) => onOpenSupplier((d as unknown as { s: number }).s)}
                    className="cursor-pointer"
                  />
                  <Scatter
                    isAnimationActive={false}
                    data={scatter.filter((d) => d.high)}
                    fill={c["status-critical"]}
                    stroke={c["chart-surface"]}
                    strokeWidth={2}
                    onClick={(d) => onOpenSupplier((d as unknown as { s: number }).s)}
                    className="cursor-pointer"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>상위 10개사 매입 집중도 추이</CardTitle>
            <CardDescription>연도별 상위 10개사 매입 ÷ 전체 매입</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={concSeries} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke={c["chart-grid"]} vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: c["chart-axis"], fontSize: 11 }} stroke={c["chart-grid"]} />
                  <YAxis
                    domain={[0, 1]}
                    tickFormatter={(v) => `${Math.round(v * 100)}%`}
                    tick={{ fill: c["chart-axis"], fontSize: 11 }}
                    stroke={c["chart-grid"]}
                    width={44}
                  />
                  <Tooltip
                    cursor={{ stroke: c["chart-axis"], strokeWidth: 1 }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <ChartTooltip
                          title={`${label}년`}
                          rows={[{ label: "상위 10개사 비중", value: pct(payload[0].value as number) }]}
                        />
                      ) : null
                    }
                  />
                  <Line
                    isAnimationActive={false}
                    dataKey="share"
                    stroke={c["series-1"]}
                    strokeWidth={2}
                    dot={{ r: 4, fill: c["series-1"], stroke: c["chart-surface"], strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                    label={({ x, y, index, value }) =>
                      index === concSeries.length - 1 ? (
                        <text x={x} y={Number(y) - 10} textAnchor="middle" fontSize={11} fill={c.foreground}>
                          {pct(value as number)}
                        </text>
                      ) : (
                        <g />
                      )
                    }
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <InsightPanel insights={insights} />
    </div>
  );
}

function ScoreBar({ v, color, track }: { v: number; color: string; track: string }) {
  return (
    <div className="ml-auto flex w-28 items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full" style={{ background: track }}>
        <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, v)}%`, background: color }} />
      </div>
      <span className="tabular w-8 text-right font-medium">{v.toFixed(0)}</span>
    </div>
  );
}
