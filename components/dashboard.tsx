"use client";

import * as React from "react";
import { Badge, Button, ChipGroup, Segmented } from "./ui";
import { buildContext, computePeriod } from "@/lib/metrics";
import { cn, eok, won } from "@/lib/format";
import type { Filters, L1Filter, Meta, PurchaseData, StatusFilter, SupplyFilter, ViewKey } from "@/lib/types";
import OverviewView from "./views/overview";
import SupplierView from "./views/supplier";
import CategoryView from "./views/category";
import { useRouter } from "next/navigation";
import { AuthError, getSession, loadData, logout, type Loaded as LoadedData } from "@/lib/secure";

const VIEWS: { key: ViewKey; label: string; question: string }[] = [
  { key: "overview", label: "의존도 리스크 개요", question: "어느 협력사를 먼저 검토할 것인가" },
  { key: "supplier", label: "협력사 상세", question: "이 업체를 이원화해야 하는가" },
  { key: "category", label: "품목군 집중도", question: "어느 품목군이 공급 구조상 취약한가" },
];

function readHash(): { view: ViewKey; supplier: string | null } {
  if (typeof window === "undefined") return { view: "overview", supplier: null };
  const p = new URLSearchParams(window.location.hash.slice(1));
  const v = p.get("view") as ViewKey | null;
  return { view: v && VIEWS.some((x) => x.key === v) ? v : "overview", supplier: p.get("s") };
}

export default function Dashboard() {
  const router = useRouter();
  const [loaded, setLoaded] = React.useState<LoadedData | null>(null);
  const [user, setUser] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const session = getSession();
    loadData(session)
      .then((l) => {
        setUser(session?.u ?? null);
        setLoaded(l);
      })
      .catch((e) => {
        if (e instanceof AuthError) router.replace(session ? "/login/?expired=1" : "/login/");
        else setError(`데이터를 불러오지 못했습니다 (${e}). scripts/build_data.py 실행 여부를 확인하십시오.`);
      });
  }, [router]);

  const onLogout = React.useCallback(() => {
    logout();
    router.replace("/login/");
  }, [router]);

  if (error) return <div className="p-8 text-sm text-delta-down">{error}</div>;
  if (!loaded) return <div className="p-8 text-sm text-muted-foreground">데이터를 불러오는 중…</div>;
  return <Loaded data={loaded.data} meta={loaded.meta} mode={loaded.mode} user={user} onLogout={onLogout} />;
}

