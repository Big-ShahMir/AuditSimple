// ============================================================
// apps/web/lib/benchmarks/seed.ts
// ============================================================
// Database seed script. Reads from Wealthsimple and BOC config files
// and upserts all rates into the BenchmarkRate PostgreSQL table.
//
// Designed to run at deploy time. Idempotent — running 10x produces
// the same DB state as running once.
//
// Upsert key: [sourceName, category, asOfDate]
// ============================================================

import { prisma } from "@/lib/prisma";
import { WEALTHSIMPLE_RATES } from "./sources/wealthsimple";
import { BOC_RATES } from "./sources/bank-of-canada";
import { checkStaleness } from "./staleness";
import type { StaleReport } from "./types";

// Re-export checkStaleness so seed.ts also exports it per SPEC requirement
export { checkStaleness };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SeedRow {
    sourceName: string;
    category: string;
    value: number;
    unit: string;
    asOfDate: Date;
    referenceUrl: string | null;
}

/**
 * Builds the flat list of rows to seed from the Wealthsimple config.
 */
function buildWealthsimpleRows(): SeedRow[] {
    const ws = WEALTHSIMPLE_RATES;
    const asOfDate = new Date(ws.lastUpdated);

    return [
        {
            sourceName: "Wealthsimple | mortgage_fixed_1yr",
            category: "mortgage_fixed_1yr",
            value: ws.products.mortgage.fixed1yr.rate,
            unit: "percent",
            asOfDate,
            referenceUrl: ws.products.mortgage.fixed1yr.url,
        },
        {
            sourceName: "Wealthsimple | mortgage_fixed_2yr",
            category: "mortgage_fixed_2yr",
            value: ws.products.mortgage.fixed2yr.rate,
            unit: "percent",
            asOfDate,
            referenceUrl: ws.products.mortgage.fixed2yr.url,
        },
        {
            sourceName: "Wealthsimple | mortgage_fixed_3yr",
            category: "mortgage_fixed_3yr",
            value: ws.products.mortgage.fixed3yr.rate,
            unit: "percent",
            asOfDate,
            referenceUrl: ws.products.mortgage.fixed3yr.url,
        },
        {
            sourceName: "Wealthsimple | mortgage_fixed_5yr",
            category: "mortgage_fixed_5yr",
            value: ws.products.mortgage.fixed5yr.rate,
            unit: "percent",
            asOfDate,
            referenceUrl: ws.products.mortgage.fixed5yr.url,
        },
        {
            sourceName: "Wealthsimple | mortgage_variable",
            category: "mortgage_variable",
            value: ws.products.mortgage.variable.rate,
            unit: "percent",
            asOfDate,
            referenceUrl: ws.products.mortgage.variable.url,
        },
        {
            sourceName: "Wealthsimple | savings",
            category: "savings",
            value: ws.products.savings.interestRate.rate,
            unit: "percent",
            asOfDate,
            referenceUrl: ws.products.savings.interestRate.url,
        },
        {
            sourceName: "Wealthsimple | gic_1yr",
            category: "gic_1yr",
            value: ws.products.gic.rate1yr.rate,
            unit: "percent",
            asOfDate,
            referenceUrl: ws.products.gic.rate1yr.url,
        },
        {
            sourceName: "Wealthsimple | gic_3yr",
            category: "gic_3yr",
            value: ws.products.gic.rate3yr.rate,
            unit: "percent",
            asOfDate,
            referenceUrl: ws.products.gic.rate3yr.url,
        },
        {
            sourceName: "Wealthsimple | gic_5yr",
            category: "gic_5yr",
            value: ws.products.gic.rate5yr.rate,
            unit: "percent",
            asOfDate,
            referenceUrl: ws.products.gic.rate5yr.url,
        },
        {
            sourceName: "Wealthsimple | managed_investing_mer",
            category: "managed_investing_mer",
            value: ws.products.managedInvesting.mer.rate,
            unit: "percent",
            asOfDate,
            referenceUrl: ws.products.managedInvesting.mer.url,
        },
    ];
}

/**
 * Builds the flat list of rows to seed from the BOC config.
 */
function buildBocRows(): SeedRow[] {
    const boc = BOC_RATES;

    return [
        {
            sourceName: "Bank of Canada | prime_rate",
            category: "prime_rate",
            value: boc.rates.primeRate.rate,
            unit: "percent",
            asOfDate: new Date(`${boc.rates.primeRate.effectiveDate}T00:00:00Z`),
            referenceUrl: boc.rates.primeRate.url,
        },
        {
            sourceName: "Bank of Canada | overnight_rate",
            category: "overnight_rate",
            value: boc.rates.overnightRate.rate,
            unit: "percent",
            asOfDate: new Date(`${boc.rates.overnightRate.effectiveDate}T00:00:00Z`),
            referenceUrl: boc.rates.overnightRate.url,
        },
        {
            sourceName: "Bank of Canada | mortgage_posted_1yr",
            category: "mortgage_posted_1yr",
            value: boc.rates.mortgage.posted1yr.rate,
            unit: "percent",
            asOfDate: new Date(`${boc.rates.mortgage.posted1yr.effectiveDate}T00:00:00Z`),
            referenceUrl: boc.rates.mortgage.posted1yr.url,
        },
        {
            sourceName: "Bank of Canada | mortgage_posted_3yr",
            category: "mortgage_posted_3yr",
            value: boc.rates.mortgage.posted3yr.rate,
            unit: "percent",
            asOfDate: new Date(`${boc.rates.mortgage.posted3yr.effectiveDate}T00:00:00Z`),
            referenceUrl: boc.rates.mortgage.posted3yr.url,
        },
        {
            sourceName: "Bank of Canada | mortgage_posted_5yr",
            category: "mortgage_posted_5yr",
            value: boc.rates.mortgage.posted5yr.rate,
            unit: "percent",
            asOfDate: new Date(`${boc.rates.mortgage.posted5yr.effectiveDate}T00:00:00Z`),
            referenceUrl: boc.rates.mortgage.posted5yr.url,
        },
    ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seeds the BenchmarkRate table with all current rates from the config files.
 *
 * Idempotent: uses `upsert` keyed on [sourceName, category, asOfDate].
 * Running this N times produces the same database state as running it once.
 *
 * Called at deploy time (e.g., from a Next.js route handler or a db:seed script).
 */
export async function seedBenchmarks(): Promise<void> {
    const rows: SeedRow[] = [
        ...buildWealthsimpleRows(),
        ...buildBocRows(),
    ];

    for (const row of rows) {
        await prisma.benchmarkRate.upsert({
            where: {
                sourceName_category_asOfDate: {
                    sourceName: row.sourceName,
                    category: row.category,
                    asOfDate: row.asOfDate,
                },
            },
            update: {
                value: row.value,
                unit: row.unit,
                referenceUrl: row.referenceUrl,
            },
            create: {
                sourceName: row.sourceName,
                category: row.category,
                value: row.value,
                unit: row.unit,
                asOfDate: row.asOfDate,
                referenceUrl: row.referenceUrl,
            },
        });
    }

    console.log(`[benchmarks/seed] Upserted ${rows.length} benchmark rates.`);
}
