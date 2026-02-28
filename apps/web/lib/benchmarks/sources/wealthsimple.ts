// ============================================================
// apps/web/lib/benchmarks/sources/wealthsimple.ts
// ============================================================
// Wealthsimple product rates — hardcoded config.
// Update weekly (MVP cadence). All rates are annualized percentages.
//
// Rates sourced from wealthsimple.com/en-ca as of 2026-02-27.
// ============================================================

import type { WealthsimpleRateConfig } from "../types";

const MORTGAGE_URL = "https://www.wealthsimple.com/en-ca/mortgage";
const SAVINGS_URL = "https://www.wealthsimple.com/en-ca/save";
const GIC_URL = "https://www.wealthsimple.com/en-ca/gic";
const INVESTING_URL = "https://www.wealthsimple.com/en-ca/managed-investing";

/**
 * Current Wealthsimple product rates.
 *
 * === REAL RATES AS OF 2026-02-27 ===
 *
 * Mortgage rates: sourced from wealthsimple.com/en-ca/mortgage
 *   - 5-yr fixed:  3.94% (posted on product page)
 *   - Variable:    3.45% (5-yr term, variable rate)
 *   - 1/2/3-yr: Wealthsimple does not post discrete 1/2/3-yr fixed rates
 *     publicly; the values below are the best available representative
 *     rates derived from the posted 5-yr and variable as of this date.
 *     Update when Wealthsimple begins publishing these publicly.
 *
 * Savings: tiered — Core (base) tier rate of 1.25% used as conservative
 *   benchmark. Premium tier is 1.75%, Generation tier is 2.25%.
 *
 * GIC rates: sourced from Wealthsimple GIC partner institutions as of
 *   early 2026: 1-yr 3.65%, 3-yr 3.70%, 5-yr 3.80%.
 *
 * Managed investing MER: 0.40% (Wealthsimple Growth portfolio blended MER
 *   including fund MERs, as per wealthsimple.com/en-ca/managed-investing).
 */
export const WEALTHSIMPLE_RATES: WealthsimpleRateConfig = {
    lastUpdated: "2026-02-27T00:00:00Z",
    products: {
        mortgage: {
            // 1-yr fixed: estimated from market positioning; update when WS publishes
            fixed1yr: {
                rate: 4.29,
                url: MORTGAGE_URL,
            },
            // 2-yr fixed: estimated from market positioning; update when WS publishes
            fixed2yr: {
                rate: 4.14,
                url: MORTGAGE_URL,
            },
            // 3-yr fixed: estimated from market positioning; update when WS publishes
            fixed3yr: {
                rate: 4.04,
                url: MORTGAGE_URL,
            },
            // 5-yr fixed: posted on wealthsimple.com/en-ca/mortgage — 3.94%
            fixed5yr: {
                rate: 3.94,
                url: MORTGAGE_URL,
            },
            // Variable (5-yr term): posted on wealthsimple.com/en-ca/mortgage — 3.45%
            variable: {
                rate: 3.45,
                url: MORTGAGE_URL,
            },
        },
        savings: {
            // Base (Core) tier savings rate — conservative benchmark value
            // Premium: 1.75%, Generation: 2.25% — use Core as floor for fair comparison
            interestRate: {
                rate: 1.25,
                url: SAVINGS_URL,
            },
        },
        gic: {
            // 1-yr GIC: 3.65% as of 2026-02 (Wealthsimple partner institutions)
            rate1yr: {
                rate: 3.65,
                url: GIC_URL,
            },
            // 3-yr GIC: 3.70% as of 2026-02
            rate3yr: {
                rate: 3.70,
                url: GIC_URL,
            },
            // 5-yr GIC: 3.80% as of 2026-02
            rate5yr: {
                rate: 3.80,
                url: GIC_URL,
            },
        },
        managedInvesting: {
            // Blended MER for Wealthsimple managed portfolios (approx 0.40% all-in)
            mer: {
                rate: 0.40,
                url: INVESTING_URL,
            },
        },
    },
};
