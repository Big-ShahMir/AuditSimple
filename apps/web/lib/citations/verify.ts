// ============================================================
// apps/web/lib/citations/verify.ts
// ============================================================
// Primary entry point for the citations module.
// Exports verifyCitations() — orchestrates the three-tier cascade
// for every extracted clause.
//
// Tier 1: Exact string match   (findExactMatch)
// Tier 2: Fuzzy match          (findFuzzyMatch — Jaro-Winkler sliding window)
// Tier 3: LLM re-extraction    (reextractFromPage — Claude Vision)
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
// Page image rendering stub
// ---------------------------------------------------------------------------

/**
 * Renders a document page to an image Buffer for the Tier 3 LLM re-extraction.
 *
 * In production, this would integrate with the PDF renderer (e.g., PDF.js,
 * Ghostscript, or a cloud rendering service) to produce a PNG of the page.
 *
 * For the MVP, we return an empty Buffer when no rendered image is available.
 * The reextractFromPage function handles empty Buffers gracefully by returning null,
 * which causes the clause to fall through to the UNVERIFIED path.
 *
 * TODO: Implement real page-to-image rendering once the PDF pipeline is finalised.
 */
async function renderPageToImage(
    pageNumber: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _pageTexts: PageText[],
): Promise<Buffer> {
    // Placeholder: real implementation would look up a pre-rendered image from
    // the ingestion pipeline's output (stored in object storage keyed by auditId + pageNumber).
    void pageNumber;
    return Buffer.alloc(0);
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
        warnings.push(bboxWarning);
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
    clause: ExtractedClause,
    pageTexts: PageText[],
    warnings: AuditWarning[],
): Promise<{ clause: ExtractedClause; verified: boolean }> {
    // Tier 1: Exact match (fast, high confidence — no penalty)
    const exact = findExactMatch(clause.source.verbatimText, pageTexts, CITATION_MATCH_CONFIG);
    if (exact) {
        return {
            clause: anchorClause(clause, exact, 1.0, pageTexts, warnings),
            verified: true,
        };
    }

    // Tier 2: Fuzzy match (handles OCR artifacts, minor LLM paraphrasing)
    const fuzzy = findFuzzyMatch(clause.source.verbatimText, pageTexts, CITATION_MATCH_CONFIG);
    if (fuzzy) {
        return {
            clause: anchorClause(clause, fuzzy, 0.9, pageTexts, warnings),
            verified: true,
        };
    }

    // Tier 3: LLM re-extraction (expensive, last resort)
    // If rendering fails, reextractFromPage returns null and we fall through to UNVERIFIED.
    try {
        const pageImage = await renderPageToImage(clause.source.pageNumber, pageTexts);
        const pageTextContent =
            pageTexts.find((p) => p.pageNumber === clause.source.pageNumber)?.text ?? "";

        const reextracted = await reextractFromPage(clause, pageImage, pageTextContent);
        if (reextracted) {
            return {
                clause: anchorClause(clause, reextracted, 0.7, pageTexts, warnings),
                verified: true,
            };
        }
    } catch {
        // Per SPEC: if the Tier 3 LLM call fails or times out, treat the clause as
        // UNVERIFIED. Do not retry here — retry policy is in lib/agents/retry.ts.
        // We don't push an additional warning here; the UNVERIFIED warning below covers it.
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
