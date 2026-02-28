// ============================================================
// apps/web/lib/analysis/severity.ts
// ============================================================
// Deviation threshold configuration and severity assignment.
// All thresholds are defined as exported constants so they are
// auditable and tunable without code changes.
// No async, no I/O, no side effects.
// ============================================================

import { SeverityLevel } from "@auditsimple/types";

/**
 * Per-category deviation thresholds that map a numeric delta
 * to a severity band.
 *
 * Units:
 *   interest_rate    — percentage points above market
 *   fees             — CAD above market
 *   penalties        — CAD above market
 *   insurance        — CAD/month above market
 *   early_termination— CAD above market
 *   other            — CAD (default fallback)
 */
export const DEVIATION_THRESHOLDS: Record<
    string,
    { low: number; medium: number; high: number }
> = {
    interest_rate: { low: 0.25, medium: 0.75, high: 1.5 }, // percentage points
    fees: { low: 50, medium: 200, high: 500 }, // CAD
    penalties: { low: 100, medium: 500, high: 2000 }, // CAD
    insurance: { low: 25, medium: 100, high: 300 }, // CAD/month
    early_termination: { low: 200, medium: 1000, high: 5000 }, // CAD
    other: { low: 50, medium: 200, high: 1000 }, // CAD (default)
};

/**
 * Maps a numeric deviation delta to a SeverityLevel.
 *
 * @param delta    Absolute deviation (contract value − benchmark value).
 *                 Negative or zero means favorable / no issue → INFO.
 * @param category The clause category (must match DEVIATION_THRESHOLDS key
 *                 or falls back to "other").
 */
export function assignSeverity(delta: number, category: string): SeverityLevel {
    const t = DEVIATION_THRESHOLDS[category] ?? DEVIATION_THRESHOLDS["other"];

    if (delta <= 0) return SeverityLevel.INFO;
    if (delta <= t.low) return SeverityLevel.LOW;
    if (delta <= t.medium) return SeverityLevel.MEDIUM;
    if (delta <= t.high) return SeverityLevel.HIGH;
    return SeverityLevel.CRITICAL;
}
