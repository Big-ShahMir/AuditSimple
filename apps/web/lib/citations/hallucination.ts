// ============================================================
// apps/web/lib/citations/hallucination.ts
// ============================================================
// Deterministic hallucination detection heuristics.
// Five checks run over all clauses — fully deterministic,
// no LLM calls. Each check produces flagged clause IDs + reasons.
// ============================================================

import type { ExtractedClause } from "@auditsimple/types";
import type { PageText, HallucinationFlag, HallucinationReport } from "./types";
import { findFuzzyMatch } from "./fuzzy-match";
import { CITATION_MATCH_CONFIG } from "./config";

// ---------------------------------------------------------------------------
// Helper: deduplicate array
// ---------------------------------------------------------------------------

function unique<T>(arr: T[]): T[] {
    return [...new Set(arr)];
}

// ---------------------------------------------------------------------------
// Check 1: Phantom Clause
// ---------------------------------------------------------------------------

/**
 * A "phantom clause" is one whose verbatimText has ZERO fuzzy matches
 * anywhere in the document. It means the LLM invented a clause that
 * does not appear anywhere in the source — the strongest hallucination signal.
 *
 * Uses Tier 2 fuzzy matching so minor OCR artifacts don't produce false positives.
 */
function checkPhantomClauses(
    clauses: ExtractedClause[],
    pageTexts: PageText[],
): HallucinationFlag[] {
    const flags: HallucinationFlag[] = [];

    for (const clause of clauses) {
        const verbatim = clause.source.verbatimText;

        // Empty verbatim is caught by a separate check
        if (!verbatim || verbatim.trim().length === 0) continue;

        const match = findFuzzyMatch(verbatim, pageTexts, CITATION_MATCH_CONFIG);

        if (!match) {
            flags.push({
                clauseId: clause.clauseId,
                checkName: "PHANTOM_CLAUSE",
                reason: `verbatimText "${verbatim.slice(0, 60)}..." has zero fuzzy matches in the document`,
            });
        }
    }

    return flags;
}

// ---------------------------------------------------------------------------
// Check 2: Numeric Drift
// ---------------------------------------------------------------------------

/**
 * Numeric drift occurs when a clause carries a `numericValue` that does NOT
 * appear (within ±1%) in the `verbatimText` from the source document.
 *
 * This catches the specific hallucination pattern where the LLM changes a
 * number (e.g., rounds 4.99% to 5%) while quoting a real passage.
 *
 * Returns true if the clause is CONSISTENT (no drift), false if drifted.
 */
function checkNumericDrift(clause: ExtractedClause): boolean {
    if (clause.numericValue === null) return true; // no numeric claim → no drift possible

    // Extract all numbers from verbatimText (handles commas in thousands, decimals)
    const numbersInText =
        clause.source.verbatimText
            .match(/[\d,]+\.?\d*/g)
            ?.map((n) => parseFloat(n.replace(/,/g, "")))
            .filter((n) => !isNaN(n)) ?? [];

    const numericValue = clause.numericValue;

    // Guard against division by zero
    if (Math.abs(numericValue) === 0) {
        return numbersInText.some((n) => n === 0);
    }

    // Check if any extracted number is within ±1% of the claimed numericValue
    return numbersInText.some(
        (n) => Math.abs(n - numericValue) / Math.abs(numericValue) <= 0.01,
    );
}

function checkAllNumericDrift(clauses: ExtractedClause[]): HallucinationFlag[] {
    const flags: HallucinationFlag[] = [];

    for (const clause of clauses) {
        if (!checkNumericDrift(clause)) {
            flags.push({
                clauseId: clause.clauseId,
                checkName: "NUMERIC_DRIFT",
                reason:
                    `numericValue ${clause.numericValue} is not within ±1% of any ` +
                    `number found in verbatimText: "${clause.source.verbatimText.slice(0, 80)}..."`,
            });
        }
    }

    return flags;
}

// ---------------------------------------------------------------------------
// Check 3: Ghost Page
// ---------------------------------------------------------------------------

/**
 * A "ghost page" is when a clause claims to come from a page number that
 * does not exist in the document. This is an unambiguous error — the clause
 * is anchored to a non-existent page.
 */
