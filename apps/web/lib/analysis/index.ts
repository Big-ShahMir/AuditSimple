// ============================================================
// apps/web/lib/analysis/index.ts
// ============================================================
// Public barrel export.
// This is the ONLY import path other modules should use:
//   import { ... } from "@/lib/analysis"
// ============================================================

// --- Amortization math ----------------------------------------------------------
export {
    monthlyPayment,
    totalInterestPaid,
    interestDeltaOverTerm,
} from "./amortization";

// --- Severity thresholds --------------------------------------------------------
export {
    DEVIATION_THRESHOLDS,
    assignSeverity,
} from "./severity";

// --- Validation rules -----------------------------------------------------------
export type { ClauseValidationRule, ValidationResult } from "./validation";
export {
    VALIDATION_RULES,
    validateClause,
} from "./validation";

// --- Extraction templates -------------------------------------------------------
export type { ClauseTemplate } from "./templates";
export {
    EXTRACTION_TEMPLATES,
} from "./templates";

// --- Issue builder --------------------------------------------------------------
export {
    buildIssueTitle,
    buildIssueDescription,
    buildAuditIssue,
} from "./issue-builder";

// --- Cost of Loyalty ------------------------------------------------------------
export {
    calculateCostOfLoyalty,
} from "./cost-calculator";
