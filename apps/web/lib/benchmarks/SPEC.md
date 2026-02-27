# Module: benchmarks

## Purpose

This module manages fair-market benchmark data and provides a single lookup function that the agents pipeline calls during the benchmark node. It owns three responsibilities: seeding and maintaining the `BenchmarkRate` table in PostgreSQL, resolving the best available benchmark for a given clause category and contract type, and providing Wealthsimple product data as a first-class comparison source.

This is the module that makes the app a Wealthsimple challenge entry, not just a generic contract analyzer. When the system finds an above-market mortgage rate, it doesn't just say "you're paying too much" — it says "here's what Wealthsimple offers for the same product, and here's the exact delta."

The module is designed for **graceful degradation**: if benchmark data is stale or unavailable for a clause category, it returns `null` and the pipeline continues without that comparison rather than failing.

## Interfaces (import from `packages/types`)

### Consumed
- `ExtractedClause` — input to the lookup function (uses `category`, `numericValue`, `unit`)
- `ContractType` — used to select the most relevant benchmark source
- `BenchmarkDataPoint` — the shape this module produces for each benchmark match
- `ClauseBenchmark` — the full comparison object constructed by this module

### Produced
- `BenchmarkDataPoint` — populated with source name, value, date, and reference URL
- `ClauseBenchmark` — the complete comparison with delta, deltaPercent, projectedCostImpact, and direction

## Dependencies

### This module calls:
- Prisma client — reads from and writes to the `BenchmarkRate` table
- No LLM calls. No external HTTP in the MVP (benchmark data is seeded and updated via config files and seed scripts). Post-MVP: Bank of Canada API integration.

### Called by:
- `lib/agents/nodes/benchmark.ts` — imports `getBenchmarkForClause()` as the primary lookup
- `lib/agents/nodes/calculate-cost.ts` — may import `getLatestBenchmarks()` to access all current rates for assumption documentation
- `app/api/` routes — seed script triggered at deploy time

### Does NOT call:
- `lib/agents` — this module is called by agents, never calls them
- `lib/ingestion` — no interaction
- `lib/citations` — no interaction
- `lib/analysis` — does not import templates or rules (receives clause data as parameters)

## Files to Create

