// ============================================================
// apps/web/lib/analysis/templates.ts
// ============================================================
// Extraction templates per contract type.
// This is the definitive list of what the LLM is asked to extract.
// To add a new contract type, only this file needs modification.
// No async, no I/O, no side effects.
// ============================================================

import { ContractType, ExtractedClause } from "@auditsimple/types";

// ---- Interface -----------------------------------------------------------------

export interface ClauseTemplate {
    /** Machine label used as the clause key (e.g., "prepayment_penalty") */
    label: string;
    /** Category for UI grouping — must match ExtractedClause.category union */
    category: ExtractedClause["category"];
    /** Expected unit type to guide numeric parsing (e.g., "percent", "CAD", "months") */
    expectedUnit: string | null;
    /** Human-readable hint included in the LLM prompt to reduce ambiguity */
    promptHint: string;
}

// ---- Template Definitions ------------------------------------------------------

const MORTGAGE_TEMPLATES: ClauseTemplate[] = [
    {
        label: "principal_amount",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "The total borrowed amount / loan principal",
    },
    {
        label: "interest_rate",
        category: "interest_rate",
        expectedUnit: "percent",
        promptHint: "The annual interest rate (fixed or initial variable rate)",
    },
    {
        label: "rate_type",
        category: "interest_rate",
        expectedUnit: null,
        promptHint: "Whether the rate is fixed, variable, or hybrid",
    },
    {
        label: "term_length",
        category: "term_conditions",
        expectedUnit: "months",
        promptHint: "The term of this mortgage contract (not the amortization period)",
    },
    {
        label: "amortization_period",
        category: "term_conditions",
        expectedUnit: "months",
        promptHint: "Total amortization period over which the mortgage is paid off",
    },
    {
        label: "monthly_payment",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "Regular scheduled payment amount (monthly, bi-weekly, etc.)",
    },
    {
        label: "prepayment_penalty",
        category: "penalties",
        expectedUnit: "CAD",
        promptHint:
            "Fee charged for paying off the mortgage early. May be expressed as a formula (e.g., 3 months interest or IRD)",
    },
    {
        label: "prepayment_privilege",
        category: "rights_obligations",
        expectedUnit: "percent",
        promptHint: "Percentage of original principal the borrower may prepay annually without penalty",
    },
    {
        label: "compounding_frequency",
        category: "interest_rate",
        expectedUnit: null,
        promptHint: "How often interest compounds (e.g., semi-annually, monthly)",
    },
    {
        label: "origination_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "One-time fee charged to initiate the mortgage",
    },
    {
        label: "renewal_terms",
        category: "term_conditions",
        expectedUnit: null,
        promptHint: "Conditions under which the mortgage may be renewed at maturity",
    },
    {
        label: "portability",
        category: "rights_obligations",
        expectedUnit: null,
        promptHint: "Whether the mortgage can be transferred to a new property",
    },
    {
        label: "default_rate",
        category: "penalties",
        expectedUnit: "percent",
        promptHint: "Interest rate applied on missed or overdue payments",
    },
    {
        label: "variable_rate_cap",
        category: "variable_rate_terms",
        expectedUnit: "percent",
        promptHint: "Maximum rate the lender may charge if variable rate rises",
    },
];

const AUTO_LEASE_TEMPLATES: ClauseTemplate[] = [
    {
        label: "lease_term",
        category: "term_conditions",
        expectedUnit: "months",
        promptHint: "Total duration of the lease agreement",
    },
    {
        label: "monthly_payment",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "Regular monthly lease payment amount",
    },
    {
        label: "capitalized_cost",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "Total negotiated price of the vehicle (equivalent to purchase price)",
    },
    {
        label: "residual_value",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "Estimated value of the vehicle at lease end",
    },
    {
        label: "money_factor",
        category: "interest_rate",
        expectedUnit: null,
        promptHint: "Lease finance charge expressed as a money factor (multiply by 2400 for approximate APR)",
    },
    {
        label: "mileage_allowance",
        category: "term_conditions",
        expectedUnit: "km",
        promptHint: "Total or annual kilometres included in the lease",
    },
    {
        label: "excess_mileage_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Per-kilometre charge for exceeding the mileage allowance",
    },
    {
        label: "acquisition_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Upfront fee charged by the lessor to initiate the lease",
    },
    {
        label: "disposition_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Fee charged at lease end when the vehicle is returned",
    },
    {
        label: "early_termination_penalty",
        category: "early_termination",
        expectedUnit: "CAD",
        promptHint: "Cost to exit the lease before the scheduled end date",
    },
    {
        label: "wear_and_tear_policy",
        category: "term_conditions",
        expectedUnit: null,
        promptHint: "Definition of acceptable wear and tear at lease return",
    },
    {
        label: "gap_coverage",
        category: "insurance",
        expectedUnit: null,
        promptHint: "Whether gap insurance is included or required",
    },
    {
        label: "purchase_option",
        category: "rights_obligations",
        expectedUnit: "CAD",
        promptHint: "The price at which the lessee may purchase the vehicle at lease end",
    },
];

