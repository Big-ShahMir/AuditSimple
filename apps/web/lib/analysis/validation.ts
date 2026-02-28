// ============================================================
// apps/web/lib/analysis/validation.ts
// ============================================================
// Deterministic clause validation rules.
// validateClause() RUNS ALL applicable rules against a clause —
// it never short-circuits. The agents node needs the full list
// of failures for AuditWarning construction.
// No async, no I/O, no side effects.
// ============================================================

import { ExtractedClause } from "@auditsimple/types";

// ---- Interfaces ----------------------------------------------------------------

export interface ValidationResult {
    valid: boolean;
    /** Human-readable reason for failure. Absent when valid === true. */
    reason?: string;
}

export interface ClauseValidationRule {
    /**
     * Which clause label(s) this rule applies to.
     * "*" means it applies to every single clause.
     */
    appliesTo: string | string[] | "*";
    validate: (clause: ExtractedClause) => ValidationResult;
}

// ---- Helper --------------------------------------------------------------------

/** Returns true if the rule applies to the given clause label. */
function ruleAppliesTo(rule: ClauseValidationRule, label: string): boolean {
    if (rule.appliesTo === "*") return true;
    if (typeof rule.appliesTo === "string") return rule.appliesTo === label;
    return rule.appliesTo.includes(label);
}

// ---- Rules ---------------------------------------------------------------------

export const VALIDATION_RULES: ClauseValidationRule[] = [
    // --- Range: interest rate must be within 0–30% ---
    {
        appliesTo: "interest_rate",
        validate: (c) => {
            if (c.numericValue !== null && (c.numericValue < 0 || c.numericValue > 30)) {
                return { valid: false, reason: "Interest rate outside plausible range (0-30%)" };
            }
            return { valid: true };
        },
    },

    // --- Range: principal must be at least $100 ---
    {
        appliesTo: "principal_amount",
        validate: (c) => {
            if (c.numericValue !== null && c.numericValue < 100) {
                return { valid: false, reason: "Principal amount implausibly low (< $100)" };
            }
            return { valid: true };
        },
    },

    // --- Range: term-style clauses must not exceed 600 months (50 years) ---
    {
        appliesTo: ["term_length", "amortization_period", "lease_term"],
        validate: (c) => {
            if (c.numericValue !== null && c.unit === "months" && c.numericValue > 600) {
                return { valid: false, reason: "Term exceeds 50 years — likely extraction error" };
            }
            return { valid: true };
        },
    },

    // --- Range: monthly payment must not be negative ---
    {
        appliesTo: ["monthly_payment"],
        validate: (c) => {
            if (c.numericValue !== null && c.numericValue < 0) {
                return { valid: false, reason: "Negative payment amount" };
            }
            return { valid: true };
        },
    },

    // --- Range: annual mileage allowance must be ≤ 200,000 km ---
    {
        appliesTo: "mileage_allowance",
        validate: (c) => {
            if (c.numericValue !== null && c.unit === "km" && c.numericValue > 200_000) {
                return { valid: false, reason: "Annual mileage allowance exceeds 200,000 km" };
            }
            return { valid: true };
        },
    },

    // --- Universal: every clause must have non-empty verbatim text ---
    {
        appliesTo: "*",
        validate: (c) => {
            if (c.source.verbatimText.trim().length === 0) {
                return { valid: false, reason: "Empty verbatim text — extraction likely failed" };
            }
            return { valid: true };
        },
    },

    // --- Universal: numericValue must be present when rawValue contains digits ---
    {
        appliesTo: "*",
        validate: (c) => {
            if (c.numericValue === null && /\d/.test(c.rawValue)) {
                return {
                    valid: false,
                    reason: "rawValue contains digits but numericValue is null — parsing may have failed",
                };
            }
            return { valid: true };
        },
    },
];

// ---- Public API ----------------------------------------------------------------

/**
 * Runs ALL applicable validation rules against a clause.
 * Does NOT short-circuit on the first failure.
 *
 * @returns Array of ValidationResult objects — one per rule that fired.
 *          An empty array means the clause passed all checks.
 *          Check `result.valid === false` to identify failures.
 */
export function validateClause(clause: ExtractedClause): ValidationResult[] {
    const results: ValidationResult[] = [];

    for (const rule of VALIDATION_RULES) {
        if (!ruleAppliesTo(rule, clause.label)) continue;
        const result = rule.validate(clause);
        results.push(result);
    }

    return results;
}