function Loaded({
  data,
  meta,
  mode,
  user,
  onLogout,
}: {
  data: PurchaseData;
  meta: Meta;
  mode: LoadedData["mode"];
  user: string | null;
  onLogout: () => void;
}) {
  const allYears = meta.years;
  const [filters, setFilters] = React.useState<Filters>({
    years: allYears,
    quarters: [1, 2, 3, 4],
    l1: "전체",
    l2: "전체",
    supply: "전체",
    status: "전체",
  });
  const [view, setView] = React.useState<ViewKey>("overview");
  const [supplierKey, setSupplierKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    const sync = () => {
      const h = readHash();
      setView(h.view);
      setSupplierKey(h.supplier);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = React.useCallback((v: ViewKey, s?: string | null) => {
    const p = new URLSearchParams({ view: v });
    if (s) p.set("s", s);
    window.location.hash = p.toString();
    window.scrollTo({ top: 0 });
  }, []);

  const openSupplier = React.useCallback(
    (idx: number) => navigate("supplier", data.suppliers[idx].k),
    [navigate, data.suppliers],
  );

  const ctx = React.useMemo(() => buildContext(data, meta.rules, filters, allYears), [data, meta.rules, filters, allYears]);
  const pm = React.useMemo(() => computePeriod(ctx, filters.years), [ctx, filters.years]);
  const endYear = filters.years[filters.years.length - 1];
  const cur = React.useMemo(() => computePeriod(ctx, [endYear]), [ctx, endYear]);
  const prev = React.useMemo(
    () => (allYears.includes(endYear - 1) ? computePeriod(ctx, [endYear - 1]) : null),
    [ctx, endYear, allYears],
  );

  const l2Options = React.useMemo(() => {
    const s = new Set(
      data.categories.filter((c) => filters.l1 === "전체" || c.l1 === filters.l1).map((c) => c.l2),
    );
    return ["전체", ...[...s].sort((a, b) => a.localeCompare(b, "ko"))];
  }, [data.categories, filters.l1]);

  const supplierIdx = React.useMemo(() => {
    if (!supplierKey) return null;
    const i = data.suppliers.findIndex((s) => s.k === supplierKey);
    return i >= 0 ? i : null;
  }, [supplierKey, data.suppliers]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const filtered =
    filters.years.length !== allYears.length ||
    filters.quarters.length !== 4 ||
    filters.l1 !== "전체" ||
    filters.l2 !== "전체" ||
    filters.supply !== "전체" ||
    filters.status !== "전체";

  const built = new Date(meta.builtAt);
  const builtStr = `${built.getFullYear()}-${String(built.getMonth() + 1).padStart(2, "0")}-${String(built.getDate()).padStart(2, "0")}`;
  const validOk = meta.validation.every((v) => v.ok);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b py-5">
        <div>
          <h1 className="text-xl font-semibold">협력사 의존도</h1>
          <p className="text-[13px] text-muted-foreground">
            5년간 매입현황 기반 이원화(대체 업체 발굴) 검토 · 분석용
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>
            데이터 기준: {meta.period.from} ~ {meta.period.to} 입고 · {meta.rows.toLocaleString()}행 · 빌드 {builtStr}
          </span>
          <Badge tone={validOk ? "good" : "critical"}>{validOk ? "✓ 원본 합계 일치" : "✕ 합계 불일치"}</Badge>
          {meta.mapping.isDraft && <Badge tone="warning">◐ 품목군 매핑 초안</Badge>}
          <Badge tone="outline">사내 기밀 · 외부 공유 금지</Badge>
          {mode === "plain" && <Badge tone="critical">✕ 평문 개발 모드 · 게시 금지</Badge>}
          {user && (
            <span className="ml-1 flex items-center gap-1.5 border-l pl-2.5">
              <span className="text-foreground">{user}</span>
              <Button variant="outline" size="sm" onClick={onLogout}>
                로그아웃
              </Button>
            </span>
          )}
        </div>
      </header>

      <nav className="mt-4 flex flex-wrap gap-1 border-b" aria-label="화면 전환">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => navigate(v.key, v.key === "supplier" ? supplierKey : null)}
            aria-current={view === v.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-left transition-colors",
              view === v.key ? "border-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <div className="text-sm font-medium">{v.label}</div>
            <div className="hidden text-[11px] text-muted-foreground sm:block">{v.question}</div>
          </button>
        ))}
      </nav>

      {/* 필터 — 차트 위 한 줄 */}
      <section
        aria-label="필터"
        className="sticky top-0 z-10 -mx-4 mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
      >
        <FilterItem label="연도">
          <ChipGroup label="연도" values={filters.years} options={allYears} onChange={(v) => set("years", v)} />
        </FilterItem>
        <FilterItem label="분기">
          <ChipGroup
            label="분기"
            values={filters.quarters}
            options={[1, 2, 3, 4]}
            onChange={(v) => set("quarters", v)}
            format={(q) => `${q}Q`}
          />
        </FilterItem>
        <FilterItem label="대분류">
          <Segmented<L1Filter>
            label="대분류"
            value={filters.l1}
            options={["전체", "완제품", "부품"]}
            onChange={(v) => setFilters((f) => ({ ...f, l1: v, l2: "전체" }))}
          />
        </FilterItem>
        <FilterItem label="품목군">
          <select
            aria-label="품목군"
            value={filters.l2}
            onChange={(e) => set("l2", e.target.value)}
            className="h-8 rounded-md border bg-card px-2 text-[13px]"
          >
            {l2Options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </FilterItem>
        <FilterItem label="공급 형태">
          <Segmented<SupplyFilter>
            label="공급 형태"
            value={filters.supply}
            options={["전체", "단독", "복수"]}
            onChange={(v) => set("supply", v)}
          />
        </FilterItem>
        {view === "overview" && (
          <FilterItem label="거래 상태">
            <Segmented<StatusFilter>
              label="거래 상태"
              value={filters.status}
              options={["전체", "지속", "신규", "중단"]}
              onChange={(v) => set("status", v)}
            />
          </FilterItem>
        )}
        <FilterItem label="협력사">
          <SupplierSearch data={data} onPick={openSupplier} />
        </FilterItem>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setFilters({ years: allYears, quarters: [1, 2, 3, 4], l1: "전체", l2: "전체", supply: "전체", status: "전체" })
            }
          >
            초기화
          </Button>
        )}
      </section>

      <main className="mt-5">
        {pm.rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">선택한 조건에 해당하는 매입 데이터가 없습니다.</p>
        ) : view === "overview" ? (
          <OverviewView ctx={ctx} pm={pm} cur={cur} prev={prev} onOpenSupplier={openSupplier} />
        ) : view === "supplier" ? (
          <SupplierView
            ctx={ctx}
            pm={pm}
            cur={cur}
            prev={prev}
            supplierIdx={supplierIdx}
            onOpenSupplier={openSupplier}
          />
        ) : (
          <CategoryView ctx={ctx} pm={pm} cur={cur} prev={prev} onOpenSupplier={openSupplier} />
        )}
      </main>

      <footer className="mt-10 space-y-1 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground">
        <p>
          <b className="font-medium text-foreground">매입액</b>: 순매입액(반품·차감·단가 소급정산 포함). 금액 단위 억원.
          부가세 포함 여부는 ERP 추출 기준 확인 필요.
        </p>
        <p>
          <b className="font-medium text-foreground">의존도 기준({meta.rules.version})</b>: 대표 품목군 내 비중 ≥{" "}
          {meta.rules.categoryShareThreshold * 100}% · 단독 공급 비중 ≥ {meta.rules.singleSourceShareThreshold * 100}% ·
          비중 {meta.rules.trendYears}년 연속 상승(최근 비중 {meta.rules.trendMinShare * 100}% 이상) 중 {meta.rules.highDependencyMinCriteria}개 이상 충족 시 고의존. 점수 =
          비중×{meta.rules.weights.categoryShare} + 단독×{meta.rules.weights.singleSourceShare} + 추세×
          {meta.rules.weights.trend}. 순위는 기간 매입 {eok(meta.rules.rankingMinAmount, 0)} 이상 업체 대상.
        </p>
        <p>
          <b className="font-medium text-foreground">품목군</b>: 품번 접두어 매핑 {meta.mapping.version}
          {meta.mapping.isDraft ? "(초안, 실무 확인 필요)" : ""}. 미분류 품번 {meta.mapping.unmappedItems}개 ·{" "}
          {won(meta.mapping.unmappedAmount)}원은 &lsquo;미분류/기타 부품&rsquo;으로 집계.
        </p>
        <p>
          <b className="font-medium text-foreground">협력사</b>: 구매처코드 기준으로 표기 통합(전각·사명 변경). 코드
          50631은 태희금속·부성산업으로 분리. 단가는 수량·단가가 0인 행(소급정산·무상)을 제외해 계산.
        </p>
        <p>
          원본: {meta.sources.map((s) => `${s.file}(${s.rows.toLocaleString()}행)`).join(", ")}
        </p>
      </footer>
    </div>
  );
}

function FilterItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function SupplierSearch({ data, onPick }: { data: PurchaseData; onPick: (idx: number) => void }) {
  const [q, setQ] = React.useState("");
  const options = React.useMemo(
    () => data.suppliers.map((s, i) => ({ i, label: `${s.name} (${s.k})` })),
    [data.suppliers],
  );
  return (
    <>
      <input
        aria-label="협력사 검색"
        list="supplier-list"
        value={q}
        placeholder="이름 또는 코드"
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          const hit = options.find((o) => o.label === v);
          if (hit) {
            onPick(hit.i);
            setQ("");
          }
        }}
        className="h-8 w-48 rounded-md border bg-card px-2 text-[13px]"
      />
      <datalist id="supplier-list">
        {options.map((o) => (
          <option key={o.i} value={o.label} />
        ))}
      </datalist>
    </>
  );
}
