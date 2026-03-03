// ============================================================
// apps/web/lib/citations/verify.ts
// ============================================================
// Primary entry point for the citations module.
// Exports verifyCitations() — orchestrates the three-tier cascade
// for every extracted clause.
//
// Tier 1: Exact string match   (findExactMatch)
// Tier 2: Fuzzy match          (findFuzzyMatch — Jaro-Winkler sliding window)
// Tier 3: LLM re-extraction    (reextractFromPage — NVIDIA multimodal)
// Fallback: UNVERIFIED flag    (confidence × 0.4 penalty)
//
// Per SPEC: NEVER skip verification. If all three tiers fail,
// the clause's extractionConfidence MUST be multiplied by
// unverifiedPenalty (0.4). There is no "skip" path.
// ============================================================

import { createHash } from "crypto";
import type { ExtractedClause, AuditWarning, SourceLocation } from "@auditsimple/types";
import { AuditStatus } from "@auditsimple/types";
import type { PageText, MatchResult, VerificationResult } from "./types";
import { CITATION_MATCH_CONFIG, CONFIDENCE_GATE_CONFIG } from "./config";
import { findExactMatch } from "./exact-match";
import { findFuzzyMatch } from "./fuzzy-match";
import { reextractFromPage } from "./reextract";
import { computeBoundingBox } from "./bounding-box";

// ---------------------------------------------------------------------------
// Hash computation
// ---------------------------------------------------------------------------

/**
 * Computes the SHA-256 hash of the MATCHED text from the source document.
 *
 * Per SPEC: textHash must be computed on the matched text, NOT on the LLM's
 * verbatimText. This ensures the hash anchors to what's actually in the
 * document, enabling tamper detection.
 */
