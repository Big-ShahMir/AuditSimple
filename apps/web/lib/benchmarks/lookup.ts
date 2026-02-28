// ============================================================
// apps/web/lib/benchmarks/lookup.ts
// ============================================================
// Primary entry point for the benchmarks module.
// Called by lib/agents/nodes/benchmark.ts.
//
// NEVER THROWS — returns null on any failure.
// ============================================================

import type { ExtractedClause, ClauseBenchmark, BenchmarkDataPoint } from "@auditsimple/types";
import type { ContractType } from "@auditsimple/types";
import { getAllCurrentRates } from "./sources/index";
import { resolveLookupKey } from "./category-map";
import { resolveBestBenchmark } from "./resolver";
import { computeComparison } from "./comparison";

// ---------------------------------------------------------------------------
// Default term assumptions by contract type
// Used for projectedCostImpact when no term is available in the clause.
// ---------------------------------------------------------------------------
const DEFAULT_TERM_MONTHS: Record<string, number> = {
    MORTGAGE: 300,       // 25-year amortization
    AUTO_LEASE: 48,      // 4-year lease
    AUTO_LOAN: 60,       // 5-year loan
    CREDIT_CARD: 12,     // 1-year rolling
    PERSONAL_LOAN: 60,   // 5-year term
    LINE_OF_CREDIT: 12,  // 1-year revolving baseline
    INSURANCE_POLICY: 12,
    INVESTMENT_AGREEMENT: 60,
    UNKNOWN: 60,
};

// ---------------------------------------------------------------------------
// getLatestBenchmarks
// ---------------------------------------------------------------------------

/**
 * Returns all current benchmark rates as a flat list of BenchmarkDataPoint.
 * Used by lib/agents/nodes/calculate-cost.ts for assumption documentation.
 */
export function getLatestBenchmarks(): BenchmarkDataPoint[] {
    return getAllCurrentRates();
}

// ---------------------------------------------------------------------------
// getBenchmarkForClause
// ---------------------------------------------------------------------------

/**
 * Looks up the best available benchmark for a given extracted clause.
 *
 * Resolution pipeline:
 * 1. Validate that the clause has a numeric value
 * 2. Resolve a BenchmarkLookupKey from the clause category and label
 * 3. Get all current rates from config sources
 * 4. Run the priority cascade resolver (Wealthsimple > BOC > Historical)
 * 5. Compute delta, deltaPercent, projectedCostImpact, and direction
 *
 * Returns null (never throws) if:
 * - clause.numericValue is null
 * - no BenchmarkLookupKey maps to this clause type
 * - no benchmark survives the priority cascade filters
 * - any unexpected error occurs
 *
 * @param clause       - the extracted clause to benchmark
 * @param contractType - used to select default term assumptions
 * @param termMonths   - optional explicit term; overrides default assumption
 * @param principal    - optional loan principal in CAD for cost impact calc
 */
export async function getBenchmarkForClause(
    clause: ExtractedClause,
    contractType: ContractType,
    termMonths?: number,
    principal?: number,
): Promise<ClauseBenchmark | null> {
    try {
        // 1. Must have a numeric value to compare
        if (clause.numericValue === null || clause.numericValue === undefined) {
            return null;
        }

        // 2. Resolve the benchmark lookup key
        const lookupKey = resolveLookupKey(clause.category, clause.label);
        if (!lookupKey) {
            // This clause type has no benchmark — expected, not an error
            return null;
        }

        // 3. Get all current rate candidates from config sources
        const candidates = getAllCurrentRates();

        // 4. Run priority cascade to find the single best benchmark
        const benchmark = resolveBestBenchmark(
            lookupKey.benchmarkCategory,
            lookupKey.expectedUnit,
            contractType,
            candidates,
        );

        if (!benchmark) {
            // No benchmark available for this category — graceful skip
            return null;
        }

        // 5. Determine term months (explicit > per-contract default)
        const resolvedTermMonths =
            termMonths ??
            DEFAULT_TERM_MONTHS[contractType as string] ??
            60;

        // 6. Compute and return the full comparison
        return computeComparison(clause, benchmark, resolvedTermMonths, principal);
    } catch {
        // Never throw — return null on any unexpected error
        return null;
    }
}
