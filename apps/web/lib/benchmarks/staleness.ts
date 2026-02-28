// ============================================================
// apps/web/lib/benchmarks/staleness.ts
// ============================================================
// Data freshness monitor. Queries the BenchmarkRate table and flags
// entries older than STALENESS_THRESHOLD_DAYS.
// ============================================================

import { prisma } from "@/lib/prisma";
import type { StaleReport } from "./types";

const STALENESS_THRESHOLD_DAYS = 7;

/**
 * Checks the BenchmarkRate table for stale entries.
 *
 * A benchmark is considered stale if its `asOfDate` is older than
 * STALENESS_THRESHOLD_DAYS (7) days from now.
 *
 * Returns a StaleReport indicating whether any benchmarks are stale
 * and which ones. The agents pipeline checks this at the start of the
 * benchmark node and adds an AuditWarning with code
 * `L2_BENCHMARK_DATA_STALE` if hasStaleData is true.
 */
export async function checkStaleness(): Promise<StaleReport> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - STALENESS_THRESHOLD_DAYS);

    const staleRates = await prisma.benchmarkRate.findMany({
        where: {
            asOfDate: { lt: cutoff },
        },
        select: {
            sourceName: true,
            category: true,
            asOfDate: true,
        },
    });

    return {
        staleEntries: staleRates,
        hasStaleData: staleRates.length > 0,
        thresholdDays: STALENESS_THRESHOLD_DAYS,
    };
}