function computeTextHash(matchedText: string): string {
    return createHash("sha256").update(matchedText, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Clause anchoring
// ---------------------------------------------------------------------------

/**
 * Takes a verified clause and a MatchResult, and returns an updated clause
 * with:
 *   - Populated bounding box (from word positions)
 *   - Updated charOffsetStart / charOffsetEnd
 *   - Updated verbatimText (the actual source text, not the LLM's approximation)
 *   - Recomputed textHash (SHA-256 of the MATCHED source text)
 *   - Adjusted extractionConfidence (multiplied by confidenceMultiplier)
 *
 * @param clause               - The original extracted clause
 * @param match                - The match result from one of the three tiers
 * @param confidenceMultiplier - 1.0 (exact), 0.9 (fuzzy), 0.7 (re-extracted)
 * @param pageTexts            - All page texts (for word position lookup)
 * @param warnings             - Mutable array — bounding box warnings are pushed here
 */
function anchorClause(
    clause: ExtractedClause,
    match: MatchResult,
    confidenceMultiplier: number,
    pageTexts: PageText[],
    warnings: AuditWarning[],
): ExtractedClause {
    const page = pageTexts.find((p) => p.pageNumber === match.pageNumber);
    const wordPositions = page?.wordPositions ?? [];

    const { boundingBox, warning: bboxWarning } = computeBoundingBox(
        match.charOffsetStart,
        match.charOffsetEnd,
        wordPositions,
    );

    if (bboxWarning) {
        warnings.push({
            ...bboxWarning,
            message: `Could not locate word-level bounding boxes for "${clause.label}" on page ${match.pageNumber} — falling back to full-page highlight.`,
        });
    }

    const updatedSource: SourceLocation = {
        pageNumber: match.pageNumber,
        boundingBox,
        verbatimText: match.matchedText,
        // Per SPEC: textHash is computed on matched source text, not on the LLM's verbatimText
        textHash: computeTextHash(match.matchedText),
        charOffsetStart: match.charOffsetStart,
        charOffsetEnd: match.charOffsetEnd,
    };

    return {
        ...clause,
        source: updatedSource,
        extractionConfidence: clause.extractionConfidence * confidenceMultiplier,
    };
}

// ---------------------------------------------------------------------------
// Single-clause verification
// ---------------------------------------------------------------------------

/**
 * Runs the three-tier cascade for a single clause.
 * Returns the (possibly updated) clause, whether it was verified, and an
 * optional warning if the clause could not be verified.
 */
async function verifySingleClause(
    auditId: string,
    clause: ExtractedClause,
    pageTexts: PageText[],
    warnings: AuditWarning[],
): Promise<{ clause: ExtractedClause; verified: boolean }> {
    const candidates = buildSearchCandidates(clause);

    for (const candidate of candidates) {
        const exact = findExactMatch(candidate, pageTexts, CITATION_MATCH_CONFIG);
        if (exact) {
            console.log(
                `[citations] Exact match verified clause "${clause.label}" on page ${exact.pageNumber}.`,
            );
            return {
                clause: anchorClause(clause, exact, 1.0, pageTexts, warnings),
                verified: true,
            };
        }

        const fuzzy = findFuzzyMatch(candidate, pageTexts, CITATION_MATCH_CONFIG);
        if (fuzzy) {
            console.log(
                `[citations] Fuzzy match verified clause "${clause.label}" on page ${fuzzy.pageNumber} with similarity ${fuzzy.similarity.toFixed(3)}.`,
            );
            return {
                clause: anchorClause(clause, fuzzy, 0.9, pageTexts, warnings),
                verified: true,
            };
        }
    }

    // Tier 3: LLM re-extraction (expensive, last resort)
    const pageTextContent =
        pageTexts.find((p) => p.pageNumber === clause.source.pageNumber)?.text ?? "";
    const reextracted = await reextractFromPage(auditId, clause, pageTextContent);
    if (reextracted.warning) {
        warnings.push(reextracted.warning);
        console.warn(
            `[citations] Tier 3 re-extraction warning for clause "${clause.label}" on page ${clause.source.pageNumber}: ${reextracted.warning.code}.`,
        );
    }
    if (reextracted.match) {
        console.log(
            `[citations] Tier 3 re-extraction verified clause "${clause.label}" on page ${reextracted.match.pageNumber}.`,
        );
        return {
            clause: anchorClause(clause, reextracted.match, 0.7, pageTexts, warnings),
            verified: true,
        };
    }

    // UNVERIFIED: all three tiers failed. Apply the severe confidence penalty.
    warnings.push({
        code: "L3_CITE_NO_MATCH",
        message: `Could not verify "${clause.label}" in source document`,
        recoverable: true,
        stage: AuditStatus.CITING,
    });

    return {
        clause: {
            ...clause,
            extractionConfidence:
                clause.extractionConfidence * CONFIDENCE_GATE_CONFIG.unverifiedPenalty,
        },
        verified: false,
    };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Verifies all extracted clauses against the source document text using the
 * three-tier cascade: exact match → fuzzy match → LLM re-extraction → UNVERIFIED.
 *
 * For verified clauses, populates the SourceLocation with:
 *   - Anchored bounding box (word-level precision, or full-page fallback)
 *   - Updated charOffsetStart / charOffsetEnd
 *   - Recomputed textHash (SHA-256 of the matched source text)
 *   - Adjusted extractionConfidence (based on which tier succeeded)
 *
 * For unverified clauses:
 *   - extractionConfidence is multiplied by unverifiedPenalty (0.4)
 *   - clauseId is included in unverifiedClauseIds
 *   - An AuditWarning with code L3_CITE_NO_MATCH is added
 *
 * @param clauses   - The extracted clauses to verify
 * @param pageTexts - Page-by-page text with word-level bounding boxes
 */
export async function verifyCitations(
    auditId: string,
    clauses: ExtractedClause[],
    pageTexts: PageText[],
): Promise<VerificationResult> {
    const verifiedClauses: ExtractedClause[] = [];
    const unverifiedClauseIds: string[] = [];
    const warnings: AuditWarning[] = [];

    // Process clauses sequentially to avoid overwhelming the LLM API
    // with parallel Tier 3 re-extraction calls.
    for (const clause of clauses) {
        const { clause: updatedClause, verified } = await verifySingleClause(
            auditId,
            clause,
            pageTexts,
            warnings,
        );

        verifiedClauses.push(updatedClause);

        if (!verified) {
            unverifiedClauseIds.push(clause.clauseId);
        }
    }

    return {
        verifiedClauses,
        unverifiedClauseIds,
        warnings,
    };
}

function buildSearchCandidates(clause: ExtractedClause): string[] {
    const candidates: string[] = [];
    const verbatim = clause.source.verbatimText?.trim() ?? "";
    const rawValue = clause.rawValue?.trim() ?? "";

    if (verbatim.length >= 8) {
        candidates.push(verbatim);
    }
    if (rawValue && !candidates.includes(rawValue)) {
        candidates.push(rawValue);
    }
    if (verbatim && !candidates.includes(verbatim)) {
        candidates.push(verbatim);
    }

    return candidates;
}
