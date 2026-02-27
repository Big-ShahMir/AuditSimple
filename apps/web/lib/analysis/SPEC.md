# Module: analysis

## Purpose

This module is the **domain logic library** for contract analysis. It contains no orchestration and makes no LLM calls — it provides the data structures, templates, validation rules, and financial math that the `lib/agents` state machine nodes consume. Think of it as the "business rules engine": what clauses to look for per contract type, how to validate extracted values for plausibility, how to assign severity based on deviation thresholds, and how to compute the Cost of Loyalty using amortization math.

By separating domain logic from orchestration, we ensure that all financial rules are unit-testable without mocking LLM calls or standing up the state machine.

## Interfaces (import from `packages/types`)

### Consumed
- `ContractType` — enum keys for the extraction templates map
- `ExtractedClause` — input to validation rules
- `SeverityLevel` — output of severity assignment
- `ClauseBenchmark` — input to cost calculation
- `AuditIssue` — constructed by the issue builder
- `CostOfLoyalty` — produced by cost calculation
- `BenchmarkDataPoint` — used in severity assignment and issue construction

### Produced
- No new types exported to `packages/types`. This module exports functions and constants that operate on the shared types.

## Dependencies

### This module calls:
- Nothing external. Pure functions only. No database, no HTTP, no LLM, no file I/O.

### Called by:
- `lib/agents/nodes/extract-clauses.ts` — imports `EXTRACTION_TEMPLATES` to know which clauses to prompt for
- `lib/agents/nodes/validate-clauses.ts` — imports `VALIDATION_RULES` and `validateClause()`
- `lib/agents/nodes/benchmark.ts` — imports `DEVIATION_THRESHOLDS`, `assignSeverity()`, `buildAuditIssue()`
- `lib/agents/nodes/calculate-cost.ts` — imports `calculateCostOfLoyalty()` and amortization helpers

## Files to Create

- **`templates.ts`** — Clause extraction templates per contract type. Exports `EXTRACTION_TEMPLATES: Record<ContractType, ClauseTemplate[]>` where each `ClauseTemplate` contains the clause label, category, expected unit type, and an optional description hint for the LLM prompt. This is the definitive list of what the LLM is asked to extract.
- **`validation.ts`** — Deterministic clause validation rules. Exports `VALIDATION_RULES: ClauseValidationRule[]` and `validateClause(clause: ExtractedClause): ValidationResult`. Every rule is a pure function — no side effects, no async. Rules check plausibility ranges, unit consistency, and logical coherence.
- **`severity.ts`** — Deviation threshold configuration and severity assignment. Exports `DEVIATION_THRESHOLDS` and `assignSeverity(delta: number, category: string): SeverityLevel`. Pure function mapping a numeric delta to a severity level based on the clause category.
- **`issue-builder.ts`** — Factory for constructing `AuditIssue` objects. Exports `buildAuditIssue(clause: ExtractedClause, benchmark: ClauseBenchmark, severity: SeverityLevel): AuditIssue`. Generates the title, description, and detailedAnalysis strings from structured inputs. Also exports `buildIssueTitle(clause: ExtractedClause, direction: string): string` and `buildIssueDescription(clause: ExtractedClause, benchmark: ClauseBenchmark): string` for composability.
- **`cost-calculator.ts`** — Cost of Loyalty computation. Exports `calculateCostOfLoyalty(issues: AuditIssue[], termMonths: number, principal: number | null): CostOfLoyalty`. Implements amortization-based interest rate delta calculation, flat fee summation, and percentage-based penalty computation. Produces the low/mid/high confidence range and records all assumptions.
- **`amortization.ts`** — Financial math utilities. Exports `monthlyPayment(principal: number, annualRate: number, termMonths: number): number`, `totalInterestPaid(principal: number, annualRate: number, termMonths: number): number`, and `interestDeltaOverTerm(principal: number, rateA: number, rateB: number, termMonths: number): number`. All pure functions. These are the atomic building blocks for Cost of Loyalty.
- **`index.ts`** — Public barrel export. Re-exports all public functions and constants from the files above. This is the only import path other modules should use.

## Key Logic

