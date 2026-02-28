// ============================================================
// apps/web/lib/benchmarks/resolver.ts
// ============================================================
// Benchmark resolution logic — priority cascade.
// Pure function, no async, no side effects.
// ============================================================

import type { BenchmarkDataPoint } from "@auditsimple/types";
import type { ContractType } from "@auditsimple/types";
import { getSourcePriority } from "./sources/index";

// ---------------------------------------------------------------------------
// Category matching
// ---------------------------------------------------------------------------

/**
 * Returns true if the BenchmarkDataPoint's sourceName contains the expected
 * benchmark category. The sourceName encoding convention is:
 *   "<Source> | <category>"
 * e.g., "Wealthsimple | mortgage_fixed_5yr"
 *
 * We extract the category fragment (after the pipe) and compare it to the
 * expected benchmarkCategory from the lookup key.
 */
function matchesCategory(
    point: BenchmarkDataPoint,
    benchmarkCategory: string,
): boolean {
    const pipeIdx = point.sourceName.indexOf("|");
    if (pipeIdx === -1) {
        // Legacy / DB entries without pipe encoding — try direct contains
        return point.sourceName
            .toLowerCase()
            .includes(benchmarkCategory.toLowerCase());
    }
    const category = point.sourceName.slice(pipeIdx + 1).trim().toLowerCase();
    return category === benchmarkCategory.toLowerCase();
}

// ---------------------------------------------------------------------------
// Unit compatibility
// ---------------------------------------------------------------------------

/**
 * Returns true when the benchmark unit is compatible with the clause unit.
 * We treat "percent", "%", and "annualized_percent" as interchangeable.
 * CAD, "CAD", and "dollars" are treated as interchangeable.
 */
function isUnitCompatible(
    benchmarkUnit: string,
    clauseUnit: string | null,
): boolean {
    if (!clauseUnit) return true; // no unit constraint — accept any

    const normalize = (u: string) =>
        u.toLowerCase().replace(/[^a-z]/g, "").replace("annualizedpercent", "percent");

    const b = normalize(benchmarkUnit);
    const c = normalize(clauseUnit);

    if (b === c) return true;

    const percentGroup = new Set(["percent", "pct", ""]);
    const cadGroup = new Set(["cad", "dollars", "dollar"]);

    if (percentGroup.has(b) && percentGroup.has(c)) return true;
    if (cadGroup.has(b) && cadGroup.has(c)) return true;

    return false;
}

// ---------------------------------------------------------------------------
// Source name prefix extraction for priority lookup
// ---------------------------------------------------------------------------

/**
 * Extracts the source prefix from a pipe-encoded sourceName.
 * "Wealthsimple | mortgage_fixed_5yr" → "Wealthsimple"
 */
function extractSourcePrefix(sourceName: string): string {
    const pipeIdx = sourceName.indexOf("|");
    return pipeIdx === -1
        ? sourceName.trim()
        : sourceName.slice(0, pipeIdx).trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves the single best BenchmarkDataPoint for the given clause metadata.
 *
 * Priority cascade:
 * 1. Filter by benchmarkCategory match
 * 2. Filter by unit compatibility
 * 3. Sort by source priority (Wealthsimple > BOC > Historical)
 * 4. Break ties by recency (most recent asOfDate)
 *
 * Returns null if no candidates survive filtering.
 *
 * @param benchmarkCategory - semantic category key from category-map
 * @param unit              - clause unit for compatibility check
 * @param contractType      - contract type (reserved for future filtering)
 * @param candidates        - pool of BenchmarkDataPoint from all sources
 */
export function resolveBestBenchmark(
    benchmarkCategory: string,
    unit: string | null,
    contractType: ContractType,
    candidates: BenchmarkDataPoint[],
): BenchmarkDataPoint | null {
    const matched = candidates
        .filter((c) => matchesCategory(c, benchmarkCategory))
        .filter((c) => isUnitCompatible(c.unit, unit))
        .sort((a, b) => {
            // Primary sort: source priority (lower score = better)
            const priorityDiff =
                getSourcePriority(extractSourcePrefix(a.sourceName)) -
                getSourcePriority(extractSourcePrefix(b.sourceName));
            if (priorityDiff !== 0) return priorityDiff;

            // Secondary sort: recency (newer asOfDate = better)
            return (
                new Date(b.asOfDate).getTime() - new Date(a.asOfDate).getTime()
            );
        });

    return matched[0] ?? null;
}
