// ============================================================
// apps/web/lib/agents/nodes/calculate-cost.ts
// ============================================================
// Cost of Loyalty calculation node — NO LLM CALL.
//
// Pure math. Sums projected cost impacts from all UNFAVORABLE issues.
// Delegates to calculateCostOfLoyalty() from lib/analysis.
// Produces low/mid/high confidence range.
// ============================================================

import type { AgentState, ExtractedClause, AuditWarning } from "@auditsimple/types";
import { AuditStatus } from "@auditsimple/types";
import { calculateCostOfLoyalty } from "@/lib/analysis";
import { emitProgress } from "../progress";

// ---------------------------------------------------------------------------
// Constants — default term assumptions when not extractable from clauses
// ---------------------------------------------------------------------------

const DEFAULT_TERM_MONTHS = 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Finds the first clause matching any of the given labels that has a numeric value.
 */
function findClause(clauses: ExtractedClause[], ...labels: string[]): ExtractedClause | undefined {
    return clauses.find((c) => labels.includes(c.label) && c.numericValue !== null);
}

// ---------------------------------------------------------------------------
// Node implementation
// ---------------------------------------------------------------------------

/**
 * Cost of Loyalty calculation node.
 *
 * Algorithm:
 *  1. Extract term months from clause labels (term_length, amortization_period, lease_term)
 *  2. Extract principal from principal_amount clause (if present)
 *  3. Delegate to calculateCostOfLoyalty() from lib/analysis
 *  4. Attach the result to audit.costOfLoyalty
 *
 * Never throws — errors are surfaced as warnings with a zero-cost fallback.
 */
export async function calculateCostNode(state: AgentState): Promise<Partial<AgentState>> {
    emitProgress(state, { node: "calculate_cost" });

    const issues = state.audit.issues ?? [];
    const clauses = state.audit.clauses ?? [];
    const warnings: AuditWarning[] = [];

    // Determine term length
    const termClause = findClause(
        clauses,
        "term_length",
        "amortization_period",
        "lease_term",
        "policy_term",
        "lock_up_period",
    );
    let termMonths = termClause?.numericValue ?? DEFAULT_TERM_MONTHS;

    if (!termClause) {
        warnings.push({
            code: "CALC_COST_NO_TERM",
            message: `No term clause found — defaulting to ${DEFAULT_TERM_MONTHS} months for cost calculation`,
            recoverable: true,
            stage: AuditStatus.EXTRACTING,
        });
    }

    // Convert years to months if unit is "years"
    if (termClause?.unit === "years" && termClause.numericValue !== null) {
        termMonths = termClause.numericValue * 12;
    }

    // Determine principal
    const principalClause = findClause(clauses, "principal_amount", "capitalized_cost");
    const principal = principalClause?.numericValue ?? null;

    // Delegate to lib/analysis pure math function
    let costOfLoyalty;
    try {
        costOfLoyalty = calculateCostOfLoyalty(issues, termMonths, principal);
    } catch (err) {
        // Defensive: calculateCostOfLoyalty is pure math and should never throw,
        // but we guard anyway per the graceful degradation policy
        warnings.push({
            code: "CALC_COST_ERROR",
            message: `Cost calculation failed: ${err instanceof Error ? err.message : String(err)}. Defaulting to zero.`,
            recoverable: true,
            stage: AuditStatus.EXTRACTING,
        });
        costOfLoyalty = {
            totalCost: 0,
            breakdown: [],
            timeHorizonMonths: termMonths,
            assumptions: ["Calculation failed — see warnings"],
            confidenceRange: { low: 0, mid: 0, high: 0 },
        };
    }

    return {
        currentNode: "calculate_cost",
        audit: {
            costOfLoyalty,
            updatedAt: new Date().toISOString(),
        },
        errors: warnings,
    };
}
