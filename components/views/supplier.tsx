"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "../ui";
import { ChartTooltip, CriteriaDots, DependencyBadge, InsightPanel, KpiTile, useChartColors } from "../parts";
import { alternatives, dependencyRanking, supplierItems, type Context, type PeriodMetrics } from "@/lib/metrics";
import { supplierInsights } from "@/lib/insights";
import { eok, pct, pp, signedPct, won } from "@/lib/format";

interface Props {
  ctx: Context;
  pm: PeriodMetrics;
  cur: PeriodMetrics;
  prev: PeriodMetrics | null;
  supplierIdx: number | null;
  onOpenSupplier: (s: number) => void;
}

export default function SupplierView({ ctx, pm, cur, prev, supplierIdx, onOpenSupplier }: Props) {
  const ranking = React.useMemo(() => dependencyRanking(pm, "전체"), [pm]);
  const s = supplierIdx ?? ranking[0]?.s ?? null;
  const m = s !== null ? pm.bySupplier.get(s) : undefined;

  if (s === null) return <p className="py-16 text-center text-sm text-muted-foreground">협력사를 선택하십시오.</p>;
  if (!m) {
    const sup = ctx.data.suppliers[s];
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {sup.name}({sup.k})은(는) 현재 필터 조건에서 매입 실적이 없습니다. 연도·품목군 필터를 확인하십시오.
      </p>
    );
  }
  return <Detail key={s} ctx={ctx} pm={pm} cur={cur} prev={prev} s={s} onOpenSupplier={onOpenSupplier} picked={supplierIdx !== null} />;
}

