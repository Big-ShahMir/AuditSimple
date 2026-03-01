// ============================================================
// apps/web/lib/agents/nodes/validate-clauses.ts
// ============================================================
// Deterministic validation node — NO LLM CALL.
//
// Runs every clause through VALIDATION_RULES from lib/analysis.
// On failure: downgrades extractionConfidence to 0.3, appends warning.
// NEVER removes clauses — only annotates them.
// ============================================================

import type { AgentState, ExtractedClause, AuditWarning } from "@auditsimple/types";
import { AuditStatus } from "@auditsimple/types";
import { VALIDATION_RULES, validateClause } from "@/lib/analysis";
import { emitProgress } from "../progress";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** extractionConfidence floor for failed validations (per SPEC) */
const FAILED_VALIDATION_CONFIDENCE = 0.3;

// ---------------------------------------------------------------------------
// Node implementation
// ---------------------------------------------------------------------------

/**
 * Deterministic validation node.
 *
 * Runs VALIDATION_RULES against every clause. For each failed rule:
 *   1. Downgrades extractionConfidence to FAILED_VALIDATION_CONFIDENCE
 *      (only if the clause's current confidence is higher — never upgrade)
 *   2. Appends an AuditWarning
 *
 * Never short-circuits — runs all rules against all clauses.
 * Never throws — all errors are surfaced as warnings.
 * Never removes clauses from state.
 */
export async function validateClausesNode(state: AgentState): Promise<Partial<AgentState>> {
    emitProgress(state, { node: "validate_clauses" });

    const clauses = state.audit.clauses ?? [];
    const warnings: AuditWarning[] = [];
    // Suppress unused import warning — VALIDATION_RULES is validated via validateClause
    void VALIDATION_RULES;

    const updatedClauses: ExtractedClause[] = clauses.map((clause) => {
        const results = validateClause(clause);
        const failures = results.filter((r) => !r.valid);

        if (failures.length === 0) {
            return clause;
        }

        // Downgrade confidence for any failed clause
        const updatedClause: ExtractedClause = {
            ...clause,
            extractionConfidence: Math.min(clause.extractionConfidence, FAILED_VALIDATION_CONFIDENCE),
        };

        // Append one warning per failure reason
        for (const failure of failures) {
            warnings.push({
                code: "VALIDATE_CLAUSE_FAILED",
                message: `Clause "${clause.label}" (id: ${clause.clauseId}) failed validation: ${failure.reason ?? "unknown reason"}`,
                recoverable: true,
                stage: AuditStatus.EXTRACTING,
            });
        }

        return updatedClause;
    });

    return {
        currentNode: "validate_clauses",
        audit: {
            clauses: updatedClauses,
            updatedAt: new Date().toISOString(),
        },
        errors: warnings,
    };
}
