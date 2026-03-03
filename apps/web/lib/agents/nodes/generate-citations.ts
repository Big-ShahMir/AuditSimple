// ============================================================
// apps/web/lib/agents/nodes/generate-citations.ts
// ============================================================
// Citation verification node.
//
// Calls verifyCitations() from lib/citations passing audit.clauses and pageTexts.
// Receives back clauses with verified SourceLocation data and confidence adjustments.
// Clauses that fail all three tiers get extractionConfidence multiplied by 0.4
// (applied inside lib/citations — not repeated here).
// ============================================================

import type { AgentState, AuditWarning } from "@auditsimple/types";
import { AuditStatus } from "@auditsimple/types";
import { verifyCitations } from "@/lib/citations";
import type { PageText } from "@/lib/citations";
import { emitProgress } from "../progress";

// ---------------------------------------------------------------------------
// Node implementation
// ---------------------------------------------------------------------------

/**
 * Citation verification node.
 *
 * Passes all extracted clauses through the three-tier citation cascade:
 *   Tier 1: Exact string match
 *   Tier 2: Fuzzy match (Jaro-Winkler)
 *   Tier 3: LLM re-extraction
 *   Fallback: UNVERIFIED — confidence × 0.4 penalty (applied in lib/citations)
 *
 * Merges citation warnings into state errors.
 * Never fails the pipeline — returns current clauses if verifyCitations throws.
 */
export async function generateCitationsNode(state: AgentState): Promise<Partial<AgentState>> {
    emitProgress(state, { node: "generate_citations" });

    const clauses = state.audit.clauses ?? [];
    const pageTexts = state.pageTexts as PageText[];
    const warnings: AuditWarning[] = [];

    if (clauses.length === 0) {
        warnings.push({
            code: "CITE_NO_CLAUSES",
            message: "No clauses to verify — citations node is a no-op",
            recoverable: true,
            stage: AuditStatus.CITING,
        });
        return {
            currentNode: "generate_citations",
            audit: { clauses, updatedAt: new Date().toISOString() },
            errors: warnings,
        };
    }

    let verifiedClauses = clauses;

    try {
        const result = await verifyCitations(state.audit.auditId ?? "", clauses, pageTexts);
        verifiedClauses = result.verifiedClauses;

        // Merge citation-generated warnings
        for (const w of result.warnings) {
            warnings.push(w);
        }

        // Log summary info for unverified clauses
        if (result.unverifiedClauseIds.length > 0) {
            console.warn(
                `[citations] ${result.unverifiedClauseIds.length} clause(s) remained unverified for audit ${state.audit.auditId ?? "unknown"}.`,
            );
            warnings.push({
                code: "CITE_UNVERIFIED_SUMMARY",
                message: `${result.unverifiedClauseIds.length} clause(s) could not be verified in the source document`,
                recoverable: true,
                stage: AuditStatus.CITING,
            });
        }
    } catch (err) {
        // Graceful degradation — citations failure is non-fatal
        warnings.push({
            code: "CITE_VERIFICATION_ERROR",
            message: `Citation verification failed: ${err instanceof Error ? err.message : String(err)}. Using unverified clauses.`,
            recoverable: true,
            stage: AuditStatus.CITING,
        });
        // verifiedClauses stays as the original unverified clauses
    }

    return {
        currentNode: "generate_citations",
        audit: {
            clauses: verifiedClauses,
            status: AuditStatus.CITING,
            updatedAt: new Date().toISOString(),
        },
        errors: warnings,
    };
}
