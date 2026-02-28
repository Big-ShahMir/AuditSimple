// ============================================================
// apps/web/lib/citations/confidence-gate.ts
// ============================================================
// Confidence gating and demotion.
// Determines which clauses and issues reach the final audit
// vs. which get demoted to AuditWarning.
//
// CONTRACT: gateConfidence() is idempotent. Running it twice
// on the same input produces the same output. This is enforced
// by never mutating the input arrays — always returning new ones.
// ============================================================

import type { AuditIssue, AuditWarning, ExtractedClause, SeverityLevel } from "@auditsimple/types";
import { AuditStatus } from "@auditsimple/types";
import type { GateResult } from "./types";
import { CONFIDENCE_GATE_CONFIG } from "./config";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Applies confidence thresholds to determine what reaches the final audit.
 *
 * Thresholds (from CONFIDENCE_GATE_CONFIG):
 *   - Clauses below 0.6  → excluded from issue generation (not returned in passedClauses)
 *   - Issues below 0.7   → excluded from the final audit (not returned in passedIssues)
 *   - Unverified clauses → extractionConfidence × 0.4 (penalty already applied in verify.ts)
 *   - Issues below 0.5 after all adjustments → demoted to AuditWarning
 *
 * Does NOT mutate the input arrays. Returns new filtered arrays.
 * Safe to call multiple times (idempotent).
 *
 * @param clauses - All extracted clauses (verified + unverified)
 * @param issues  - All AuditIssues produced by the analysis layer
 */
export function gateConfidence(
    clauses: ExtractedClause[],
    issues: AuditIssue[],
): GateResult {
    const config = CONFIDENCE_GATE_CONFIG;

    // -------------------------------------------------------------------------
    // Step 1: Filter clauses below the minimum clause confidence threshold.
    // These clauses are accepted as output but flagged as ineligible for issue
    // generation (the analysis layer uses passedClauses as its source of truth).
    // -------------------------------------------------------------------------
    const passedClauses = clauses.filter(
        (clause) => clause.extractionConfidence >= config.clauseMinConfidence,
    );

    // -------------------------------------------------------------------------
    // Step 2: Partition issues.
    // An issue's effective confidence may be adjusted downward if its related
    // clauses have low confidence. We compute an adjusted confidence per issue,
    // then split into: passed (≥ issueMinConfidence) vs. demoted (< issueMinConfidence).
    //
    // Issues that fall below warningThreshold after adjustment are demoted to
    // AuditWarning instead of being silently discarded.
    // -------------------------------------------------------------------------
    const passedIssues: AuditIssue[] = [];
    const demotedWarnings: AuditWarning[] = [];

    for (const issue of issues) {
        const adjustedConfidence = computeAdjustedIssueConfidence(issue, clauses);

        if (adjustedConfidence >= config.issueMinConfidence) {
            passedIssues.push(issue);
        } else if (adjustedConfidence < config.warningThreshold) {
            // Below the warning threshold — demote to AuditWarning
            demotedWarnings.push(demoteIssueToWarning(issue, adjustedConfidence));
        }
        // Issues in [warningThreshold, issueMinConfidence) are silently excluded.
        // They're not high-confidence enough to show, but not low-confidence enough
        // to be worth surfacing as a warning.
    }

    return {
        passedClauses,
        passedIssues,
        demotedWarnings,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Computes an adjusted confidence score for an issue by weighing it against
 * the confidence of its related clauses.
 *
 * If any related clause has a low confidence (e.g., was unverified and penalised),
 * that reduces the issue's effective confidence. The adjustment is the minimum
 * clause confidence ratio across all related clauses, multiplied by the issue's
 * own stated confidence.
 *
 * If the issue has no related clauses, its confidence is unchanged.
 */
function computeAdjustedIssueConfidence(
    issue: AuditIssue,
    allClauses: ExtractedClause[],
): number {
    if (issue.relatedClauses.length === 0) {
        return issue.confidence;
    }

    // Build a lookup map for quick clause access
    const clauseById = new Map(allClauses.map((c) => [c.clauseId, c]));

    // Find the minimum extractionConfidence among related clauses
    // (Use the updated confidence from allClauses, not the snapshot in issue.relatedClauses,
    //  so that unverified penalties applied in verify.ts are reflected here)
    let minClauseConfidence = 1.0;
    for (const relatedClause of issue.relatedClauses) {
        const current = clauseById.get(relatedClause.clauseId);
        const confidence = current
            ? current.extractionConfidence
            : relatedClause.extractionConfidence;
        if (confidence < minClauseConfidence) {
            minClauseConfidence = confidence;
        }
    }

    // Adjust: issue confidence cannot exceed the weakest clause it rests on
    return Math.min(issue.confidence, minClauseConfidence);
}

/**
 * Converts a low-confidence AuditIssue into an AuditWarning.
 * The warning carries the issue title and adjusted confidence in the message
 * so frontend/reviewers can audit which issues were demoted and why.
 */
function demoteIssueToWarning(
    issue: AuditIssue,
    adjustedConfidence: number,
): AuditWarning {
    return {
        code: "L5_CONFIDENCE_DEMOTION",
        message:
            `Issue "${issue.title}" (issueId: ${issue.issueId}, severity: ${issue.severity}) ` +
            `was demoted from AuditIssue to AuditWarning — ` +
            `adjusted confidence ${adjustedConfidence.toFixed(3)} fell below warningThreshold ` +
            `${CONFIDENCE_GATE_CONFIG.warningThreshold}`,
        recoverable: true,
        stage: AuditStatus.CITING,
    };
}