- **`lookup.ts`** — Primary entry point. Exports `getBenchmarkForClause(clause: ExtractedClause, contractType: ContractType): Promise<ClauseBenchmark | null>`. Resolves the best benchmark using the priority cascade: Wealthsimple product → Bank of Canada rate → historical average. Computes delta, deltaPercent, projectedCostImpact, and direction. Returns `null` if no benchmark is available for this clause category (with no error — the pipeline treats this as a skip).
- **`sources/wealthsimple.ts`** — Wealthsimple product rates as a typed config object. Exports `WEALTHSIMPLE_RATES: WealthsimpleRateConfig`. This is a hardcoded config file updated manually (weekly cadence for the MVP). Contains current rates for: mortgage (fixed 1-5yr, variable), savings account, GIC, managed investing MER, and crypto trading fees. Each entry includes the rate value, effective date, and a URL to the Wealthsimple product page for citation.
- **`sources/bank-of-canada.ts`** — Bank of Canada reference rates as a typed config object. Exports `BOC_RATES: BocRateConfig`. Hardcoded for MVP with: prime rate, conventional mortgage posted rates (1-5yr), and overnight rate. Post-MVP: replace with live API fetch from Bank of Canada Valet API. Each entry includes the rate value, effective date, and the BOC reference URL.
- **`sources/index.ts`** — Source aggregator. Exports `getAllCurrentRates(): BenchmarkDataPoint[]` which merges all source configs into a flat list of `BenchmarkDataPoint` objects. Also exports `getSourcePriority(sourceName: string): number` used by the lookup to break ties.
- **`resolver.ts`** — Benchmark resolution logic. Exports `resolveBestBenchmark(category: string, unit: string, contractType: ContractType, candidates: BenchmarkDataPoint[]): BenchmarkDataPoint | null`. Implements the priority cascade: first filters candidates by category match, then by unit compatibility, then sorts by source priority (Wealthsimple > BOC > historical), then by recency (most recent `asOfDate` wins). Returns the single best benchmark or `null`.
- **`comparison.ts`** — Delta computation. Exports `computeComparison(clause: ExtractedClause, benchmark: BenchmarkDataPoint, termMonths: number): ClauseBenchmark`. Pure function that calculates delta (`contractValue - benchmarkValue`), deltaPercent, direction, and projectedCostImpact. For interest rate clauses, projectedCostImpact uses simplified amortization (calls `interestDeltaOverTerm` from `lib/analysis` — the ONE cross-module import). For flat fees, projectedCostImpact equals the absolute delta.
- **`seed.ts`** — Database seed script. Exports `seedBenchmarks(): Promise<void>`. Reads from the Wealthsimple and BOC config files and upserts all rates into the `BenchmarkRate` PostgreSQL table. Designed to run at deploy time and be idempotent (upserts, not inserts). Also exports `checkStaleness(): Promise<StaleReport>` which flags any benchmark older than 7 days.
- **`staleness.ts`** — Data freshness monitor. Exports `checkStaleness(): Promise<StaleReport>` where `StaleReport` contains a list of stale benchmarks (older than 7 days) and a boolean `hasStaleData`. The agents pipeline checks this at the start of the benchmark node and adds an `AuditWarning` with code `L2_BENCHMARK_DATA_STALE` if any benchmarks are stale.
- **`category-map.ts`** — Maps clause categories and labels to benchmark lookup keys. Exports `CLAUSE_TO_BENCHMARK_MAP: Record<string, BenchmarkLookupKey>` where `BenchmarkLookupKey` specifies which benchmark category and source to look for. Handles the semantic gap between clause labels (e.g., "prepayment_penalty") and benchmark categories (e.g., "penalties"). Not every clause label maps to a benchmark — unmapped clauses return `null` from the lookup.
- **`types.ts`** — Module-internal types. Defines `WealthsimpleRateConfig`, `BocRateConfig`, `BenchmarkLookupKey`, `StaleReport`, and the source config shapes. Not exported to `packages/types`.
- **`index.ts`** — Public barrel export. Exports `getBenchmarkForClause`, `getLatestBenchmarks`, `seedBenchmarks`, `checkStaleness`, and `WEALTHSIMPLE_RATES` (the Wealthsimple config is public so the frontend can reference product names and URLs).

## Key Logic

### Wealthsimple Rate Config Structure
```typescript
interface WealthsimpleRateConfig {
  lastUpdated: string; // ISO 8601 — manual update date
  products: {
    mortgage: {
      fixed1yr: { rate: number; url: string };
      fixed2yr: { rate: number; url: string };
      fixed3yr: { rate: number; url: string };
      fixed5yr: { rate: number; url: string };
      variable: { rate: number; url: string };
    };
    savings: {
      interestRate: { rate: number; url: string };
    };
    gic: {
      rate1yr: { rate: number; url: string };
      rate3yr: { rate: number; url: string };
      rate5yr: { rate: number; url: string };
    };
    managedInvesting: {
      mer: { rate: number; url: string }; // management expense ratio
    };
  };
}

// Example (agent must populate with current real rates at build time)
const WEALTHSIMPLE_RATES: WealthsimpleRateConfig = {
  lastUpdated: "2026-02-25T00:00:00Z",
  products: {
    mortgage: {
      fixed5yr: { rate: 4.49, url: "https://www.wealthsimple.com/en-ca/mortgage" },
      variable: { rate: 5.10, url: "https://www.wealthsimple.com/en-ca/mortgage" },
      // ... other terms
    },
    // ...
  },
};
```

### Benchmark Resolution Priority Cascade
```typescript
const SOURCE_PRIORITY: Record<string, number> = {
  "Wealthsimple": 1,      // highest priority — direct product comparison
  "Bank of Canada": 2,     // authoritative reference rate
  "Historical Average": 3, // fallback — rolling 90-day average from DB
};

function resolveBestBenchmark(
  category: string,
  unit: string,
  contractType: ContractType,
  candidates: BenchmarkDataPoint[]
): BenchmarkDataPoint | null {
  const matched = candidates
    .filter(c => matchesCategory(c, category))
    .filter(c => isUnitCompatible(c.unit, unit))
    .sort((a, b) => {
      // Primary sort: source priority (lower = better)
      const priorityDiff = (SOURCE_PRIORITY[a.sourceName] ?? 99)
                         - (SOURCE_PRIORITY[b.sourceName] ?? 99);
      if (priorityDiff !== 0) return priorityDiff;
      // Secondary sort: recency (newer = better)
      return new Date(b.asOfDate).getTime() - new Date(a.asOfDate).getTime();
    });

  return matched[0] ?? null;
}
```

