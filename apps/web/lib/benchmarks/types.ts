// ============================================================
// apps/web/lib/benchmarks/types.ts
// ============================================================
// Module-internal types for the benchmarks module.
// NOT exported to packages/types.
// ============================================================

// ---------------------------------------------------------------------------
// Wealthsimple rate config
// ---------------------------------------------------------------------------

export interface WealthsimpleRateEntry {
    /** Annualized rate as a percentage (e.g., 3.94 for 3.94%) */
    rate: number;
    /** Canonical URL for this product — used as citation reference */
    url: string;
}

export interface WealthsimpleRateConfig {
    /** ISO 8601 datetime — date this config was last hand-updated */
    lastUpdated: string;
    products: {
        mortgage: {
            fixed1yr: WealthsimpleRateEntry;
            fixed2yr: WealthsimpleRateEntry;
            fixed3yr: WealthsimpleRateEntry;
            fixed5yr: WealthsimpleRateEntry;
            variable: WealthsimpleRateEntry;
        };
        savings: {
            interestRate: WealthsimpleRateEntry;
        };
        gic: {
            rate1yr: WealthsimpleRateEntry;
            rate3yr: WealthsimpleRateEntry;
            rate5yr: WealthsimpleRateEntry;
        };
        managedInvesting: {
            /** Management expense ratio (annualized %) */
            mer: WealthsimpleRateEntry;
        };
    };
}

// ---------------------------------------------------------------------------
// Bank of Canada rate config
// ---------------------------------------------------------------------------

export interface BocRateEntry {
    /** Annualized rate as a percentage (e.g., 4.45 for 4.45%) */
    rate: number;
    /** Effective date of this rate (ISO 8601) */
    effectiveDate: string;
    /** Canonical BOC reference URL */
    url: string;
}

export interface BocRateConfig {
    /** ISO 8601 datetime — date this config was last hand-updated */
    lastUpdated: string;
    rates: {
        primeRate: BocRateEntry;
        overnightRate: BocRateEntry;
        mortgage: {
            posted1yr: BocRateEntry;
            posted3yr: BocRateEntry;
            posted5yr: BocRateEntry;
        };
    };
}

// ---------------------------------------------------------------------------
// Benchmark lookup key
// ---------------------------------------------------------------------------

/**
 * Maps a clause's semantic identity to a benchmark source category.
 * The lookup.ts uses this to find the most relevant benchmark.
 */
export interface BenchmarkLookupKey {
    /**
     * Category tag used to filter BenchmarkDataPoint candidates.
     * Matches the `category` field stored in benchmark data.
     */
    benchmarkCategory: string;
    /**
     * Expected unit for the matched benchmark (e.g., "percent", "CAD").
     * Used for unit-compatibility filtering in the resolver.
     */
    expectedUnit: string;
    /**
     * Preferred source name for this clause type.
     * Resolver uses this as a hint but still applies full priority cascade.
     */
    preferredSource?: string;
}

// ---------------------------------------------------------------------------
// Staleness report
// ---------------------------------------------------------------------------

export interface StaleEntry {
    sourceName: string;
    category: string;
    asOfDate: Date;
}

export interface StaleReport {
    staleEntries: StaleEntry[];
    hasStaleData: boolean;
    thresholdDays: number;
}
