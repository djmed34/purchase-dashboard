import type { Fact, Filters, PurchaseData, Rules, SupplierStatus } from "./types";

/**
 * 계산 규칙은 PRD Section 1(의존도 기준)·Section 3(지표 계산 규칙)을 따른다.
 * - 매입액: 순매입액(반품·차감·소급정산 포함)
 * - 품목군 내 비중: 협력사의 대표 품목군(매입액 최대) 기준
 * - 단독 공급: 해당 기간 내 공급사가 1곳인 품번
 * - 비중 추세: 대표 품목군 비중이 최근 N개 연도 연속 상승
 */

export interface Context {
  data: PurchaseData;
  rules: Rules;
  filters: Filters;
  /** 분기·품목군 필터만 적용된 행 (연도·공급형태는 계산 시점에 적용) */
  rows: Fact[];
  allYears: number[];
}

export function buildContext(data: PurchaseData, rules: Rules, filters: Filters, allYears: number[]): Context {
  const q = new Set(filters.quarters);
  const catOk = data.categories.map(
    (c) => (filters.l1 === "전체" || c.l1 === filters.l1) && (filters.l2 === "전체" || c.l2 === filters.l2),
  );
  const rows = data.facts.filter((f) => q.has(f[3]) && catOk[data.items[f[1]].cat]);
  return { data, rules, filters, rows, allYears };
}

const add = <K>(m: Map<K, number>, k: K, v: number) => m.set(k, (m.get(k) ?? 0) + v);

function nested<K1, K2>(m: Map<K1, Map<K2, number>>, k1: K1, k2: K2, v: number) {
  let inner = m.get(k1);
  if (!inner) m.set(k1, (inner = new Map()));
  add(inner, k2, v);
}

/** 기간 내 품번별 공급사 수 (금액≠0 거래 기준) */
function itemSupplierCount(rows: Fact[]): Map<number, number> {
  const sets = new Map<number, Set<number>>();
  for (const f of rows) {
    if (f[4] === 0) continue;
    let s = sets.get(f[1]);
    if (!s) sets.set(f[1], (s = new Set()));
    s.add(f[0]);
  }
  const out = new Map<number, number>();
  sets.forEach((s, k) => out.set(k, s.size));
  return out;
}

/** 연도 집합 + 공급형태 필터 적용 */
export function periodRows(ctx: Context, years: number[]) {
  const ys = new Set(years);
  let rows = ctx.rows.filter((f) => ys.has(f[2]));
  const supCount = itemSupplierCount(rows);
  if (ctx.filters.supply !== "전체") {
    const single = ctx.filters.supply === "단독";
    rows = rows.filter((f) => ((supCount.get(f[1]) ?? 0) <= 1) === single);
  }
  return { rows, supCount };
}

export interface SupplierMetric {
  s: number;
  name: string;
  code: string;
  status: SupplierStatus;
  total: number;
  byYear: Map<number, number>;
  repCat: number;
  catShare: number;
  catShareByYear: Map<number, number>;
  trendUp: boolean;
  trendSeries: number[];
  singleAmt: number;
  singleShare: number;
  singleItems: number;
  items: number;
  cagr: number | null;
  cagrPartial: boolean;
  score: number;
  criteria: { share: boolean; single: boolean; trend: boolean };
  criteriaMet: number;
  high: boolean;
  rankable: boolean;
  categories: Map<number, number>;
}

export interface PeriodMetrics {
  years: number[];
  total: number;
  totalByYear: Map<number, number>;
  catTotal: Map<number, number>;
  catByYear: Map<number, Map<number, number>>;
  suppliers: SupplierMetric[];
  bySupplier: Map<number, SupplierMetric>;
  singleAmt: number;
  supCount: Map<number, number>;
  rows: Fact[];
}

function cagrOf(byYear: Map<number, number>, years: number[]) {
  const active = years.filter((y) => (byYear.get(y) ?? 0) !== 0);
  if (active.length < 2) return { cagr: null, partial: false };
  const y0 = active[0];
  const y1 = active[active.length - 1];
  const a0 = byYear.get(y0)!;
  const a1 = byYear.get(y1)!;
  const partial = y0 !== years[0] || y1 !== years[years.length - 1];
  if (a0 <= 0 || a1 <= 0 || y1 === y0) return { cagr: null, partial };
  return { cagr: Math.pow(a1 / a0, 1 / (y1 - y0)) - 1, partial };
}

