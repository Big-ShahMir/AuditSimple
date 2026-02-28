// ============================================================
// apps/web/lib/benchmarks/sources/index.ts
// ============================================================
// Source aggregator — merges all rate configs into a flat list
// of BenchmarkDataPoint objects for use by the resolver.
// ============================================================

import type { BenchmarkDataPoint } from "@auditsimple/types";
import { WEALTHSIMPLE_RATES } from "./wealthsimple";
import { BOC_RATES } from "./bank-of-canada";

// ---------------------------------------------------------------------------
// Source priority map (lower number = higher priority)
// ---------------------------------------------------------------------------
const SOURCE_PRIORITY: Record<string, number> = {
    Wealthsimple: 1,
    "Bank of Canada": 2,
    "Historical Average": 3,
};

/**
 * Returns the priority score for a given source name.
 * Lower score = higher priority. Unknown sources default to 99.
 */
export function getSourcePriority(sourceName: string): number {
    return SOURCE_PRIORITY[sourceName] ?? 99;
}

// ---------------------------------------------------------------------------
// Rate expansion helpers
// ---------------------------------------------------------------------------

function wsEntry(
    sourceName: string,
    category: string,
    rate: number,
    unit: string,
    url: string,
    asOfDate: string,
): BenchmarkDataPoint {
    return {
        sourceName,
        value: rate,
        unit,
        asOfDate,
        referenceUrl: url,
    };
}

function bocEntry(
    sourceName: string,
    category: string,
    rate: number,
    effectiveDate: string,
    url: string,
): BenchmarkDataPoint {
    return {
        sourceName,
        value: rate,
        unit: "percent",
        asOfDate: effectiveDate + "T00:00:00Z",
        referenceUrl: url,
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Merges all source configs into a flat list of BenchmarkDataPoint objects.
 * Called by the resolver to obtain the full candidate pool.
 *
 * NOTE: The `sourceName` field encodes both the origin and the semantic
 * category so the resolver's matchesCategory() helper can pattern-match
 * without needing a separate category field on BenchmarkDataPoint
 * (which the shared interface doesn't have).
 *
 * Naming convention: "<Source> | <category>"
 * e.g., "Wealthsimple | mortgage_fixed_5yr"
 */
export function getAllCurrentRates(): BenchmarkDataPoint[] {
    const ws = WEALTHSIMPLE_RATES;
    const boc = BOC_RATES;
    const wsDate = ws.lastUpdated;

    return [
        // ── Wealthsimple mortgage rates ──────────────────────────────────────
        wsEntry(
            "Wealthsimple | mortgage_fixed_1yr",
            "mortgage_fixed_1yr",
            ws.products.mortgage.fixed1yr.rate,
            "percent",
            ws.products.mortgage.fixed1yr.url,
            wsDate,
        ),
        wsEntry(
            "Wealthsimple | mortgage_fixed_2yr",
            "mortgage_fixed_2yr",
            ws.products.mortgage.fixed2yr.rate,
            "percent",
            ws.products.mortgage.fixed2yr.url,
            wsDate,
        ),
        wsEntry(
            "Wealthsimple | mortgage_fixed_3yr",
            "mortgage_fixed_3yr",
            ws.products.mortgage.fixed3yr.rate,
            "percent",
            ws.products.mortgage.fixed3yr.url,
            wsDate,
        ),
        wsEntry(
            "Wealthsimple | mortgage_fixed_5yr",
            "mortgage_fixed_5yr",
            ws.products.mortgage.fixed5yr.rate,
            "percent",
            ws.products.mortgage.fixed5yr.url,
            wsDate,
        ),
        wsEntry(
            "Wealthsimple | mortgage_variable",
            "mortgage_variable",
            ws.products.mortgage.variable.rate,
            "percent",
            ws.products.mortgage.variable.url,
            wsDate,
        ),

        // ── Wealthsimple savings ──────────────────────────────────────────────
        wsEntry(
            "Wealthsimple | savings",
            "savings",
            ws.products.savings.interestRate.rate,
            "percent",
            ws.products.savings.interestRate.url,
            wsDate,
        ),

        // ── Wealthsimple GIC rates ────────────────────────────────────────────
        wsEntry(
            "Wealthsimple | gic_1yr",
            "gic_1yr",
            ws.products.gic.rate1yr.rate,
            "percent",
            ws.products.gic.rate1yr.url,
            wsDate,
        ),
        wsEntry(
            "Wealthsimple | gic_3yr",
            "gic_3yr",
            ws.products.gic.rate3yr.rate,
            "percent",
            ws.products.gic.rate3yr.url,
            wsDate,
        ),
        wsEntry(
            "Wealthsimple | gic_5yr",
            "gic_5yr",
            ws.products.gic.rate5yr.rate,
            "percent",
            ws.products.gic.rate5yr.url,
            wsDate,
        ),

        // ── Wealthsimple managed investing MER ───────────────────────────────
        wsEntry(
            "Wealthsimple | managed_investing_mer",
            "managed_investing_mer",
            ws.products.managedInvesting.mer.rate,
            "percent",
            ws.products.managedInvesting.mer.url,
            wsDate,
        ),

        // ── Bank of Canada rates ──────────────────────────────────────────────
        bocEntry(
            "Bank of Canada | prime_rate",
            "prime_rate",
            boc.rates.primeRate.rate,
            boc.rates.primeRate.effectiveDate,
            boc.rates.primeRate.url,
        ),
        bocEntry(
            "Bank of Canada | overnight_rate",
            "overnight_rate",
            boc.rates.overnightRate.rate,
            boc.rates.overnightRate.effectiveDate,
            boc.rates.overnightRate.url,
        ),
        bocEntry(
            "Bank of Canada | mortgage_posted_1yr",
            "mortgage_posted_1yr",
            boc.rates.mortgage.posted1yr.rate,
            boc.rates.mortgage.posted1yr.effectiveDate,
            boc.rates.mortgage.posted1yr.url,
        ),
        bocEntry(
            "Bank of Canada | mortgage_posted_3yr",
            "mortgage_posted_3yr",
            boc.rates.mortgage.posted3yr.rate,
            boc.rates.mortgage.posted3yr.effectiveDate,
            boc.rates.mortgage.posted3yr.url,
        ),
        bocEntry(
            "Bank of Canada | mortgage_posted_5yr",
            "mortgage_posted_5yr",
            boc.rates.mortgage.posted5yr.rate,
            boc.rates.mortgage.posted5yr.effectiveDate,
            boc.rates.mortgage.posted5yr.url,
        ),
    ];
}
