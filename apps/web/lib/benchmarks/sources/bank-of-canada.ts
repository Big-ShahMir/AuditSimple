// ============================================================
// apps/web/lib/benchmarks/sources/bank-of-canada.ts
// ============================================================
// Bank of Canada reference rates — hardcoded config for MVP.
// All rates are annualized percentages.
//
// Rates sourced from bankofcanada.ca as of 2026-02-27.
// Post-MVP: replace with live fetch from BOC Valet API.
// ============================================================

import type { BocRateConfig } from "../types";

const BOC_DAILY_DIGEST_URL =
    "https://www.bankofcanada.ca/rates/daily-digest/";
const BOC_POSTED_RATES_URL =
    "https://www.bankofcanada.ca/rates/banking-and-financial-statistics/posted-interest-rates-offered-by-chartered-banks/";
const BOC_POLICY_RATE_URL =
    "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/";

/**
 * Current Bank of Canada reference rates.
 *
 * === REAL RATES AS OF 2026-02-27 ===
 *
 * Prime Rate:       4.45% (effective 2026-02-25, per BOC daily digest)
 * Overnight Rate:   2.25% (policy rate as of 2026-02-27)
 *
 * Conventional mortgage posted rates (chartered banks, via BOC):
 *   1-yr posted: 5.84%
 *   3-yr posted: 6.05%
 *   5-yr posted: 6.09%
 *
 * Source: bankofcanada.ca/rates/banking-and-financial-statistics/
 *         posted-interest-rates-offered-by-chartered-banks/
 */
export const BOC_RATES: BocRateConfig = {
    lastUpdated: "2026-02-27T00:00:00Z",
    rates: {
        // Bank Prime Rate — reference for variable-rate mortgage calculations
        primeRate: {
            rate: 4.45,
            effectiveDate: "2026-02-25",
            url: BOC_DAILY_DIGEST_URL,
        },
        // Bank of Canada Target Overnight Rate (policy rate)
        overnightRate: {
            rate: 2.25,
            effectiveDate: "2026-02-27",
            url: BOC_POLICY_RATE_URL,
        },
        mortgage: {
            // Chartered bank conventional mortgage posted rate — 1-year term
            posted1yr: {
                rate: 5.84,
                effectiveDate: "2026-02-27",
                url: BOC_POSTED_RATES_URL,
            },
            // Chartered bank conventional mortgage posted rate — 3-year term
            posted3yr: {
                rate: 6.05,
                effectiveDate: "2026-02-27",
                url: BOC_POSTED_RATES_URL,
            },
            // Chartered bank conventional mortgage posted rate — 5-year term
            posted5yr: {
                rate: 6.09,
                effectiveDate: "2026-02-27",
                url: BOC_POSTED_RATES_URL,
            },
        },
    },
};