/** 대표 품목군 기준 최근 N개 연도 비중 (기간 필터와 무관하게 마지막 선택 연도에서 거꾸로) */
function trendYears(ctx: Context, endYear: number) {
  const n = ctx.rules.trendYears;
  return ctx.allYears.filter((y) => y <= endYear).slice(-n);
}

export function computePeriod(ctx: Context, years: number[]): PeriodMetrics {
  const sorted = [...years].sort((a, b) => a - b);
  const { rows, supCount } = periodRows(ctx, sorted);
  const { suppliers: sMaster } = ctx.data;
  const r = ctx.rules;

  const totalByYear = new Map<number, number>();
  const catTotal = new Map<number, number>();
  const catByYear = new Map<number, Map<number, number>>();
  const supCat = new Map<number, Map<number, number>>();
  const supYear = new Map<number, Map<number, number>>();
  const supSingle = new Map<number, number>();
  const supItems = new Map<number, Set<number>>();
  const supCatYear = new Map<string, number>(); // `${s}|${cat}|${y}`
  let total = 0;
  let singleAmt = 0;

  for (const f of rows) {
    const [s, i, y, , amt] = f;
    const cat = ctx.data.items[i].cat;
    total += amt;
    add(totalByYear, y, amt);
    add(catTotal, cat, amt);
    nested(catByYear, cat, y, amt);
    nested(supCat, s, cat, amt);
    nested(supYear, s, y, amt);
    add(supCatYear, `${s}|${cat}|${y}`, amt);
    if ((supCount.get(i) ?? 0) <= 1) {
      add(supSingle, s, amt);
      singleAmt += amt;
    }
    if (amt !== 0) {
      let set = supItems.get(s);
      if (!set) supItems.set(s, (set = new Set()));
      set.add(i);
    }
  }

  // 추세용: 선택 연도와 무관하게 마지막 연도 기준 최근 N년 (분기·품목군 필터는 유지)
  const tYears = trendYears(ctx, sorted[sorted.length - 1]);
  const tSet = new Set(tYears);
  const tCat = new Map<number, Map<number, number>>(); // cat -> year -> amt
  const tSupCat = new Map<string, number>(); // `${s}|${cat}|${y}`
  for (const f of ctx.rows) {
    if (!tSet.has(f[2])) continue;
    const cat = ctx.data.items[f[1]].cat;
    nested(tCat, cat, f[2], f[4]);
    const key = `${f[0]}|${cat}|${f[2]}`;
    tSupCat.set(key, (tSupCat.get(key) ?? 0) + f[4]);
  }

  const suppliers: SupplierMetric[] = [];
  supYear.forEach((byYear, s) => {
    const sTotal = [...byYear.values()].reduce((a, b) => a + b, 0);
    const cats = supCat.get(s)!;
    let repCat = -1;
    let best = -Infinity;
    cats.forEach((v, c) => {
      if (v > best) {
        best = v;
        repCat = c;
      }
    });
    const catAmt = catTotal.get(repCat) ?? 0;
    const catShare = catAmt > 0 ? Math.max(0, best) / catAmt : 0;

    const catShareByYear = new Map<number, number>();
    for (const y of sorted) {
      const cy = catByYear.get(repCat)?.get(y) ?? 0;
      const sv = supCatYear.get(`${s}|${repCat}|${y}`) ?? 0;
      catShareByYear.set(y, cy > 0 ? Math.max(0, sv) / cy : 0);
    }

    const trendSeries = tYears.map((y) => {
      const cy = tCat.get(repCat)?.get(y) ?? 0;
      const sv = tSupCat.get(`${s}|${repCat}|${y}`) ?? 0;
      return cy > 0 ? Math.max(0, sv) / cy : 0;
    });
    // 비중이 미미한 업체의 상승(예: 1→1→2%)은 의존이 아니므로 최소 비중 이상일 때만 인정
    const trendUp =
      trendSeries.length >= r.trendYears &&
      trendSeries[trendSeries.length - 1] >= r.trendMinShare &&
      trendSeries.every((v, i) => i === 0 || v > trendSeries[i - 1]);

    const sSingle = supSingle.get(s) ?? 0;
    const singleShare = sTotal > 0 ? Math.min(1, Math.max(0, sSingle / sTotal)) : 0;
    const itemSet = supItems.get(s) ?? new Set<number>();
    let singleItems = 0;
    itemSet.forEach((i) => {
      if ((supCount.get(i) ?? 0) <= 1) singleItems++;
    });

    const { cagr, partial } = cagrOf(byYear, sorted);
    const criteria = {
      share: catShare >= r.categoryShareThreshold,
      single: singleShare >= r.singleSourceShareThreshold,
      trend: trendUp,
    };
    const criteriaMet = Number(criteria.share) + Number(criteria.single) + Number(criteria.trend);
    const score =
      100 *
      (r.weights.categoryShare * catShare + r.weights.singleSourceShare * singleShare + r.weights.trend * Number(trendUp));
    const m = sMaster[s];
    suppliers.push({
      s,
      name: m.name,
      code: m.code,
      status: m.status,
      total: sTotal,
      byYear,
      repCat,
      catShare,
      catShareByYear,
      trendUp,
      trendSeries,
      singleAmt: sSingle,
      singleShare,
      singleItems,
      items: itemSet.size,
      cagr,
      cagrPartial: partial,
      score,
      criteria,
      criteriaMet,
      high: criteriaMet >= r.highDependencyMinCriteria && sTotal >= r.rankingMinAmount,
      rankable: sTotal >= r.rankingMinAmount,
      categories: cats,
    });
  });

  suppliers.sort((a, b) => b.total - a.total);
  const bySupplier = new Map(suppliers.map((m) => [m.s, m]));
  return { years: sorted, total, totalByYear, catTotal, catByYear, suppliers, bySupplier, singleAmt, supCount, rows };
}

