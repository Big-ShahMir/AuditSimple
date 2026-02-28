// ============================================================
// apps/web/lib/benchmarks/category-map.ts
// ============================================================
// Maps ExtractedClause categories and labels to benchmark lookup keys.
// Not every clause type has a benchmark — unmapped clauses return null
// from the lookup function.
// ============================================================

import type { BenchmarkLookupKey } from "./types";

/**
 * Primary map: clause `category` → benchmark key.
 *
 * Used as the first resolution pass. If a clause's category maps directly
 * to a benchmark key, we use it. Note that interest_rate clauses require
 * more specific resolution (see LABEL_TO_BENCHMARK_MAP for label-level overrides).
 */
export const CATEGORY_TO_BENCHMARK_MAP: Record<string, BenchmarkLookupKey> = {
    // Interest rate clauses → default to 5yr fixed mortgage benchmark
    // (label-level map below provides more specific overrides)
    interest_rate: {
        benchmarkCategory: "mortgage_fixed_5yr",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },

    // Fee clauses — no rate benchmark; these are handled as absolute dollar deltas
    // Only specific labeled fees (e.g., NSF, annual fee) have benchmarks
    // fees: intentionally unmapped at category level — see label map

    // Penalty clauses → no direct benchmark; flagged by analysis rules
    // penalties: intentionally unmapped

    // Insurance clauses → no standard benchmark for MVP
    // insurance: intentionally unmapped

    // Collateral → no benchmark
    // collateral: intentionally unmapped

    // Term/conditions → no benchmark
    // term_conditions: intentionally unmapped

    // Rights/obligations → no benchmark
    // rights_obligations: intentionally unmapped

    // Early termination → no benchmark
    // early_termination: intentionally unmapped

    // Variable rate terms → prime rate benchmark
    variable_rate_terms: {
        benchmarkCategory: "prime_rate",
        expectedUnit: "percent",
        preferredSource: "Bank of Canada",
    },

    // Other → unmapped
    // other: intentionally unmapped
};

/**
 * Label-level override map: clause `label` (lowercased) → benchmark key.
 *
 * These override the category-level map for more specific matching.
 * Label matching is fuzzy — the lookup performs case-insensitive substring
 * matching against the keys here.
 */
export const LABEL_TO_BENCHMARK_MAP: Record<string, BenchmarkLookupKey> = {
    // ── Mortgage rate labels ──────────────────────────────────────────────
    "mortgage rate": {
        benchmarkCategory: "mortgage_fixed_5yr",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "interest rate": {
        benchmarkCategory: "mortgage_fixed_5yr",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "fixed rate": {
        benchmarkCategory: "mortgage_fixed_5yr",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "fixed 5-year": {
        benchmarkCategory: "mortgage_fixed_5yr",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "fixed 3-year": {
        benchmarkCategory: "mortgage_fixed_3yr",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "fixed 2-year": {
        benchmarkCategory: "mortgage_fixed_2yr",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "fixed 1-year": {
        benchmarkCategory: "mortgage_fixed_1yr",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "variable rate": {
        benchmarkCategory: "mortgage_variable",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "adjustable rate": {
        benchmarkCategory: "mortgage_variable",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },

    // ── Prime rate / variable mortgage labels ─────────────────────────────
    "prime rate": {
        benchmarkCategory: "prime_rate",
        expectedUnit: "percent",
        preferredSource: "Bank of Canada",
    },
    "prime": {
        benchmarkCategory: "prime_rate",
        expectedUnit: "percent",
        preferredSource: "Bank of Canada",
    },

    // ── Savings / deposit labels ──────────────────────────────────────────
    "savings rate": {
        benchmarkCategory: "savings",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "deposit rate": {
        benchmarkCategory: "savings",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "high interest savings": {
        benchmarkCategory: "savings",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "hisa": {
        benchmarkCategory: "savings",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },

    // ── GIC / term deposit labels ─────────────────────────────────────────
    "gic rate": {
        benchmarkCategory: "gic_1yr",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "term deposit": {
        benchmarkCategory: "gic_1yr",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "guaranteed investment": {
        benchmarkCategory: "gic_5yr",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },

    // ── Investment / MER labels ───────────────────────────────────────────
    "management fee": {
        benchmarkCategory: "managed_investing_mer",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "mer": {
        benchmarkCategory: "managed_investing_mer",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "management expense ratio": {
        benchmarkCategory: "managed_investing_mer",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
    "advisory fee": {
        benchmarkCategory: "managed_investing_mer",
        expectedUnit: "percent",
        preferredSource: "Wealthsimple",
    },
};

/**
 * Resolves the best BenchmarkLookupKey for a given clause category and label.
 *
 * Resolution order:
 * 1. Label-level: exact match on lowercased label
 * 2. Label-level: substring match on lowercased label
 * 3. Category-level: exact match on category
 * 4. null — this clause type has no benchmark
 */
export function resolveLookupKey(
    category: string,
    label: string,
): BenchmarkLookupKey | null {
    const normalizedLabel = label.toLowerCase().trim();

    // 1. Exact label match
    if (LABEL_TO_BENCHMARK_MAP[normalizedLabel]) {
        return LABEL_TO_BENCHMARK_MAP[normalizedLabel];
    }

    // 2. Substring label match (check if any key is a substring of the label)
    for (const [key, value] of Object.entries(LABEL_TO_BENCHMARK_MAP)) {
        if (normalizedLabel.includes(key) || key.includes(normalizedLabel)) {
            return value;
        }
    }

    // 3. Category-level match
    if (CATEGORY_TO_BENCHMARK_MAP[category]) {
        return CATEGORY_TO_BENCHMARK_MAP[category];
    }

    // 4. No match
    return null;
}
