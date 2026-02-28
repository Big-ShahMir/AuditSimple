// ============================================================
// apps/web/lib/benchmarks/comparison.ts
// ============================================================
// Delta computation — pure function, no async, no I/O.
// The ONE cross-module import: interestDeltaOverTerm from analysis.
// ============================================================

import type { ExtractedClause, BenchmarkDataPoint, ClauseBenchmark } from "@auditsimple/types";
import { interestDeltaOverTerm } from "../analysis/amortization";

// ---------------------------------------------------------------------------
// Default assumption for principal when not available in the clause
// ---------------------------------------------------------------------------
// When principal isn't extractable from the clause (common for rate-only
// clauses), we use a representative Canadian mortgage amount for the
// cost-impact estimate. The calculate-cost node refines this with actual
// contract data.
const DEFAULT_PRINCIPAL_CAD = 500_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes the full ClauseBenchmark comparison for a given clause against a
 * benchmark data point.
 *
 * Calculation rules:
 * - delta = contractValue - benchmark.value
 * - deltaPercent = (delta / benchmark.value) * 100
 * - direction: UNFAVORABLE if delta > 0.001 (consumer pays more than market)
 *              FAVORABLE   if delta < -0.001 (consumer pays less than market)
 *              NEUTRAL     if |delta| ≤ 0.001
 * - projectedCostImpact:
 *     • For percent (interest rate) clauses: uses interestDeltaOverTerm with
 *       DEFAULT_PRINCIPAL_CAD if no principal available. The calculate-cost
 *       node will override this with the actual loan amount.
 *     • For flat fee / CAD clauses: abs(delta) (one-time cost difference)
 *
 * @param clause      - the extracted clause with numericValue set
 * @param benchmark   - the resolved benchmark data point
 * @param termMonths  - contract term in months (used for rate amortization)
 * @param principal   - optional loan principal in CAD; falls back to DEFAULT
 */
export function computeComparison(
    clause: ExtractedClause,
    benchmark: BenchmarkDataPoint,
    termMonths: number,
    principal?: number,
): ClauseBenchmark {
    const contractValue = clause.numericValue!;
    const delta = contractValue - benchmark.value;
    const deltaPercent =
        benchmark.value !== 0 ? (delta / benchmark.value) * 100 : 0;

    const direction: ClauseBenchmark["direction"] =
        delta > 0.001
            ? "UNFAVORABLE"
            : delta < -0.001
                ? "FAVORABLE"
                : "NEUTRAL";

    // Projected cost impact calculation
    let projectedCostImpact = 0;

    const isRateClause =
        clause.unit === "percent" ||
        clause.unit === "%" ||
        benchmark.unit === "percent" ||
        benchmark.unit === "%";

    if (isRateClause) {
        const p = principal ?? DEFAULT_PRINCIPAL_CAD;
        // interestDeltaOverTerm(principal, rateA, rateB, termMonths)
        // rateA = contract rate (what they're paying)
        // rateB = benchmark rate (what the market offers)
        // Returns the dollar amount of overpayment across the full term.
        if (p > 0 && termMonths > 0) {
            projectedCostImpact = Math.abs(
                interestDeltaOverTerm(p, contractValue, benchmark.value, termMonths),
            );
        } else {
            // Degenerate fallback: rough estimate as delta * termMonths
            projectedCostImpact = Math.abs(delta) * termMonths;
        }
    } else {
        // Flat fee difference (one-time or recurring but not amortized)
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
