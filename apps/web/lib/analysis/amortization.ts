// ============================================================
// apps/web/lib/analysis/amortization.ts
// ============================================================
// Pure financial math utilities — atomic building blocks for
// the Cost of Loyalty calculation. No async, no I/O, no side effects.
// ============================================================

/**
 * Computes the fixed monthly payment using the standard amortization formula:
 *   M = P * [r(1+r)^n] / [(1+r)^n - 1]
 * where r = monthly interest rate (annualRate / 12 / 100), n = termMonths.
 *
 * Edge cases:
 * - annualRate === 0  → simple division (principal / termMonths)
 * - termMonths <= 0   → returns 0 (degenerate input)
 * - principal <= 0    → returns 0 (degenerate input)
 * - NaN / Infinity    → clamped to 0
 */
export function monthlyPayment(
    principal: number,
    annualRate: number,
    termMonths: number,
): number {
    if (principal <= 0 || termMonths <= 0 || !isFinite(principal) || !isFinite(annualRate)) {
        return 0;
    }

    const r = annualRate / 100 / 12;

    if (r === 0) {
        return principal / termMonths;
    }

    const factor = Math.pow(1 + r, termMonths);
    const payment = (principal * (r * factor)) / (factor - 1);

    return isFinite(payment) ? payment : 0;
}

/**
 * Computes total interest paid over the full loan term.
 *   totalInterest = (monthlyPayment × termMonths) − principal
 *
 * Returns 0 for degenerate inputs to avoid negative or nonsensical results.
 */
export function totalInterestPaid(
    principal: number,
    annualRate: number,
    termMonths: number,
): number {
    if (principal <= 0 || termMonths <= 0) {
        return 0;
    }

    const total = monthlyPayment(principal, annualRate, termMonths) * termMonths - principal;
    return isFinite(total) && total >= 0 ? total : 0;
}

/**
 * The core Cost of Loyalty calculation for interest rate differentials.
 * Returns the dollar amount the consumer overpays across the full term
 * by being on rateA instead of rateB (where rateA > rateB is the
 * above-market scenario, but the function is sign-neutral).
 *
 * Returns 0 for degenerate inputs.
 */
export function interestDeltaOverTerm(
    principal: number,
    rateA: number,
    rateB: number,
    termMonths: number,
): number {
    if (principal <= 0 || termMonths <= 0) {
        return 0;
    }

    const delta =
        totalInterestPaid(principal, rateA, termMonths) -
        totalInterestPaid(principal, rateB, termMonths);

    return isFinite(delta) ? delta : 0;
}