### Extraction Templates Structure
```typescript
interface ClauseTemplate {
  /** Machine label used as the key (e.g., "prepayment_penalty") */
  label: string;
  /** Category for UI grouping — must match ExtractedClause.category union */
  category: ExtractedClause["category"];
  /** Expected unit type to guide numeric parsing (e.g., "percent", "CAD", "months") */
  expectedUnit: string | null;
  /** Human-readable hint included in the LLM prompt to reduce ambiguity */
  promptHint: string;
}

// Example: Mortgage templates
const MORTGAGE_TEMPLATES: ClauseTemplate[] = [
  {
    label: "principal_amount",
    category: "term_conditions",
    expectedUnit: "CAD",
    promptHint: "The total borrowed amount / loan principal"
  },
  {
    label: "interest_rate",
    category: "interest_rate",
    expectedUnit: "percent",
    promptHint: "The annual interest rate (fixed or initial variable rate)"
  },
  {
    label: "prepayment_penalty",
    category: "penalties",
    expectedUnit: "CAD",
    promptHint: "Fee charged for paying off the mortgage early. May be expressed as a formula (e.g., 3 months interest or IRD)"
  },
  // ... full list in SYSTEM_DESIGN.md Section 5.3
];
```

### Validation Rules (exhaustive list to implement)
```typescript
interface ClauseValidationRule {
  /** Which clause label(s) this rule applies to. "*" = all clauses */
  appliesTo: string | string[] | "*";
  validate: (clause: ExtractedClause) => ValidationResult;
}

interface ValidationResult {
  valid: boolean;
  reason?: string;
}

const VALIDATION_RULES: ClauseValidationRule[] = [
  // Range checks
  { appliesTo: "interest_rate",
    validate: (c) => c.numericValue !== null && (c.numericValue < 0 || c.numericValue > 30)
      ? { valid: false, reason: "Interest rate outside plausible range (0-30%)" }
      : { valid: true } },

  { appliesTo: "principal_amount",
    validate: (c) => c.numericValue !== null && c.numericValue < 100
      ? { valid: false, reason: "Principal amount implausibly low (< $100)" }
      : { valid: true } },

  { appliesTo: ["term_length", "amortization_period", "lease_term"],
    validate: (c) => c.numericValue !== null && c.unit === "months" && c.numericValue > 600
      ? { valid: false, reason: "Term exceeds 50 years — likely extraction error" }
      : { valid: true } },

  { appliesTo: ["monthly_payment"],
    validate: (c) => c.numericValue !== null && c.numericValue < 0
      ? { valid: false, reason: "Negative payment amount" }
      : { valid: true } },

  { appliesTo: "mileage_allowance",
    validate: (c) => c.numericValue !== null && c.unit === "km" && c.numericValue > 200000
      ? { valid: false, reason: "Annual mileage allowance exceeds 200,000 km" }
      : { valid: true } },

  // Universal: every clause must have verbatimText
  { appliesTo: "*",
    validate: (c) => c.source.verbatimText.trim().length === 0
      ? { valid: false, reason: "Empty verbatim text — extraction likely failed" }
      : { valid: true } },

  // Universal: numericValue must be parseable from rawValue when expected
  { appliesTo: "*",
    validate: (c) => {
      if (c.numericValue === null && c.rawValue.match(/\d/)) {
        return { valid: false, reason: "rawValue contains digits but numericValue is null — parsing may have failed" };
      }
      return { valid: true };
    } },
];
```

### Severity Thresholds
```typescript
const DEVIATION_THRESHOLDS: Record<string, { low: number; medium: number; high: number }> = {
  interest_rate:    { low: 0.25, medium: 0.75, high: 1.5 },    // percentage points
  fees:             { low: 50,   medium: 200,  high: 500 },     // CAD
  penalties:        { low: 100,  medium: 500,  high: 2000 },    // CAD
  insurance:        { low: 25,   medium: 100,  high: 300 },     // CAD/month
  early_termination:{ low: 200,  medium: 1000, high: 5000 },    // CAD
  other:            { low: 50,   medium: 200,  high: 1000 },    // CAD (default)
};

function assignSeverity(delta: number, category: string): SeverityLevel {
  const t = DEVIATION_THRESHOLDS[category] ?? DEVIATION_THRESHOLDS["other"];
  if (delta <= 0) return SeverityLevel.INFO;
  if (delta <= t.low) return SeverityLevel.LOW;
  if (delta <= t.medium) return SeverityLevel.MEDIUM;
  if (delta <= t.high) return SeverityLevel.HIGH;
  return SeverityLevel.CRITICAL;
}
```

