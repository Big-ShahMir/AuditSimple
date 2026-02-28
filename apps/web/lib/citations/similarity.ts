// ============================================================
// apps/web/lib/citations/similarity.ts
// ============================================================
// String similarity algorithms — implemented from scratch.
// NO npm dependencies. These are purposely kept in-module to
// eliminate supply chain risk for a security-sensitive application.
// ============================================================

// ---------------------------------------------------------------------------
// Jaro-Winkler Similarity
// ---------------------------------------------------------------------------

/**
 * Computes the Jaro-Winkler similarity between two strings.
 *
 * The Jaro score measures the number and order of common characters.
 * The Winkler adjustment boosts scores for strings that share a
 * common prefix (up to 4 characters), reflecting the observation that
 * agreement at the start of a string is more significant.
 *
 * Returns a value in [0, 1]:
 *   - 1.0 = identical strings
 *   - 0.0 = completely dissimilar
 *
 * Algorithm:
 *   1. Compute the Jaro similarity (matching window, transpositions)
 *   2. Find the common prefix length (max 4 chars)
 *   3. jaro_winkler = jaro + (prefix * p * (1 - jaro))
 *      where p = 0.1 (the standard Winkler prefix scaling factor)
 *
 * @param a - First string
 * @param b - Second string
 */
export function jaroWinklerSimilarity(a: string, b: string): number {
    // Edge cases
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    // The matching window: characters within this distance are considered matching.
    // Classic Jaro definition: floor(max(|s1|, |s2|) / 2) - 1
    const matchDistance = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);

    const aMatched = new Array(a.length).fill(false);
    const bMatched = new Array(b.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    // Pass 1: Find matching characters
    for (let i = 0; i < a.length; i++) {
        const start = Math.max(0, i - matchDistance);
        const end = Math.min(i + matchDistance + 1, b.length);

        for (let j = start; j < end; j++) {
            if (bMatched[j] || a[i] !== b[j]) continue;
            aMatched[i] = true;
            bMatched[j] = true;
            matches++;
            break;
        }
    }

    if (matches === 0) return 0.0;

    // Pass 2: Count transpositions
    // A transposition is a matched character that is in a different order.
    let k = 0;
    for (let i = 0; i < a.length; i++) {
        if (!aMatched[i]) continue;
        while (!bMatched[k]) k++;
        if (a[i] !== b[k]) transpositions++;
        k++;
    }

    // Jaro similarity
    const jaro =
        (matches / a.length +
            matches / b.length +
            (matches - transpositions / 2) / matches) /
        3;

    // Winkler prefix adjustment
    // Common prefix length, capped at 4
    const MAX_PREFIX = 4;
    const WINKLER_SCALING = 0.1;

    let prefixLength = 0;
    for (let i = 0; i < Math.min(a.length, b.length, MAX_PREFIX); i++) {
        if (a[i] !== b[i]) break;
        prefixLength++;
    }

    return jaro + prefixLength * WINKLER_SCALING * (1 - jaro);
}

// ---------------------------------------------------------------------------
// Levenshtein Distance
// ---------------------------------------------------------------------------

/**
 * Computes the Levenshtein edit distance between two strings.
 *
 * The edit distance is the minimum number of single-character edits
 * (insertions, deletions, or substitutions) required to transform
 * string `a` into string `b`.
 *
 * Uses a standard bottom-up DP matrix approach with O(n × m) time
 * and O(n × m) space where n = a.length and m = b.length.
 *
 * Returns a non-negative integer:
 *   - 0 = identical strings
 *   - Higher = more different
 *
 * @param a - Source string
 * @param b - Target string
 */
export function levenshteinDistance(a: string, b: string): number {
    // Edge cases
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    // Build DP matrix of size (a.length+1) × (b.length+1)
    // dp[i][j] = edit distance between a.slice(0, i) and b.slice(0, j)
    const dp: number[][] = [];

    for (let i = 0; i <= a.length; i++) {
        dp[i] = new Array(b.length + 1).fill(0);
        dp[i][0] = i; // Deleting all chars from a[0..i]
    }

    for (let j = 0; j <= b.length; j++) {
        dp[0][j] = j; // Inserting all chars of b[0..j]
    }

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            if (a[i - 1] === b[j - 1]) {
                // Characters match — no additional cost
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(
                    dp[i - 1][j],     // deletion
                    dp[i][j - 1],     // insertion
                    dp[i - 1][j - 1], // substitution
                );
            }
        }
    }

    return dp[a.length][b.length];
}