const AUTO_LOAN_TEMPLATES: ClauseTemplate[] = [
    {
        label: "principal_amount",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "Total amount borrowed to finance the vehicle",
    },
    {
        label: "interest_rate",
        category: "interest_rate",
        expectedUnit: "percent",
        promptHint: "Annual percentage rate (APR) on the auto loan",
    },
    {
        label: "term_length",
        category: "term_conditions",
        expectedUnit: "months",
        promptHint: "Loan repayment duration in months",
    },
    {
        label: "monthly_payment",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "Scheduled monthly repayment amount including principal and interest",
    },
    {
        label: "down_payment",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "Initial payment made upfront reducing the financed amount",
    },
    {
        label: "origination_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "One-time fee to originate the auto loan",
    },
    {
        label: "prepayment_penalty",
        category: "penalties",
        expectedUnit: "CAD",
        promptHint: "Fee charged for paying off the auto loan ahead of schedule",
    },
    {
        label: "late_payment_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Penalty fee for a missed or late monthly payment",
    },
    {
        label: "collateral",
        category: "collateral",
        expectedUnit: null,
        promptHint: "The vehicle or asset pledged as security for the loan",
    },
    {
        label: "gap_insurance",
        category: "insurance",
        expectedUnit: null,
        promptHint: "Whether gap insurance is bundled or required with this loan",
    },
];

const CREDIT_CARD_TEMPLATES: ClauseTemplate[] = [
    {
        label: "purchase_apr",
        category: "interest_rate",
        expectedUnit: "percent",
        promptHint: "Annual percentage rate applied to purchase balances",
    },
    {
        label: "cash_advance_rate",
        category: "interest_rate",
        expectedUnit: "percent",
        promptHint: "APR applied to cash advances, typically higher than purchase APR",
    },
    {
        label: "balance_transfer_rate",
        category: "interest_rate",
        expectedUnit: "percent",
        promptHint: "APR for balance transfers from other credit cards",
    },
    {
        label: "annual_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Yearly membership fee charged for holding the card",
    },
    {
        label: "foreign_transaction_fee",
        category: "fees",
        expectedUnit: "percent",
        promptHint: "Fee percentage applied to transactions in a foreign currency",
    },
    {
        label: "late_payment_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Fee charged when the minimum payment is not received by the due date",
    },
    {
        label: "over_limit_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Fee charged when spending exceeds the credit limit",
    },
    {
        label: "cash_advance_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Fee charged per cash advance transaction (flat or percentage)",
    },
    {
        label: "credit_limit",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "Maximum borrowing limit on the credit card",
    },
    {
        label: "minimum_payment",
        category: "term_conditions",
        expectedUnit: "percent",
        promptHint: "Minimum monthly payment required to avoid penalty (often % of balance)",
    },
    {
        label: "grace_period",
        category: "term_conditions",
        expectedUnit: "days",
        promptHint: "Number of days after statement close to pay without incurring interest",
    },
    {
        label: "penalty_apr",
        category: "penalties",
        expectedUnit: "percent",
        promptHint: "Elevated APR applied after missed payments",
    },
    {
        label: "rewards_program",
        category: "rights_obligations",
        expectedUnit: null,
        promptHint: "Description of any rewards, cashback, or points program attached to the card",
    },
];

