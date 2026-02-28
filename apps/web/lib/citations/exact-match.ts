// ============================================================
// apps/web/lib/citations/exact-match.ts
// ============================================================
// Tier 1: Exact string matching.
// Fast path — O(n) scan per clause across all pages.
// ============================================================

import type { PageText, MatchResult, CitationMatchConfig } from "./types";
import { CITATION_MATCH_CONFIG } from "./config";

// ---------------------------------------------------------------------------
// Normalization helper
// ---------------------------------------------------------------------------

/**
 * Normalises text for comparison per the active config.
 * Called on both the needle (verbatimText) and each page's haystack.
 */
function normalize(text: string, config: Pick<CitationMatchConfig, "normalizeWhitespace" | "caseInsensitive">): string {
    let t = text;
    if (config.normalizeWhitespace) t = t.replace(/\s+/g, " ").trim();
    if (config.caseInsensitive) t = t.toLowerCase();
    return t;
}

// ---------------------------------------------------------------------------
// Exact match
// ---------------------------------------------------------------------------

/**
 * Tier 1 verification: searches for `verbatimText` (after whitespace
 * normalization) as an exact substring across all pages.
 *
 * Returns the first match found, or null if no match exists.
 * Complexity: O(pages × page_length) — acceptable for MVP document sizes.
 *
 * @param verbatimText - The text string to search for (from ExtractedClause.source.verbatimText)
 * @param pageTexts    - The full document pages with positional metadata
 * @param config       - Optional override for normalization settings (defaults to CITATION_MATCH_CONFIG)
 */
export function findExactMatch(
    verbatimText: string,
    pageTexts: PageText[],
    config: Pick<CitationMatchConfig, "normalizeWhitespace" | "caseInsensitive"> = CITATION_MATCH_CONFIG,
): MatchResult | null {
    if (!verbatimText || verbatimText.trim().length === 0) {
        return null;
    }

    const needle = normalize(verbatimText, config);

    for (const page of pageTexts) {
        const haystack = normalize(page.text, config);
        const idx = haystack.indexOf(needle);

        if (idx !== -1) {
            // Found! Recover the raw (un-normalised) matched text from the original
            // page text using the offset we found in the normalised version.
            // Because normalisation can change character counts (whitespace collapse),
            // we need to reverse-map the offset to the original string.
            //
            // Strategy: Find the same substring in the original page text using a
            // case-insensitive search when caseInsensitive is enabled.
            const rawIdx = findRawIndex(page.text, verbatimText, config);
            const matchStart = rawIdx !== -1 ? rawIdx : idx;
            const matchEnd = matchStart + verbatimText.length;
            const matchedText = page.text.slice(matchStart, matchEnd);

            return {
                pageNumber: page.pageNumber,
                charOffsetStart: matchStart,
                charOffsetEnd: matchEnd,
                matchedText,
                similarity: 1.0,
            };
        }
    }

    return null;
}

/**
 * Finds the start index of `needle` inside `haystack` using the same
 * normalisation settings, but returns an index into the ORIGINAL (raw)
 * `haystack` string rather than the normalised one.
 *
 * This is used to recover accurate character offsets for bounding-box
 * computation when normalization changes string length (whitespace collapse).
 *
 * Returns -1 if not found.
 */
function findRawIndex(
    rawHaystack: string,
    rawNeedle: string,
    config: Pick<CitationMatchConfig, "normalizeWhitespace" | "caseInsensitive">,
): number {
    if (!config.caseInsensitive && !config.normalizeWhitespace) {
        // No normalisation at all — plain indexOf
        return rawHaystack.indexOf(rawNeedle);
    }

    if (config.caseInsensitive && !config.normalizeWhitespace) {
        // Case-insensitive only — use lower-cased indexOf
        return rawHaystack.toLowerCase().indexOf(rawNeedle.toLowerCase());
    }

    // When normalizeWhitespace is on, we do a regex-based search that ignores
    // internal whitespace differences. Build a regex from the needle that
    // allows \s+ between each non-whitespace token.
    const parts = rawNeedle
        .trim()
        .split(/\s+/)
        .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); // escape regex chars

    if (parts.length === 0) return -1;

    const pattern = parts.join("\\s+");
    const flags = config.caseInsensitive ? "i" : "";

    try {
        const regex = new RegExp(pattern, flags);
        const match = regex.exec(rawHaystack);
        return match ? match.index : -1;
    } catch {
        // Regex construction failed — fall back to plain search
        return rawHaystack.toLowerCase().indexOf(rawNeedle.toLowerCase());
    }
}
