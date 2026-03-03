// ============================================================
// apps/web/lib/citations/config.ts
// ============================================================
// All configuration constants for the citation engine.
// Single place to tune thresholds without touching logic files.
// ============================================================

import type { CitationMatchConfig } from "./types";

// ---------------------------------------------------------------------------
// Matching configuration
// ---------------------------------------------------------------------------

/**
 * Controls how the three-tier verification cascade matches clause text
 * against the source document. Adjust these values to tune precision
 * vs. recall for the fuzzy matching tier.
 */
export const CITATION_MATCH_CONFIG: Readonly<CitationMatchConfig> = Object.freeze({
    /**
     * Minimum Jaro-Winkler similarity score to accept a fuzzy match.
     * 0.85 means the matched window must be 85% similar to the needle.
     * Raising this reduces false-positive matches; lowering it increases recall.
     */
    minSimilarityThreshold: 0.82,

    /**
     * Collapse internal whitespace and trim before comparing.
     * Handles OCR artifacts that introduce extra spaces.
     */
    normalizeWhitespace: true,

    /**
     * Lowercase both strings before comparing.
     * Prevents case differences from killing otherwise-valid matches.
     */
    caseInsensitive: true,
});

// ---------------------------------------------------------------------------
// Confidence gate configuration
// ---------------------------------------------------------------------------

/**
 * Thresholds that control what reaches the final audit output.
 * All values are fractions in [0, 1] unless noted otherwise.
 */
export const CONFIDENCE_GATE_CONFIG = Object.freeze({
    /**
     * Minimum extractionConfidence for a clause to be eligible to generate issues.
     * Clauses below this are accepted but never used in issue generation.
     */
    clauseMinConfidence: 0.6,

    /**
     * Minimum confidence for an AuditIssue to be included in the final audit.
     * Issues below this are excluded from the returned result set.
     */
    issueMinConfidence: 0.7,

    /**
     * Multiplier applied to extractionConfidence when a clause fails all three
     * verification tiers (UNVERIFIED). This is a severe penalty — it signals
     * to downstream consumers that this claim is unanchored.
     */
    unverifiedPenalty: 0.4,

    /**
     * After all confidence adjustments, issues below this threshold are demoted
     * from AuditIssue to AuditWarning. They are not lost — they surface in the
     * warnings array for review but don't reach the main audit findings.
     */
    warningThreshold: 0.5,
});