const PERSONAL_LOAN_TEMPLATES: ClauseTemplate[] = [
    {
        label: "principal_amount",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "The total amount borrowed",
    },
    {
        label: "interest_rate",
        category: "interest_rate",
        expectedUnit: "percent",
        promptHint: "Annual interest rate (fixed or variable)",
    },
    {
        label: "term_length",
        category: "term_conditions",
        expectedUnit: "months",
        promptHint: "Loan repayment term in months",
    },
    {
        label: "monthly_payment",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "Regular monthly repayment amount",
    },
    {
        label: "origination_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Upfront fee charged to originate the personal loan",
    },
    {
        label: "prepayment_penalty",
        category: "penalties",
        expectedUnit: "CAD",
        promptHint: "Fee charged for paying off the loan before the end of the term",
    },
    {
        label: "late_payment_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Penalty for a missed or delayed monthly payment",
    },
    {
        label: "nsf_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Non-sufficient funds fee charged when a payment bounces",
    },
    {
        label: "collateral",
        category: "collateral",
        expectedUnit: null,
        promptHint: "Any asset pledged as security (for secured personal loans)",
    },
    {
        label: "default_clause",
        category: "penalties",
        expectedUnit: null,
        promptHint: "Conditions that trigger a loan default and associated consequences",
    },
];

const LINE_OF_CREDIT_TEMPLATES: ClauseTemplate[] = [
    {
        label: "credit_limit",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "Maximum borrowing capacity on the line of credit",
    },
    {
        label: "interest_rate",
        category: "interest_rate",
        expectedUnit: "percent",
        promptHint: "Annual rate charged on drawn balances (often prime + spread)",
    },
    {
        label: "prime_rate_spread",
        category: "variable_rate_terms",
        expectedUnit: "percent",
        promptHint: "The percentage points above or below prime rate that the LOC charges",
    },
    {
        label: "draw_period",
        category: "term_conditions",
        expectedUnit: "months",
        promptHint: "Period during which funds may be drawn from the line of credit",
    },
    {
        label: "repayment_period",
        category: "term_conditions",
        expectedUnit: "months",
        promptHint: "Period after the draw period ends when the balance must be repaid",
    },
    {
        label: "annual_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Annual maintenance fee for keeping the line of credit open",
    },
    {
        label: "minimum_payment",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "Required minimum monthly payment on the outstanding balance",
    },
    {
        label: "inactivity_fee",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Fee charged if the line of credit is unused for a defined period",
    },
    {
        label: "collateral",
        category: "collateral",
        expectedUnit: null,
        promptHint: "Asset securing the line of credit (HELOC: home equity; unsecured: none)",
    },
    {
        label: "freeze_clause",
        category: "rights_obligations",
        expectedUnit: null,
        promptHint: "Conditions under which the lender may freeze or reduce the credit line",
    },
    {
        label: "prepayment_terms",
        category: "term_conditions",
        expectedUnit: null,
        promptHint: "Whether the borrower may repay and redraw without restrictions",
    },
];

const INSURANCE_POLICY_TEMPLATES: ClauseTemplate[] = [
    {
        label: "premium",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Regular payment amount (monthly, quarterly, or annual) for coverage",
    },
    {
        label: "coverage_amount",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "Total insured amount or policy limit",
    },
    {
        label: "deductible",
        category: "fees",
        expectedUnit: "CAD",
        promptHint: "Amount the insured pays out-of-pocket before insurance coverage applies",
    },
    {
        label: "policy_term",
        category: "term_conditions",
        expectedUnit: "months",
        promptHint: "Duration of the insurance coverage",
    },
    {
        label: "cancellation_penalty",
        category: "early_termination",
        expectedUnit: "CAD",
        promptHint: "Fee or forfeited premium for cancelling the policy before term end",
    },
    {
        label: "exclusions",
        category: "rights_obligations",
        expectedUnit: null,
        promptHint: "Specific conditions or events explicitly NOT covered by the policy",
    },
    {
        label: "waiting_period",
        category: "term_conditions",
        expectedUnit: "days",
        promptHint: "Time after policy start before certain coverage becomes effective",
    },
    {
        label: "renewal_terms",
        category: "term_conditions",
        expectedUnit: null,
        promptHint: "Automatic renewal provisions and any rate change notice requirements",
    },
    {
        label: "claims_process",
        category: "rights_obligations",
        expectedUnit: null,
        promptHint: "Overview of the steps and timeline for filing a claim",
    },
    {
        label: "subrogation_clause",
        category: "rights_obligations",
        expectedUnit: null,
        promptHint: "Insurer's right to pursue third parties after paying a claim",
    },
];

