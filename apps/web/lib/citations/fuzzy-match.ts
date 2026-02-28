// ============================================================
// apps/web/lib/citations/fuzzy-match.ts
// ============================================================
// Tier 2: Fuzzy string matching via a sliding window + Jaro-Winkler.
// Handles OCR artifacts and minor LLM paraphrasing.
//
// Complexity: O(pages × page_length × window_sizes × needle_length)
// For documents up to 100 pages this is acceptable for the MVP.
// TODO: optimize with n-gram index for large documents
// ============================================================

import type { PageText, MatchResult, CitationMatchConfig } from "./types";
import { jaroWinklerSimilarity } from "./similarity";
import { CITATION_MATCH_CONFIG } from "./config";

// ---------------------------------------------------------------------------
// Normalization helper (duplicated intentionally to keep each file self-contained)
// ---------------------------------------------------------------------------

function normalize(text: string, config: CitationMatchConfig): string {
    let t = text;
    if (config.normalizeWhitespace) t = t.replace(/\s+/g, " ").trim();
    if (config.caseInsensitive) t = t.toLowerCase();
    return t;
}

// ---------------------------------------------------------------------------
// Fuzzy match
// ---------------------------------------------------------------------------

/**
 * Tier 2 verification: sliding-window fuzzy match using Jaro-Winkler similarity.
 *
 * Slides windows of varying size (verbatimText.length ± 20%) across each page's
 * text, computing Jaro-Winkler at every position. Returns the globally best match
 * if its score meets or exceeds `config.minSimilarityThreshold` (default 0.85).
 *
 * The ±20% window size accounts for minor extraction differences where the LLM
 * slightly expanded or contracted the verbatim quote.
 *
 * Returns null if no window exceeds the threshold.
 *
 * @param verbatimText - The needle to search for
 * @param pageTexts    - All pages of the document with positional metadata
 * @param config       - Matching configuration (thresholds, normalization)
 */
export function findFuzzyMatch(
    verbatimText: string,
    pageTexts: PageText[],
    config: CitationMatchConfig = CITATION_MATCH_CONFIG,
): MatchResult | null {
    if (!verbatimText || verbatimText.trim().length === 0) {
        return null;
    }

    const needle = normalize(verbatimText, config);

    // Window size bounds: ±20% of needle length
    const windowMin = Math.max(1, Math.floor(needle.length * 0.8));
    const windowMax = Math.ceil(needle.length * 1.2);

    let bestMatch: {
        page: number;
        start: number;
        end: number;
        score: number;
    } | null = null;

    // TODO: optimize with n-gram index for large documents
    for (const page of pageTexts) {
        const haystack = normalize(page.text, config);

        // Skip pages where the haystack is shorter than the minimum window
        if (haystack.length < windowMin) continue;

        for (let winSize = windowMin; winSize <= windowMax; winSize++) {
            for (let i = 0; i <= haystack.length - winSize; i++) {
                const window = haystack.slice(i, i + winSize);
                const score = jaroWinklerSimilarity(needle, window);

                if (
                    score >= config.minSimilarityThreshold &&
                    (!bestMatch || score > bestMatch.score)
                ) {
                    bestMatch = { page: page.pageNumber, start: i, end: i + winSize, score };
                }
            }
        }
    }

    if (!bestMatch) return null;

    // Retrieve the raw matched text from the original (un-normalised) page.
    // We use the offsets found in the normalised haystack as an approximation.
    // This is acceptable because the normalised string length is close to the
    // original when only collapsing whitespace (no character substitution).
    const rawPage = pageTexts.find(p => p.pageNumber === bestMatch!.page);
    const matchedText = rawPage
        ? rawPage.text.slice(bestMatch.start, bestMatch.end)
        : verbatimText;

    return {
        pageNumber: bestMatch.page,
        charOffsetStart: bestMatch.start,
        charOffsetEnd: bestMatch.end,
        matchedText,
        similarity: bestMatch.score,
    };
}