### Comparison Computation
```typescript
function computeComparison(
  clause: ExtractedClause,
  benchmark: BenchmarkDataPoint,
  termMonths: number
): ClauseBenchmark {
  const contractValue = clause.numericValue!;
  const delta = contractValue - benchmark.value;
  const deltaPercent = benchmark.value !== 0
    ? (delta / benchmark.value) * 100
    : 0;

  const direction: ClauseBenchmark["direction"] =
    delta > 0.001 ? "UNFAVORABLE" :
    delta < -0.001 ? "FAVORABLE" :
    "NEUTRAL";

  // projectedCostImpact depends on unit type
  let projectedCostImpact = 0;
  if (clause.unit === "percent" || benchmark.unit === "percent") {
    // Interest rate — needs principal for amortization calc
    // If principal not available, estimate impact as delta * termMonths (rough)
    projectedCostImpact = Math.abs(delta) * termMonths; // placeholder, refined by calculate-cost node
  } else {
    // Flat fee difference
    projectedCostImpact = Math.abs(delta);
  }

  return {
    clauseId: clause.clauseId,
    contractValue,
    contractUnit: clause.unit ?? "",
    benchmark,
    delta: Math.round(delta * 100) / 100,
    deltaPercent: Math.round(deltaPercent * 100) / 100,
    projectedCostImpact: Math.round(projectedCostImpact),
    direction,
  };
}
```

### Staleness Check
```typescript
const STALENESS_THRESHOLD_DAYS = 7;

async function checkStaleness(): Promise<StaleReport> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALENESS_THRESHOLD_DAYS);

  const staleRates = await prisma.benchmarkRate.findMany({
    where: { asOfDate: { lt: cutoff } },
    select: { sourceName: true, category: true, asOfDate: true },
  });

  return {
    staleEntries: staleRates,
    hasStaleData: staleRates.length > 0,
    thresholdDays: STALENESS_THRESHOLD_DAYS,
  };
}
```

## Constraints

- **Wealthsimple rates MUST be real, current values at build time.** The agent building this module must look up actual Wealthsimple product rates and populate `sources/wealthsimple.ts` with real data. Placeholder values like `4.99` are not acceptable — use the actual posted rates from wealthsimple.com/en-ca at the time of implementation.
- **Bank of Canada rates MUST be real, current values at build time.** Same requirement. Use the posted conventional mortgage rates and prime rate from bankofcanada.ca.
- **`getBenchmarkForClause()` must NEVER throw.** It returns `null` on any failure — missing data, stale data, category mismatch, unit incompatibility. The pipeline treats `null` as "no benchmark available" and continues.
- **`comparison.ts` may import `interestDeltaOverTerm` from `lib/analysis/amortization.ts`.** This is the ONE permitted cross-module import in this module. It is used to compute accurate projectedCostImpact for interest rate clauses when principal is available.
- **The seed script must be idempotent.** Running it 10 times produces the same database state as running it once. Use Prisma `upsert` keyed on `[sourceName, category, asOfDate]`.
- **Do NOT build a live scraping or API integration for MVP.** All benchmark data comes from the config files in `sources/`. Post-MVP: add a cron job that fetches from Bank of Canada Valet API and updates the configs.
- **NEVER expose stale data without a warning.** If `checkStaleness()` returns `hasStaleData: true`, the agents pipeline must attach an `AuditWarning` with code `L2_BENCHMARK_DATA_STALE` to the audit. The frontend must display this warning.
- **Do not import from `lib/agents`, `lib/ingestion`, or `lib/citations`.** Only permitted cross-module import is `lib/analysis/amortization.ts`.
- **All rates are in annualized form.** Monthly rates must be converted to annual before storage. This is the canonical unit for the `BenchmarkRate` table.