const INVESTMENT_AGREEMENT_TEMPLATES: ClauseTemplate[] = [
    {
        label: "management_fee",
        category: "fees",
        expectedUnit: "percent",
        promptHint: "Annual percentage of AUM charged as the management fee (MER)",
    },
    {
        label: "performance_fee",
        category: "fees",
        expectedUnit: "percent",
        promptHint: "Percentage of gains charged as a performance or success fee",
    },
    {
        label: "redemption_fee",
        category: "fees",
        expectedUnit: "percent",
        promptHint: "Fee charged when redeeming or withdrawing funds before a holding period",
    },
    {
        label: "lock_up_period",
        category: "term_conditions",
        expectedUnit: "months",
        promptHint: "Minimum period funds must remain invested before withdrawal is permitted",
    },
    {
        label: "minimum_investment",
        category: "term_conditions",
        expectedUnit: "CAD",
        promptHint: "Minimum initial or ongoing investment amount required",
    },
    {
        label: "early_redemption_penalty",
        category: "early_termination",
        expectedUnit: "percent",
        promptHint: "Penalty for withdrawing before the lock-up or minimum holding period",
    },
    {
        label: "risk_disclosure",
        category: "rights_obligations",
        expectedUnit: null,
        promptHint: "Statement of investment risks the investor accepts",
    },
    {
        label: "investment_mandate",
        category: "term_conditions",
        expectedUnit: null,
        promptHint: "Defined investment strategy and permitted asset classes",
    },
    {
        label: "withdrawal_notice_period",
        category: "rights_obligations",
        expectedUnit: "days",
        promptHint: "Number of days advance notice required before a withdrawal",
    },
    {
        label: "tax_treatment",
        category: "other",
        expectedUnit: null,
        promptHint: "How gains, dividends, or distributions are taxed under this agreement",
    },
];

const UNKNOWN_TEMPLATES: ClauseTemplate[] = [
    {
        label: "effective_date",
        category: "term_conditions",
        expectedUnit: null,
        promptHint: "The date on which this agreement comes into force",
    },
    {
        label: "expiry_date",
        category: "term_conditions",
        expectedUnit: null,
        promptHint: "The date on which this agreement expires or terminates",
    },
    {
        label: "parties",
        category: "rights_obligations",
        expectedUnit: null,
        promptHint: "Names of all parties to the contract (lender/borrower, lessor/lessee, etc.)",
    },
    {
        label: "governing_law",
        category: "rights_obligations",
        expectedUnit: null,
        promptHint: "Jurisdiction whose laws govern the interpretation of this contract",
    },
    {
        label: "penalty_clause",
        category: "penalties",
        expectedUnit: null,
        promptHint: "Any clause imposing a financial penalty for breach or early exit",
    },
    {
        label: "fee_schedule",
        category: "fees",
        expectedUnit: null,
        promptHint: "Any fee or charge referenced in the document",
    },
    {
        label: "interest_rate",
        category: "interest_rate",
        expectedUnit: "percent",
        promptHint: "Any interest rate mentioned in the document",
    },
];

// ---- Public Export -------------------------------------------------------------

/**
 * The definitive map of clause extraction templates per contract type.
 * Each template describes one clause the LLM is asked to extract.
 *
 * To add a new ContractType, add an entry here.
 * Validation rules and severity thresholds are category-based and
 * do NOT need modification when new contract types are added.
 */
export const EXTRACTION_TEMPLATES: Record<ContractType, ClauseTemplate[]> = {
    [ContractType.MORTGAGE]: MORTGAGE_TEMPLATES,
    [ContractType.AUTO_LEASE]: AUTO_LEASE_TEMPLATES,
    [ContractType.AUTO_LOAN]: AUTO_LOAN_TEMPLATES,
    [ContractType.CREDIT_CARD]: CREDIT_CARD_TEMPLATES,
    [ContractType.PERSONAL_LOAN]: PERSONAL_LOAN_TEMPLATES,
    [ContractType.LINE_OF_CREDIT]: LINE_OF_CREDIT_TEMPLATES,
    [ContractType.INSURANCE_POLICY]: INSURANCE_POLICY_TEMPLATES,
    [ContractType.INVESTMENT_AGREEMENT]: INVESTMENT_AGREEMENT_TEMPLATES,
    [ContractType.UNKNOWN]: UNKNOWN_TEMPLATES,
};
