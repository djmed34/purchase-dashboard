"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "../ui";
import { ChartTooltip, InsightPanel, KpiTile, SERIES, useChartColors } from "../parts";
import { categoryComposition, categoryMetrics, type CategoryMetric, type Context, type PeriodMetrics } from "@/lib/metrics";
import { categoryInsights } from "@/lib/insights";
import { cn, eok, pct } from "@/lib/format";

interface Props {
  ctx: Context;
  pm: PeriodMetrics;
  cur: PeriodMetrics;
  prev: PeriodMetrics | null;
  onOpenSupplier: (s: number) => void;
}

export default function CategoryView({ ctx, pm, cur, prev, onOpenSupplier }: Props) {
  const c = useChartColors();
  const th = ctx.rules.categoryShareThreshold;
  const cats = React.useMemo(() => categoryMetrics(ctx, pm), [ctx, pm]);
  const catsCur = React.useMemo(() => categoryMetrics(ctx, cur), [ctx, cur]);
  const catsPrev = React.useMemo(() => (prev ? categoryMetrics(ctx, prev) : null), [ctx, prev]);
  const [sel, setSel] = React.useState<number | null>(null);
  const selected = cats.find((x) => x.cat === sel) ?? cats[0];
  const comp = React.useMemo(
    () => (selected ? categoryComposition(ctx, pm, selected.cat) : null),
    [ctx, pm, selected],
  );
  const insights = React.useMemo(() => categoryInsights(ctx, pm, cats), [ctx, pm, cats]);

  const concentrated = (xs: CategoryMetric[]) => xs.filter((x) => (x.top?.share ?? 0) >= th).length;
  const sole = (xs: CategoryMetric[]) => xs.filter((x) => x.suppliers === 1).length;
  const avgSup = (xs: CategoryMetric[]) => (xs.length ? xs.reduce((a, x) => a + x.suppliers, 0) / xs.length : 0);
  const d = (a: number, b: number | null, digits = 0) =>
    b === null ? undefined : `${a - b >= 0 ? "+" : ""}${(a - b).toFixed(digits)}`;

  const Y = cur.years[0];
  const yLabel = prev ? `${Y}년, 전년 대비` : `${Y}년`;
  const periodLabel = `${pm.years[0]}~${pm.years[pm.years.length - 1]}`;

  // 대분류 비교: 금액 가중 1위 업체 비중, 기준 초과 품목군 수, 단일 공급 품목군 수, 평균 공급사 수
  const l1Rows = (["완제품", "부품"] as const)
    .map((l1) => {
      const xs = cats.filter((x) => x.l1 === l1);
      const tot = xs.reduce((a, x) => a + Math.max(0, x.total), 0);
      const w = tot > 0 ? xs.reduce((a, x) => a + (x.top?.share ?? 0) * Math.max(0, x.total), 0) / tot : 0;
      return { l1, n: xs.length, total: tot, weighted: w, conc: concentrated(xs), sole: sole(xs), avg: avgSup(xs) };
    })
    .filter((r) => r.n > 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile
          label={`1위 업체 비중 ${th * 100}% 이상 품목군`}
          value={`${concentrated(catsCur)}개 / ${catsCur.length}개`}
          delta={d(concentrated(catsCur), catsPrev ? concentrated(catsPrev) : null)}
          deltaValue={catsPrev ? concentrated(catsCur) - concentrated(catsPrev) : null}
          direction="upBad"
          context={`${yLabel} · 선택 기간 ${concentrated(cats)}개`}
          source="품목군별 1위 업체 매입 ÷ 품목군 전체"
        />
        <KpiTile
          label="공급사 1곳뿐인 품목군"
          value={`${sole(catsCur)}개`}
          delta={d(sole(catsCur), catsPrev ? sole(catsPrev) : null)}
          deltaValue={catsPrev ? sole(catsCur) - sole(catsPrev) : null}
          direction="upBad"
          context={`${yLabel} · 선택 기간 ${sole(cats)}개`}
          source="품목군 내 매입 실적 업체 수 = 1"
        />
        <KpiTile
          label="품목군 평균 공급사 수"
          value={`${avgSup(catsCur).toFixed(1)}곳`}
          delta={d(avgSup(catsCur), catsPrev ? avgSup(catsPrev) : null, 1)}
          deltaValue={catsPrev ? avgSup(catsCur) - avgSup(catsPrev) : null}
          direction="upGood"
          context={`${yLabel} · 선택 기간 ${avgSup(cats).toFixed(1)}곳`}
          source="품목군별 매입 실적 업체 수 평균"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>품목군별 취약도 순위</CardTitle>
          <CardDescription>
            {periodLabel}년 · 1위 업체 비중 높은 순 · 행을 선택하면 아래에 협력사 구성 변화가 표시됩니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>품목군</TH>
                <TH>대분류</TH>
                <TH className="text-right">매입액</TH>
                <TH className="text-right">공급사 수</TH>
                <TH>1위 업체</TH>
                <TH>1위 비중</TH>
                <TH>연도별 1위 비중</TH>
              </TR>
            </THead>
            <TBody>
              {cats.map((x) => {
                const share = x.top?.share ?? 0;
                const isSel = selected?.cat === x.cat;
                return (
                  <TR
                    key={x.cat}
                    onClick={() => setSel(x.cat)}
                    className={cn("cursor-pointer hover:bg-accent", isSel && "bg-accent")}
                    aria-selected={isSel}
                  >
                    <TD className="font-medium">
                      {x.l2}
                      {x.suppliers === 1 && (
                        <Badge tone="critical" className="ml-1.5">
                          단일 공급
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-muted-foreground">{x.l1}</TD>
                    <TD className="tabular text-right">{eok(x.total)}</TD>
                    <TD className="tabular text-right">{x.suppliers}</TD>
                    <TD>
                      {x.top ? (
                        <button
                          className="underline-offset-2 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenSupplier(x.top!.s);
                          }}
                        >
                          {x.top.name}
                        </button>
                      ) : (
                        "–"
                      )}
                    </TD>
                    <TD>
                      <div className="flex w-36 items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full" style={{ background: c["chart-grid"] }}>
                          <div
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${Math.min(100, share * 100)}%`,
                              background: share >= th ? c["status-critical"] : c["series-1"],
                            }}
                          />
                        </div>
                        <span className="tabular w-11 text-right">{pct(share, 0)}</span>
                      </div>
                    </TD>
                    <TD className="tabular whitespace-nowrap text-muted-foreground">
                      {x.topShareByYear.map((t) => (t.s === null ? "–" : (t.share * 100).toFixed(0))).join(" · ")}
                      {x.topShareTrendUp && <span className="ml-1 text-delta-down">↗</span>}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <p className="mt-2 text-[11px] text-muted-foreground">
            연도별 1위 비중(%)은 {pm.years.join(" · ")} 순서. ↗ = 최근 {ctx.rules.trendYears}년 연속 상승. 1위 업체는 해당
            연도마다 다를 수 있습니다.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{selected?.l2} 협력사 구성 변화</CardTitle>
            <CardDescription>연도별 매입 비중 · 기간 매입 상위 5개사 + 기타</CardDescription>
          </CardHeader>
          <CardContent>
            {comp && (
              <>
                <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {comp.top.map((s, k) => (
                    <button
                      key={s}
                      className="flex items-center gap-1.5 hover:text-foreground"
                      onClick={() => onOpenSupplier(s)}
                    >
                      <span className="inline-block size-2.5 rounded-sm" style={{ background: c[SERIES[k]] }} />
                      {ctx.data.suppliers[s].name}
                    </button>
                  ))}
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2.5 rounded-sm" style={{ background: c["series-other"] }} />
                    기타
                  </span>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comp.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                        cursor={{ fill: c["chart-grid"], fillOpacity: 0.4 }}
                        content={({ active, payload, label }) =>
                          active && payload?.length ? (
                            <ChartTooltip
                              title={`${label}년`}
                              rows={[...payload].reverse().map((p) => ({
                                label: p.dataKey === "other" ? "기타" : ctx.data.suppliers[Number(String(p.dataKey).slice(1))].name,
                                value: pct(p.value as number),
                                color: p.color,
                              }))}
                            />
                          ) : null
                        }
                      />
                      {comp.top.map((s, k) => (
                        <Bar
                          isAnimationActive={false}
                          key={s}
                          dataKey={`s${s}`}
                          stackId="a"
                          fill={c[SERIES[k]]}
                          stroke={c["chart-surface"]}
                          strokeWidth={2}
                          maxBarSize={40}
                        />
                      ))}
                      <Bar
                        isAnimationActive={false}
                        dataKey="other"
                        stackId="a"
                        fill={c["series-other"]}
                        stroke={c["chart-surface"]}
                        strokeWidth={2}
                        maxBarSize={40}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>완제품 vs 부품 집중도</CardTitle>
            <CardDescription>{periodLabel}년 · 대분류별 공급 구조 비교</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>지표</TH>
                  {l1Rows.map((r) => (
                    <TH key={r.l1} className="text-right">
                      {r.l1}
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {[
                  { k: "매입액", f: (r: (typeof l1Rows)[number]) => eok(r.total) },
                  { k: "품목군 수", f: (r: (typeof l1Rows)[number]) => `${r.n}개` },
                  { k: "1위 업체 비중 (금액 가중 평균)", f: (r: (typeof l1Rows)[number]) => pct(r.weighted) },
                  { k: `1위 비중 ${th * 100}% 이상 품목군`, f: (r: (typeof l1Rows)[number]) => `${r.conc}개` },
                  { k: "단일 공급 품목군", f: (r: (typeof l1Rows)[number]) => `${r.sole}개` },
                  { k: "평균 공급사 수", f: (r: (typeof l1Rows)[number]) => `${r.avg.toFixed(1)}곳` },
                ].map((row) => (
                  <TR key={row.k}>
                    <TD className="text-muted-foreground">{row.k}</TD>
                    {l1Rows.map((r) => (
                      <TD key={r.l1} className="tabular text-right font-medium">
                        {row.f(r)}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <InsightPanel insights={insights} />
    </div>
  );
}