function checkGhostPages(
    clauses: ExtractedClause[],
    pageTexts: PageText[],
): HallucinationFlag[] {
    const flags: HallucinationFlag[] = [];
    const maxPage = pageTexts.length;

    for (const clause of clauses) {
        if (clause.source.pageNumber > maxPage || clause.source.pageNumber < 1) {
            flags.push({
                clauseId: clause.clauseId,
                checkName: "GHOST_PAGE",
                reason:
                    `source.pageNumber ${clause.source.pageNumber} exceeds actual ` +
                    `document page count (${maxPage} pages)`,
            });
        }
    }

    return flags;
}

// ---------------------------------------------------------------------------
// Check 4: Self-Contradiction
// ---------------------------------------------------------------------------

/**
 * Self-contradiction is detected when two clauses share the same `label`
 * but have conflicting `numericValue`s. This typically happens when the LLM
 * extracts the same clause twice with inconsistent values.
 *
 * Conflicting = both are non-null and differ by more than ±1%.
 * We flag BOTH clauses in a contradicting pair.
 */
function checkSelfContradictions(clauses: ExtractedClause[]): HallucinationFlag[] {
    const flags: HallucinationFlag[] = [];

    // Group clauses by label
    const byLabel = new Map<string, ExtractedClause[]>();
    for (const clause of clauses) {
        const existing = byLabel.get(clause.label) ?? [];
        existing.push(clause);
        byLabel.set(clause.label, existing);
    }

    for (const [label, group] of byLabel.entries()) {
        // Only check groups with more than one clause
        if (group.length < 2) continue;

        // Check every pair
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const a = group[i];
                const b = group[j];

                // Skip if either clause has no numeric value
                if (a.numericValue === null || b.numericValue === null) continue;

                // Skip if both are zero (avoid division-by-zero)
                const denominator = Math.max(Math.abs(a.numericValue), Math.abs(b.numericValue));
                if (denominator === 0) continue;

                const difference = Math.abs(a.numericValue - b.numericValue);
                const relativeDiff = difference / denominator;

                if (relativeDiff > 0.01) {
                    // Flag both clauses in this contradicting pair
                    const reason =
                        `Two "${label}" clauses have conflicting numericValues: ` +
                        `${a.numericValue} (clauseId: ${a.clauseId}) vs ${b.numericValue} (clauseId: ${b.clauseId})`;

                    flags.push({ clauseId: a.clauseId, checkName: "SELF_CONTRADICTION", reason });
                    flags.push({ clauseId: b.clauseId, checkName: "SELF_CONTRADICTION", reason });
                }
            }
        }
    }

    return flags;
}

// ---------------------------------------------------------------------------
// Check 5: Empty Verbatim
// ---------------------------------------------------------------------------

/**
 * If `verbatimText` is empty or whitespace-only, the clause has no
 * citation anchor at all. This is a fundamental data quality failure.
 */
function checkEmptyVerbatim(clauses: ExtractedClause[]): HallucinationFlag[] {
    const flags: HallucinationFlag[] = [];

    for (const clause of clauses) {
        if (!clause.source.verbatimText || clause.source.verbatimText.trim().length === 0) {
            flags.push({
                clauseId: clause.clauseId,
                checkName: "EMPTY_VERBATIM",
                reason: "source.verbatimText is empty or whitespace-only — no citation anchor",
            });
        }
    }

    return flags;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Runs all five deterministic hallucination checks over the extracted clauses.
 *
 * All five checks are fully deterministic — no LLM calls, no side effects.
 * Returns a HallucinationReport summarising all flags found.
 *
 * @param clauses   - Extracted clauses from the document
 * @param pageTexts - Full document text with word positions (read-only)
 */
export function runHallucinationChecks(
    clauses: ExtractedClause[],
    pageTexts: PageText[],
): HallucinationReport {
    const flags: HallucinationFlag[] = [
        ...checkPhantomClauses(clauses, pageTexts),    // 1. Phantom clause
        ...checkAllNumericDrift(clauses),               // 2. Numeric drift
        ...checkGhostPages(clauses, pageTexts),         // 3. Ghost page
        ...checkSelfContradictions(clauses),            // 4. Self-contradiction
        ...checkEmptyVerbatim(clauses),                 // 5. Empty verbatim
    ];

    const flaggedClauseIds = unique(flags.map((f) => f.clauseId));

    return {
        flags,
        totalFlags: flags.length,
        flaggedClauseIds,
    };
}
