// ============================================================
// apps/web/lib/analysis/cost-calculator.ts
// ============================================================
// Cost of Loyalty computation.
// Aggregates UNFAVORABLE AuditIssues into a total excess cost
// estimate using amortization math for rate differentials and
// projectedCostImpact for flat-fee deltas.
// No async, no I/O, no side effects.
// ============================================================

import { AuditIssue, CostOfLoyalty } from "@auditsimple/types";
import { interestDeltaOverTerm } from "./amortization";

/**
 * Computes the Cost of Loyalty — the total estimated excess cost
 * the consumer incurs by staying on their current contract versus
 * switching to a fair-market alternative.
 *
 * Algorithm:
 *  1. Iterate only UNFAVORABLE issues that have a benchmarkComparison.
 *  2. For percent-unit benchmarks (interest rate differentials), use
 *     amortization math to compute actual dollar overpayment.
 *  3. For all other units (flat fees, fixed-amount penalties), use
 *     projectedCostImpact directly.
 *  4. Apply a ±15% confidence margin to produce low/mid/high range.
 *
 * @param issues      Full list of AuditIssues from the analysis pipeline
 * @param termMonths  Remaining contract term in months
 * @param principal   Loan/contract principal in CAD (null if not applicable)
 */
export function calculateCostOfLoyalty(
    issues: AuditIssue[],
    termMonths: number,
    principal: number | null,
): CostOfLoyalty {
    const breakdown: CostOfLoyalty["breakdown"] = [];
    const assumptions: string[] = [];
    let total = 0;

    for (const issue of issues) {
        // Skip issues with no benchmark or that are not unfavorable to the consumer
        if (!issue.benchmarkComparison || issue.benchmarkComparison.direction !== "UNFAVORABLE") {
            continue;
        }

        const bc = issue.benchmarkComparison;

        if (bc.contractUnit === "percent" && principal !== null) {
            // Interest rate differential — use amortization math for accuracy
            const cost = interestDeltaOverTerm(
                principal,
                bc.contractValue,
                bc.benchmark.value,
                termMonths,
            );
            breakdown.push({
                category: issue.title,
                amount: cost,
                description: `Rate differential over ${termMonths} months`,
            });
            total += cost;
        } else {
            // Flat fee or fixed-amount delta — use pre-computed projectedCostImpact
            const cost = bc.projectedCostImpact;
            breakdown.push({
                category: issue.title,
                amount: cost,
                description: issue.description,
            });
            total += cost;
        }
    }

    // TODO: Replace with actual benchmark standard deviation when historical data is available
    // ±15% confidence margin is a placeholder for post-MVP improvement
    const margin = total * 0.15;

    assumptions.push(`Assumes ${termMonths}-month remaining term`);
    if (principal) {
        assumptions.push(`Based on principal of $${principal.toLocaleString("en-CA")} CAD`);
    }
    assumptions.push("Benchmark rates as of most recent available data");
    assumptions.push("Does not account for potential rate changes during term");

    return {
        totalCost: Math.round(total),
        breakdown,
        timeHorizonMonths: termMonths,
        assumptions,
        confidenceRange: {
            low: Math.round(total - margin),
            mid: Math.round(total),
            high: Math.round(total + margin),
        },
    };
}