/** 의존도 순위: 최소 매입액 이상 + 거래상태 필터, 점수 내림차순 */
export function dependencyRanking(pm: PeriodMetrics, status: Filters["status"]) {
  return pm.suppliers
    .filter((m) => m.rankable && (status === "전체" || m.status === status))
    .sort((a, b) => b.score - a.score || b.total - a.total);
}

/** 연도별 상위 N개사 집중도 */
export function topNConcentration(pm: PeriodMetrics, n = 10) {
  return pm.years.map((y) => {
    const amts = pm.suppliers.map((m) => m.byYear.get(y) ?? 0).sort((a, b) => b - a);
    const tot = pm.totalByYear.get(y) ?? 0;
    const top = amts.slice(0, n).reduce((a, b) => a + b, 0);
    return { year: y, share: tot > 0 ? top / tot : 0 };
  });
}

export interface CategoryMetric {
  cat: number;
  l1: string;
  l2: string;
  total: number;
  suppliers: number;
  top: { s: number; name: string; share: number } | null;
  topShareByYear: { year: number; share: number; s: number | null }[];
  topShareTrendUp: boolean;
}

export function categoryMetrics(ctx: Context, pm: PeriodMetrics): CategoryMetric[] {
  const perCat = new Map<number, Map<number, number>>(); // cat -> s -> amt
  const perCatYear = new Map<string, Map<number, number>>(); // `${cat}|${y}` -> s -> amt
  for (const f of pm.rows) {
    const cat = ctx.data.items[f[1]].cat;
    nested(perCat, cat, f[0], f[4]);
    nested(perCatYear, `${cat}|${f[2]}`, f[0], f[4]);
  }
  const out: CategoryMetric[] = [];
  perCat.forEach((sm, cat) => {
    const total = [...sm.values()].reduce((a, b) => a + b, 0);
    const active = [...sm.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const c = ctx.data.categories[cat];
    const topShareByYear = pm.years.map((y) => {
      const ym = perCatYear.get(`${cat}|${y}`);
      if (!ym) return { year: y, share: 0, s: null };
      const ytot = [...ym.values()].reduce((a, b) => a + b, 0);
      const best = [...ym.entries()].sort((a, b) => b[1] - a[1])[0];
      return { year: y, share: ytot > 0 ? Math.max(0, best[1]) / ytot : 0, s: best[0] };
    });
    const last = topShareByYear.slice(-ctx.rules.trendYears);
    out.push({
      cat,
      l1: c.l1,
      l2: c.l2,
      total,
      suppliers: active.length,
      top: active.length
        ? { s: active[0][0], name: ctx.data.suppliers[active[0][0]].name, share: total > 0 ? active[0][1] / total : 0 }
        : null,
      topShareByYear,
      topShareTrendUp:
        last.length >= ctx.rules.trendYears && last.every((v, i) => i === 0 || v.share > last[i - 1].share),
    });
  });
  return out.sort((a, b) => (b.top?.share ?? 0) - (a.top?.share ?? 0) || b.total - a.total);
}

/** 품목군 내 협력사 구성 (상위 N + 기타) 연도별 비중 */
export function categoryComposition(ctx: Context, pm: PeriodMetrics, cat: number, n = 5) {
  const byS = new Map<number, number>();
  const byYS = new Map<number, Map<number, number>>();
  for (const f of pm.rows) {
    if (ctx.data.items[f[1]].cat !== cat) continue;
    add(byS, f[0], f[4]);
    nested(byYS, f[2], f[0], f[4]);
  }
  const top = [...byS.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([s]) => s);
  const rows = pm.years.map((y) => {
    const m = byYS.get(y) ?? new Map<number, number>();
    const tot = [...m.values()].reduce((a, b) => a + b, 0);
    const row: Record<string, number | string> = { year: String(y) };
    let rest = tot;
    for (const s of top) {
      const v = Math.max(0, m.get(s) ?? 0);
      row[`s${s}`] = tot > 0 ? v / tot : 0;
      rest -= v;
    }
    row.other = tot > 0 ? Math.max(0, rest) / tot : 0;
    return row;
  });
  return { top, rows };
}

/** 협력사 품번 상세 */
export function supplierItems(ctx: Context, pm: PeriodMetrics, s: number) {
  const map = new Map<number, { amt: number; byYear: Map<number, { q: number; v: number }> }>();
  for (const f of pm.rows) {
    if (f[0] !== s) continue;
    let e = map.get(f[1]);
    if (!e) map.set(f[1], (e = { amt: 0, byYear: new Map() }));
    e.amt += f[4];
    const p = e.byYear.get(f[2]) ?? { q: 0, v: 0 };
    p.q += f[5];
    p.v += f[6];
    e.byYear.set(f[2], p);
  }
  return [...map.entries()]
    .map(([i, e]) => {
      const it = ctx.data.items[i];
      const prices = pm.years.map((y) => {
        const p = e.byYear.get(y);
        return p && p.q > 0 ? p.v / p.q : null;
      });
      const valid = prices.filter((p): p is number => p !== null);
      const change = valid.length >= 2 ? valid[valid.length - 1] / valid[0] - 1 : null;
      return {
        i,
        code: it.c,
        name: it.n,
        cat: ctx.data.categories[it.cat].l2,
        amt: e.amt,
        suppliers: pm.supCount.get(i) ?? 0,
        prices,
        change,
      };
    })
    .sort((a, b) => b.amt - a.amt);
}

/** 대체 후보: 같은 품목군에서 거래 이력이 있는 다른 협력사 */
export function alternatives(ctx: Context, pm: PeriodMetrics, s: number, cat: number) {
  const target = new Set<number>();
  const byS = new Map<number, { amt: number; items: Set<number>; last: number }>();
  for (const f of pm.rows) {
    if (ctx.data.items[f[1]].cat !== cat) continue;
    if (f[0] === s) {
      if (f[4] !== 0) target.add(f[1]);
      continue;
    }
    let e = byS.get(f[0]);
    if (!e) byS.set(f[0], (e = { amt: 0, items: new Set(), last: 0 }));
    e.amt += f[4];
    if (f[4] !== 0) {
      e.items.add(f[1]);
      e.last = Math.max(e.last, f[2]);
    }
  }
  const catAmt = pm.catTotal.get(cat) ?? 0;
  return [...byS.entries()]
    .filter(([, e]) => e.amt > 0)
    .map(([alt, e]) => {
      let common = 0;
      e.items.forEach((i) => {
        if (target.has(i)) common++;
      });
      const sup = ctx.data.suppliers[alt];
      return {
        s: alt,
        name: sup.name,
        status: sup.status,
        amt: e.amt,
        share: catAmt > 0 ? e.amt / catAmt : 0,
        last: e.last,
        commonItems: common,
        items: e.items.size,
      };
    })
    .sort((a, b) => b.amt - a.amt);
}
