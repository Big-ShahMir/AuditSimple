// ============================================================
// apps/web/lib/citations/types.ts
// ============================================================
// Module-internal types for the citations module.
// NOT exported to packages/types.
// ============================================================

import type { AuditIssue, AuditWarning, ExtractedClause, SourceLocation } from "@auditsimple/types";

// ---------------------------------------------------------------------------
// Re-aliases from AgentState for readability
// ---------------------------------------------------------------------------

/**
 * A single word with its position metadata from OCR/extraction.
 * Re-aliased from AgentState["pageTexts"][number]["wordPositions"][number].
 */
export interface WordPosition {
    word: string;
    boundingBox: SourceLocation["boundingBox"];
    /** Character offset of this word's first character within the page text */
    charOffset: number;
}

/**
 * A single page of document text with word-level positional metadata.
 * Re-aliased from AgentState["pageTexts"][number] for readability.
 */
export interface PageText {
    /** 1-indexed page number */
    pageNumber: number;
    /** Full page text */
    text: string;
    /** Word-level bounding boxes from OCR/extraction */
    wordPositions: WordPosition[];
}

// ---------------------------------------------------------------------------
// Matching configuration
// ---------------------------------------------------------------------------

/**
 * Configuration controlling how the citation matcher operates.
 * All fields are read from CITATION_MATCH_CONFIG at runtime.
 */
export interface CitationMatchConfig {
    /**
     * Minimum Jaro-Winkler similarity score to accept a fuzzy match.
     * Range: 0-1. Default: 0.85.
     */
    minSimilarityThreshold: number;
    /**
     * If true, collapse all whitespace sequences to a single space
     * and trim before comparing.
     */
    normalizeWhitespace: boolean;
    /**
     * If true, lowercase both strings before comparing.
     */
    caseInsensitive: boolean;
}

// ---------------------------------------------------------------------------
// Match result
// ---------------------------------------------------------------------------

/**
 * Returned by all three verification tiers when a match is found.
 * Contains everything needed to anchor a SourceLocation.
 */
export interface MatchResult {
    /** 1-indexed page number where the match was found */
    pageNumber: number;
    /** Character offset of match start within page text */
    charOffsetStart: number;
    /** Character offset of match end within page text */
    charOffsetEnd: number;
    /** The actual text from the source document that was matched */
    matchedText: string;
    /**
     * Jaro-Winkler similarity score (0-1).
     * 1.0 for exact matches, <1 for fuzzy/re-extracted matches.
     */
    similarity: number;
}

// ---------------------------------------------------------------------------
// Verification result
// ---------------------------------------------------------------------------

/**
 * Output shape of verifyCitations().
 * Contains the updated clauses (with anchored SourceLocations),
 * a list of clause IDs that could not be verified, and any
 * warnings generated during the verification process.
 */
export interface VerificationResult {
    /** All clauses — verified with anchored bounding boxes, or unverified with penalized confidence */
    verifiedClauses: ExtractedClause[];
    /** IDs of clauses that failed all three verification tiers */
    unverifiedClauseIds: string[];
    /** Warnings generated during verification (e.g. L3_CITE_NO_MATCH, L4_RENDER_CITATION_FAILED) */
    warnings: AuditWarning[];
}

// ---------------------------------------------------------------------------
// Hallucination report
// ---------------------------------------------------------------------------

/** A single flagged hallucination finding for one clause */
export interface HallucinationFlag {
    clauseId: string;
    checkName:
    | "PHANTOM_CLAUSE"
    | "NUMERIC_DRIFT"
    | "GHOST_PAGE"
    | "SELF_CONTRADICTION"
    | "EMPTY_VERBATIM";
    reason: string;
}

/**
 * Output shape of runHallucinationChecks().
 * Contains all flags found across all five checks.
 */
export interface HallucinationReport {
    flags: HallucinationFlag[];
    /** Total number of flags found */
    totalFlags: number;
    /** Unique clause IDs that were flagged by at least one check */
    flaggedClauseIds: string[];
}

// ---------------------------------------------------------------------------
// Confidence gate result
// ---------------------------------------------------------------------------

/**
 * Output shape of gateConfidence().
 * Issues that pass become part of the final audit.
 * Issues that fail are demoted to AuditWarning.
 */
export interface GateResult {
    /** Issues that passed all confidence thresholds — go into the final audit */
    passedIssues: AuditIssue[];
    /** Clauses that passed the minimum confidence threshold */
    passedClauses: ExtractedClause[];
    /** Issues demoted because confidence fell below warningThreshold */
    demotedWarnings: AuditWarning[];
}