function Detail({
  ctx,
  pm,
  cur,
  prev,
  s,
  onOpenSupplier,
  picked,
}: Omit<Props, "supplierIdx"> & { s: number; picked: boolean }) {
  const c = useChartColors();
  const r = ctx.rules;
  const m = pm.bySupplier.get(s)!;
  const sup = ctx.data.suppliers[s];
  const repCatName = ctx.data.categories[m.repCat].l2;

  const rankByAmt = pm.suppliers.findIndex((x) => x.s === s) + 1;
  const cagrs = pm.suppliers.filter((x) => x.rankable && x.cagr !== null).map((x) => x.cagr!);
  const avgCagr = cagrs.length ? cagrs.reduce((a, b) => a + b, 0) / cagrs.length : null;

  const yearly = pm.years.map((y) => ({ year: String(y), amt: m.byYear.get(y) ?? 0, share: m.catShareByYear.get(y) ?? 0 }));
  const cats = [...m.categories.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, v]) => ({ name: ctx.data.categories[cat].l2, cat, v }));

  const items = React.useMemo(() => supplierItems(ctx, pm, s), [ctx, pm, s]);
  const [showAllItems, setShowAllItems] = React.useState(false);
  const shownItems = showAllItems ? items : items.slice(0, 15);

  const [altCat, setAltCat] = React.useState(m.repCat);
  const alts = React.useMemo(() => alternatives(ctx, pm, s, altCat), [ctx, pm, s, altCat]);
  const insights = React.useMemo(() => supplierInsights(ctx, pm, m, cur, prev), [ctx, pm, m, cur, prev]);
  const periodLabel = `${pm.years[0]}~${pm.years[pm.years.length - 1]}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-lg font-semibold">{m.name}</h2>
        <span className="text-[13px] text-muted-foreground">
          {sup.k} · {sup.status} · 거래 {sup.first}~{sup.last}
        </span>
        <DependencyBadge m={m} min={r.highDependencyMinCriteria} />
        <CriteriaDots m={m} />
        {!picked && <Badge tone="muted">의존도 1위 업체 자동 선택 · 상단 검색으로 변경</Badge>}
      </div>
      {sup.aliases.length > 0 && (
        <p className="-mt-3 text-xs text-muted-foreground">표기 통합: {sup.aliases.join(" · ")}</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label={`누적 순매입액 (${periodLabel})`}
          value={eok(m.total)}
          context={`전체 ${pm.suppliers.length}개사 중 ${rankByAmt}위 · 전체 매입의 ${pct(m.total / pm.total)}`}
          source="Σ금액 (반품·소급정산 포함)"
        />
        <KpiTile
          label="연평균 성장률(CAGR)"
          value={m.cagr === null ? "산출 불가" : signedPct(m.cagr)}
          delta={m.cagr !== null && avgCagr !== null ? `전체 평균 대비 ${pp(m.cagr - avgCagr)}` : undefined}
          deltaValue={null}
          context={
            m.cagr === null
              ? "거래 연도 2개 미만 또는 시작·종료 매입 ≤ 0"
              : `${m.cagrPartial ? "거래 기간 기준 · " : ""}전체 평균 ${signedPct(avgCagr)}`
          }
          source="(최종 연도 ÷ 최초 연도)^(1/연수) − 1"
        />
        <KpiTile
          label={`${repCatName} 내 매입 비중`}
          value={pct(m.catShare)}
          delta={`기준 ${r.categoryShareThreshold * 100}% 대비 ${pp(m.catShare - r.categoryShareThreshold)}`}
          deltaValue={m.catShare - r.categoryShareThreshold}
          direction="upBad"
          context="대표 품목군(매입액 최대) 기준"
          source="협력사 품목군 매입 ÷ 품목군 전체"
        />
        <KpiTile
          label="단독 공급 품번"
          value={`${m.singleItems}개 / ${m.items}개`}
          delta={`매입 비중 ${pct(m.singleShare)} (기준 ${r.singleSourceShareThreshold * 100}%)`}
          deltaValue={m.singleShare - r.singleSourceShareThreshold}
          direction="upBad"
          context={`단독 공급 매입 ${eok(m.singleAmt)}`}
          source="기간 내 공급사 1곳인 품번"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>연도별 순매입액</CardTitle>
            <CardDescription>{periodLabel}년 · 억원</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearly} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={c["chart-grid"]} vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: c["chart-axis"], fontSize: 11 }} stroke={c["chart-grid"]} />
                  <YAxis
                    tickFormatter={(v) => eok(v, 0)}
                    tick={{ fill: c["chart-axis"], fontSize: 11 }}
                    stroke={c["chart-grid"]}
                    width={48}
                  />
                  <Tooltip
                    cursor={{ fill: c["chart-grid"], fillOpacity: 0.4 }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <ChartTooltip title={`${label}년`} rows={[{ label: "순매입액", value: eok(payload[0].value as number) }]} />
                      ) : null
                    }
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="amt"
                    fill={c["series-1"]}
                    maxBarSize={24}
                    radius={[4, 4, 0, 0]}
                    label={{ position: "top", fontSize: 11, fill: c["muted-foreground"], formatter: (v: unknown) => eok(Number(v), 1) }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{repCatName} 내 비중 추이</CardTitle>
            <CardDescription>연도별 협력사 매입 ÷ 품목군 전체 · 점선은 기준 {r.categoryShareThreshold * 100}%</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={yearly} margin={{ top: 20, right: 24, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={c["chart-grid"]} vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: c["chart-axis"], fontSize: 11 }} stroke={c["chart-grid"]} />
                  <YAxis
                    domain={[0, 1]}
                    tickFormatter={(v) => `${Math.round(v * 100)}%`}
                    tick={{ fill: c["chart-axis"], fontSize: 11 }}
                    stroke={c["chart-grid"]}
                    width={44}
                  />
                  <ReferenceLine y={r.categoryShareThreshold} stroke={c["status-critical"]} strokeDasharray="4 4" />
                  <Tooltip
                    cursor={{ stroke: c["chart-axis"], strokeWidth: 1 }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <ChartTooltip title={`${label}년`} rows={[{ label: "품목군 내 비중", value: pct(payload[0].value as number) }]} />
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
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>공급 품목군 구성</CardTitle>
            <CardDescription>{periodLabel}년 누적 매입액</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ height: Math.max(120, cats.length * 34 + 20) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cats} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={170}
                    tick={{ fill: c["foreground"], fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: c["chart-grid"], fillOpacity: 0.4 }}
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <ChartTooltip
                          title={String(payload[0].payload.name)}
                          rows={[
                            { label: "매입액", value: eok(payload[0].value as number) },
                            { label: "업체 내 비중", value: pct((payload[0].value as number) / m.total) },
                          ]}
                        />
                      ) : null
                    }
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="v"
                    fill={c["series-1"]}
                    maxBarSize={20}
                    radius={[0, 4, 4, 0]}
                    label={{ position: "right", fontSize: 11, fill: c["muted-foreground"], formatter: (v: unknown) => eok(Number(v)) }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>대체 후보 협력사</CardTitle>
                <CardDescription>같은 품목군에서 거래 이력이 있는 업체 · 공통 품번 = 이 업체와 같은 품번을 공급한 수</CardDescription>
              </div>
              <select
                aria-label="대체 후보 품목군"
                value={altCat}
                onChange={(e) => setAltCat(Number(e.target.value))}
                className="h-8 rounded-md border bg-card px-2 text-[13px]"
              >
                {cats.map((x) => (
                  <option key={x.cat} value={x.cat}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {alts.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted-foreground">
                이 품목군에는 거래 이력이 있는 다른 업체가 없습니다. 신규 업체 발굴이 필요합니다.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>협력사</TH>
                    <TH>거래 상태</TH>
                    <TH className="text-right">매입액</TH>
                    <TH className="text-right">품목군 내 비중</TH>
                    <TH className="text-right">공통 품번</TH>
                    <TH className="text-right">최근 거래</TH>
                  </TR>
                </THead>
                <TBody>
                  {alts.slice(0, 10).map((a) => (
                    <TR key={a.s} className="cursor-pointer hover:bg-accent" onClick={() => onOpenSupplier(a.s)}>
                      <TD className="font-medium">{a.name}</TD>
                      <TD>
                        <Badge tone={a.status === "중단" ? "muted" : "outline"}>{a.status}</Badge>
                      </TD>
                      <TD className="tabular text-right">{eok(a.amt)}</TD>
                      <TD className="tabular text-right">{pct(a.share)}</TD>
                      <TD className="tabular text-right">{a.commonItems}</TD>
                      <TD className="tabular text-right">{a.last}년</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>품번별 상세</CardTitle>
              <CardDescription>
                매입액·공급사 수·연도별 평균 단가(원) · 단가는 수량·단가 0인 행(소급정산·무상) 제외 · 총 {items.length}개 품번
              </CardDescription>
            </div>
            {items.length > 15 && (
              <Button variant="outline" size="sm" onClick={() => setShowAllItems((v) => !v)}>
                {showAllItems ? "상위 15개만" : `전체 ${items.length}개 보기`}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>품번</TH>
                <TH>품명</TH>
                <TH>품목군</TH>
                <TH className="text-right">매입액(원)</TH>
                <TH>공급</TH>
                {pm.years.map((y) => (
                  <TH key={y} className="text-right">
                    {y}
                  </TH>
                ))}
                <TH className="text-right">단가 변동</TH>
              </TR>
            </THead>
            <TBody>
              {shownItems.map((it) => (
                <TR key={it.i}>
                  <TD className="tabular whitespace-nowrap">{it.code}</TD>
                  <TD className="max-w-56 truncate" title={it.name}>
                    {it.name}
                  </TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{it.cat}</TD>
                  <TD className="tabular text-right">{won(it.amt)}</TD>
                  <TD>
                    {it.suppliers <= 1 ? (
                      <Badge tone="critical">단독</Badge>
                    ) : (
                      <Badge tone="muted">{it.suppliers}곳</Badge>
                    )}
                  </TD>
                  {it.prices.map((p, k) => (
                    <TD key={k} className="tabular text-right text-muted-foreground">
                      {p === null ? "–" : won(p)}
                    </TD>
                  ))}
                  <TD className="tabular text-right">{signedPct(it.change)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <InsightPanel insights={insights} />
    </div>
  );
}
