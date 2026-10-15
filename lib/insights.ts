import { alternatives, type CategoryMetric, type Context, type PeriodMetrics, type SupplierMetric } from "./metrics";
import { eok, pct, signedPct } from "./format";
import type { Insight } from "./types";

/**
 * PRD 4장 AI 인사이트 제안 패널 — 규칙 기반 탐지, 제안 톤, 참조 수치 명시, View당 최대 3개.
 */

const seq = (xs: number[]) => xs.map((v) => `${(v * 100).toFixed(0)}`).join("→") + "%";

function trendInsight(ctx: Context, m: SupplierMetric, endYear: number): Insight {
  const cat = ctx.data.categories[m.repCat].l2;
  const ys = ctx.allYears.filter((y) => y <= endYear).slice(-ctx.rules.trendYears);
  return {
    kind: "추세 경고",
    text: `${m.name}의 [${cat}] 비중이 ${ys.length}년 연속 상승했습니다 (${seq(m.trendSeries)}). 이원화 검토가 필요할 수 있습니다.`,
    basis: `${ys[0]}~${ys[ys.length - 1]}년 품목군 내 매입 비중`,
  };
}

function yoyInsight(ctx: Context, cur: PeriodMetrics, prev: PeriodMetrics, s: number): Insight | null {
  const a = cur.bySupplier.get(s)?.total ?? 0;
  const b = prev.bySupplier.get(s)?.total ?? 0;
  if (b <= 0) return null;
  const r = a / b - 1;
  if (Math.abs(r) < ctx.rules.insight.yoyAnomaly) return null;
  if (Math.max(a, b) < ctx.rules.insight.yoyAnomalyMinAmount) return null;
  const name = ctx.data.suppliers[s].name;
  return {
    kind: "이상 탐지",
    text:
      r > 0
        ? `${name} 매입이 ${signedPct(r, 0)} 늘었습니다. 물량 쏠림 여부를 확인해 볼 필요가 있습니다.`
        : `${name} 매입이 ${signedPct(r, 0)} 줄었습니다. 물량이 다른 업체로 이동했는지 확인해 볼 필요가 있습니다.`,
    basis: `${prev.years[0]}년 ${eok(b)} → ${cur.years[0]}년 ${eok(a)}`,
  };
}

function altInsight(ctx: Context, pm: PeriodMetrics, m: SupplierMetric): Insight | null {
  const maxShare = ctx.rules.insight.alternativeMaxShare;
  // 공통 품번이 있거나 의미 있는 규모(순위 기준 금액의 10% 이상)로 거래한 업체만 후보로 제안
  const minAmt = ctx.rules.rankingMinAmount * 0.1;
  const alts = alternatives(ctx, pm, m.s, m.repCat).filter(
    (a) => a.share < maxShare && a.status !== "중단" && (a.commonItems > 0 || a.amt >= minAmt),
  );
  if (!alts.length) return null;
  const best = [...alts].sort((a, b) => b.commonItems - a.commonItems || b.amt - a.amt)[0];
  const cat = ctx.data.categories[m.repCat].l2;
  return {
    kind: "기회 발견",
    text: `[${cat}] 대체 후보로 ${best.name}이(가) 있습니다 (비중 ${pct(best.share)}, 공통 품번 ${best.commonItems}개). 물량 확대를 검토해 볼 수 있습니다.`,
    basis: `${pm.years[0]}~${pm.years[pm.years.length - 1]}년 ${cat} 매입 ${eok(best.amt)}, 최근 거래 ${best.last}년`,
  };
}

export function overviewInsights(
  ctx: Context,
  pm: PeriodMetrics,
  ranking: SupplierMetric[],
  cur: PeriodMetrics | null,
  prev: PeriodMetrics | null,
): Insight[] {
  const out: Insight[] = [];
  const end = pm.years[pm.years.length - 1];
  const t = ranking.find((m) => m.trendUp && m.trendSeries[m.trendSeries.length - 1] >= ctx.rules.categoryShareThreshold);
  if (t) out.push(trendInsight(ctx, t, end));

  if (cur && prev) {
    const cands = ranking
      .map((m) => yoyInsight(ctx, cur, prev, m.s))
      .filter((x): x is Insight => x !== null);
    if (cands[0]) out.push(cands[0]);
  }

  const top = ranking[0];
  if (top) {
    const a = altInsight(ctx, pm, top);
    if (a) out.push(a);
  }
  return out.slice(0, 3);
}

export function supplierInsights(
  ctx: Context,
  pm: PeriodMetrics,
  m: SupplierMetric,
  cur: PeriodMetrics | null,
  prev: PeriodMetrics | null,
): Insight[] {
  const out: Insight[] = [];
  const end = pm.years[pm.years.length - 1];
  if (m.trendUp) out.push(trendInsight(ctx, m, end));
  if (cur && prev) {
    const y = yoyInsight(ctx, cur, prev, m.s);
    if (y) out.push(y);
  }
  const a = altInsight(ctx, pm, m);
  if (a) out.push(a);
  return out.slice(0, 3);
}

export function categoryInsights(ctx: Context, pm: PeriodMetrics, cats: CategoryMetric[]): Insight[] {
  const out: Insight[] = [];
  const th = ctx.rules.categoryShareThreshold;
  const rising = cats.find((c) => c.topShareTrendUp && (c.top?.share ?? 0) >= th);
  if (rising) {
    const last = rising.topShareByYear.slice(-ctx.rules.trendYears);
    out.push({
      kind: "추세 경고",
      text: `[${rising.l2}] 1위 업체 비중이 ${last.length}년 연속 상승했습니다 (${seq(last.map((x) => x.share))}). 공급 구조가 한 곳으로 쏠리고 있을 수 있습니다.`,
      basis: `${last[0].year}~${last[last.length - 1].year}년 품목군 1위 업체 비중`,
    });
  }
  const sole = cats.filter((c) => c.suppliers === 1).sort((a, b) => b.total - a.total)[0];
  if (sole) {
    out.push({
      kind: "이상 탐지",
      text: `[${sole.l2}]은(는) 공급사가 ${sole.top?.name} 1곳뿐입니다. 공급 중단 시 대체 경로가 없으므로 예비 공급처 확보를 검토해 볼 필요가 있습니다.`,
      basis: `${pm.years[0]}~${pm.years[pm.years.length - 1]}년 매입 ${eok(sole.total)}, 공급사 수 1`,
    });
  }
  const opp = cats
    .filter((c) => c.suppliers >= 2 && (c.top?.share ?? 0) >= th)
    .sort((a, b) => b.total - a.total)[0];
  if (opp && opp.top) {
    const m = pm.bySupplier.get(opp.top.s);
    const a = m ? altInsight(ctx, pm, { ...m, repCat: opp.cat }) : null;
    if (a) out.push(a);
  }
  return out.slice(0, 3);
}
