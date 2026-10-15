export type SupplierStatus = "지속" | "신규" | "중단";

export interface Supplier {
  k: string;
  code: string;
  name: string;
  aliases: string[];
  first: number;
  last: number;
  status: SupplierStatus;
}

export interface Item {
  c: string; // 품번
  n: string; // 품명
  s: string; // 규격
  cat: number; // categories index
}

export interface Category {
  l1: "완제품" | "부품";
  l2: string;
}

/** [supplierIdx, itemIdx, year, quarter, amount, validQty, validValue] */
export type Fact = [number, number, number, number, number, number, number];

export interface PurchaseData {
  suppliers: Supplier[];
  items: Item[];
  categories: Category[];
  facts: Fact[];
}

export interface Rules {
  version: string;
  categoryShareThreshold: number;
  singleSourceShareThreshold: number;
  trendYears: number;
  trendMinShare: number;
  weights: { categoryShare: number; singleSourceShare: number; trend: number };
  highDependencyMinCriteria: number;
  rankingMinAmount: number;
  insight: { yoyAnomaly: number; yoyAnomalyMinAmount: number; alternativeMaxShare: number };
}

export interface Meta {
  builtAt: string;
  period: { from: string; to: string };
  years: number[];
  rows: number;
  sources: { file: string; rows: number; sha256: string }[];
  validation: { year: number; source: number; built: number; ok: boolean }[];
  mapping: { version: string; isDraft: boolean; unmappedItems: number; unmappedAmount: number };
  rules: Rules;
}

export type SupplyFilter = "전체" | "단독" | "복수";
export type StatusFilter = "전체" | SupplierStatus;
export type L1Filter = "전체" | "완제품" | "부품";

export interface Filters {
  years: number[];
  quarters: number[];
  l1: L1Filter;
  l2: string; // "전체" or category l2
  supply: SupplyFilter;
  status: StatusFilter;
}

export type ViewKey = "overview" | "supplier" | "category";

export interface Insight {
  kind: "추세 경고" | "이상 탐지" | "기회 발견";
  text: string;
  basis: string;
}
