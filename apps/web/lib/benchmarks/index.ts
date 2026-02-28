// ============================================================
// apps/web/lib/benchmarks/index.ts
// ============================================================
// Public barrel export for the benchmarks module.
//
// Consumers:
// - lib/agents/nodes/benchmark.ts       → getBenchmarkForClause
// - lib/agents/nodes/calculate-cost.ts  → getLatestBenchmarks
// - app/api/ routes                     → seedBenchmarks
// - Frontend                            → WEALTHSIMPLE_RATES (product names/URLs)
// ============================================================

// Primary lookup function — used by the benchmark agent node
export { getBenchmarkForClause, getLatestBenchmarks } from "./lookup";

// Seed & freshness functions — used at deploy time and by the benchmark node
export { seedBenchmarks, checkStaleness } from "./seed";

// Wealthsimple rate config — public so the frontend can reference product
// names, URLs, and rates for display in comparison UI
export { WEALTHSIMPLE_RATES } from "./sources/wealthsimple";

// Internal types that consumers may need for type-checking
export type { StaleReport, WealthsimpleRateConfig, BocRateConfig } from "./types";