### Amortization Math
```typescript
/**
 * Standard amortization formula:
 * M = P * [r(1+r)^n] / [(1+r)^n - 1]
 * where r = monthly rate, n = total months
 */
function monthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / termMonths;
  return principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
}

function totalInterestPaid(principal: number, annualRate: number, termMonths: number): number {
  return monthlyPayment(principal, annualRate, termMonths) * termMonths - principal;
}

/**
 * The core Cost of Loyalty calculation for interest rate differentials.
 * Returns the dollar amount the consumer overpays across the term
 * by having rateA instead of rateB (where rateA > rateB).
 */
function interestDeltaOverTerm(
  principal: number, rateA: number, rateB: number, termMonths: number
): number {
  return totalInterestPaid(principal, rateA, termMonths)
       - totalInterestPaid(principal, rateB, termMonths);
}
```

### Cost of Loyalty Aggregation
```typescript
function calculateCostOfLoyalty(
  issues: AuditIssue[],
  termMonths: number,
  principal: number | null
): CostOfLoyalty {
  const breakdown: CostOfLoyalty["breakdown"] = [];
  const assumptions: string[] = [];
  let total = 0;

  for (const issue of issues) {
    if (!issue.benchmarkComparison || issue.benchmarkComparison.direction !== "UNFAVORABLE") continue;

    const bc = issue.benchmarkComparison;

    if (bc.contractUnit === "percent" && principal !== null) {
      // Interest rate delta — use amortization math
      const cost = interestDeltaOverTerm(principal, bc.contractValue, bc.benchmark.value, termMonths);
      breakdown.push({ category: issue.title, amount: cost, description: `Rate differential over ${termMonths} months` });
      total += cost;
    } else {
      // Flat fee or fixed-amount delta
      const cost = bc.projectedCostImpact;
      breakdown.push({ category: issue.title, amount: cost, description: issue.description });
      total += cost;
    }
  }

  // Confidence range: ±15% for low/high
  const margin = total * 0.15;
  assumptions.push(`Assumes ${termMonths}-month remaining term`);
  if (principal) assumptions.push(`Based on principal of $${principal.toLocaleString()} CAD`);
  assumptions.push("Benchmark rates as of most recent available data");
  assumptions.push("Does not account for potential rate changes during term");

  return {
    totalCost: Math.round(total),
    breakdown,
    timeHorizonMonths: termMonths,
    assumptions,
    confidenceRange: {
      low: Math.round(total - margin),
      mid: Math.round(total),
      high: Math.round(total + margin),
    },
  };
}
```

## Constraints

- **EVERY function in this module must be pure.** No side effects, no async, no database calls, no HTTP, no file I/O, no LLM calls. If a function needs external data, it must receive it as a parameter.
- **NEVER import from `lib/agents`, `lib/ingestion`, `lib/citations`, or `lib/benchmarks`.** This module is a leaf dependency — it is called by others but calls no sibling modules.
- **All thresholds and templates must be defined as exported constants**, not computed at runtime. This makes them auditable and easy to tune without code changes.
- **Amortization functions must handle edge cases:** zero interest rate (simple division), very short terms (1 month), very large principals. Never return `NaN` or `Infinity` — guard with input validation and return 0 for degenerate inputs.
- **`validateClause()` must run ALL applicable rules** against a clause and return ALL failures, not short-circuit on the first failure. The agents node needs the full list of issues for warnings.
- **Do not include contract-type-specific business logic outside of `templates.ts`.** If a new contract type is added, only `templates.ts` should need modification. Validation rules and severity thresholds are category-based, not type-based.
- **The ±15% confidence margin in `calculateCostOfLoyalty` is a placeholder.** Document it with `// TODO: Replace with actual benchmark standard deviation when historical data is available` so post-MVP agents know to improve it.
