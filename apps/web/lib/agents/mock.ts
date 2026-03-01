// ============================================================
// apps/web/lib/agents/mock.ts
// ============================================================
// Mock pipeline for testing and frontend development.
//
// Simulates each pipeline node with a 500ms delay and returns a fully
// populated AgentState containing realistic fake data for a mortgage contract.
//
// Exports:
//   runMockPipeline(auditId) — mock alternative to runAuditPipeline
// ============================================================

import { createHash, randomUUID } from "crypto";
import type {
    AgentState,
    ExtractedClause,
    AuditIssue,
    SourceLocation,
} from "@auditsimple/types";
import { AuditStatus, ContractType, SeverityLevel } from "@auditsimple/types";
import { createInitialState } from "./state";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function textHash(text: string): string {
    return createHash("sha256").update(text, "utf8").digest("hex");
}

function stubSource(
    verbatimText: string,
    pageNumber: number,
    charOffsetStart: number,
    charOffsetEnd: number,
): SourceLocation {
    return {
        pageNumber,
        boundingBox: {
            topLeftX: 0.05,
            topLeftY: 0.1 + pageNumber * 0.05,
            bottomRightX: 0.95,
            bottomRightY: 0.15 + pageNumber * 0.05,
        },
        verbatimText,
        textHash: textHash(verbatimText),
        charOffsetStart,
        charOffsetEnd,
    };
}

// ---------------------------------------------------------------------------
// Mock document text
// ---------------------------------------------------------------------------

const MOCK_SCRUBBED_TEXT = `RESIDENTIAL MORTGAGE AGREEMENT

Lender: [REDACTED FINANCIAL INSTITUTION]
Borrower: [REDACTED NAME]

Term: 5 years (60 months)
Amortization Period: 25 years (300 months)
Principal Amount: $450,000.00
Interest Rate: 5.89% per annum, fixed for term
Payment Frequency: Monthly
Monthly Payment: $2,934.12

Prepayment Privilege: 15% of original principal per calendar year without penalty.
Prepayment Penalty: 3 months interest or Interest Rate Differential (IRD), whichever is greater.

This agreement is governed by the laws of the Province of Ontario.
`.trim();

// ---------------------------------------------------------------------------
// Mock pipeline
// ---------------------------------------------------------------------------

/**
 * Runs a mock version of the analysis pipeline without calling any LLMs or
 * external services. Each node introduces a 500ms delay to simulate real
 * processing time for SSE progress streaming.
 *
 * @param auditId  Pre-assigned UUID for this audit (passed by the API layer)
 */
export async function runMockPipeline(auditId: string): Promise<AgentState> {
    const state = createInitialState(MOCK_SCRUBBED_TEXT, [], auditId);
    const now = () => new Date().toISOString();

    // ------------------------------------------------------------------ //
    //  Node: classify (15%)                                               //
    // ------------------------------------------------------------------ //
    await delay(500);
    state.currentNode = "classify";
    state.audit.contractType = ContractType.MORTGAGE;
    state.audit.status = AuditStatus.EXTRACTING;
    state.audit.updatedAt = now();

    // ------------------------------------------------------------------ //
    //  Node: extract_clauses (40%)                                        //
    // ------------------------------------------------------------------ //
    await delay(500);
    state.currentNode = "extract_clauses";

    const clauseIdRate = randomUUID();
    const clauseIdPenalty = randomUUID();
    const clauseIdTerm = randomUUID();

    const interestRateClause: ExtractedClause = {
        clauseId: clauseIdRate,
        label: "interest_rate",
        category: "interest_rate",
        rawValue: "5.89%",
        numericValue: 5.89,
        unit: "percent",
        plainLanguageSummary:
            "Your mortgage carries a fixed interest rate of 5.89% per year for the 5-year term.",
        source: stubSource(
            "Interest Rate: 5.89% per annum, fixed for term",
            1,
            118,
            161,
        ),
        extractionConfidence: 0.97,
    };

    const prepaymentPenaltyClause: ExtractedClause = {
        clauseId: clauseIdPenalty,
        label: "prepayment_penalty",
        category: "penalties",
        rawValue: "3 months interest or IRD, whichever is greater",
        numericValue: null,
        unit: null,
        plainLanguageSummary:
            "If you break your mortgage early, you will owe either 3 months of interest or the Interest Rate Differential — whichever amount is higher.",
        source: stubSource(
            "Prepayment Penalty: 3 months interest or Interest Rate Differential (IRD), whichever is greater.",
            1,
            312,
            408,
        ),
        extractionConfidence: 0.91,
    };

    const termLengthClause: ExtractedClause = {
        clauseId: clauseIdTerm,
        label: "term_length",
        category: "term_conditions",
        rawValue: "60 months",
        numericValue: 60,
        unit: "months",
        plainLanguageSummary:
            "This mortgage term lasts 5 years (60 months). After this period you will need to renew or refinance.",
        source: stubSource("Term: 5 years (60 months)", 1, 40, 64),
        extractionConfidence: 0.99,
    };

    state.audit.clauses = [interestRateClause, prepaymentPenaltyClause, termLengthClause];
    state.audit.updatedAt = now();

    // ------------------------------------------------------------------ //
    //  Node: validate_clauses (50%)                                       //
    // ------------------------------------------------------------------ //
    await delay(500);
    state.currentNode = "validate_clauses";
    // All mock clauses pass validation — no confidence downgrades needed
    state.audit.updatedAt = now();

    // ------------------------------------------------------------------ //
    //  Node: benchmark (65%)                                              //
    // ------------------------------------------------------------------ //
    await delay(500);
    state.currentNode = "benchmark";

    const rateIssue: AuditIssue = {
        issueId: randomUUID(),
        severity: SeverityLevel.HIGH,
        title: "Interest Rate Above Market Average",
        description:
            "Your mortgage rate of 5.89% is 0.64 percentage points above the current market average of 5.25% for a comparable 5-year fixed mortgage.",
        detailedAnalysis:
            "Based on Bank of Canada posted rates and current lender offerings (February 2026), the average 5-year fixed mortgage rate in Canada is approximately 5.25%. Your contracted rate of 5.89% represents a premium of 0.64 percentage points (12.2% above benchmark). On a $450,000 mortgage amortized over 25 years, this differential costs approximately $18,420 in additional interest over the 5-year term alone.",
        relatedClauses: [interestRateClause],
        benchmarkComparison: {
            clauseId: clauseIdRate,
            contractValue: 5.89,
            contractUnit: "percent",
            benchmark: {
                sourceName: "Bank of Canada / CMHC Average Posted Rate",
                value: 5.25,
                unit: "percent",
                asOfDate: "2026-02-01",
                referenceUrl: null,
            },
            delta: 0.64,
            deltaPercent: 12.19,
            projectedCostImpact: 18420,
            direction: "UNFAVORABLE",
        },
        estimatedLifetimeCost: 18420,
        tags: ["interest_rate", "mortgage", "above_market", "unfavorable"],
        confidence: 0.88,
    };

    const penaltyIssue: AuditIssue = {
        issueId: randomUUID(),
        severity: SeverityLevel.MEDIUM,
        title: "IRD Prepayment Penalty More Restrictive Than Industry Standard",
        description:
            "The Interest Rate Differential (IRD) clause means your prepayment penalty could be substantially higher than the simpler 3-month interest alternative offered by many lenders.",
        detailedAnalysis:
            "While this lender offers both 3-month interest and IRD penalties (taking whichever is greater), many credit unions and mono-line lenders cap penalties at 3 months interest only. In a declining-rate environment, the IRD calculation could result in a penalty several times larger than the 3-month interest amount, potentially reaching $10,000–$25,000 if rates drop 1–2% during your term.",
        relatedClauses: [prepaymentPenaltyClause],
        benchmarkComparison: null,
        estimatedLifetimeCost: null,
        tags: ["prepayment_penalty", "ird", "mortgage", "restrictive"],
        confidence: 0.75,
    };

    state.audit.issues = [rateIssue, penaltyIssue];
    state.audit.status = AuditStatus.BENCHMARKING;
    state.audit.updatedAt = now();

    // ------------------------------------------------------------------ //
    //  Node: calculate_cost (75%)                                         //
    // ------------------------------------------------------------------ //
    await delay(500);
    state.currentNode = "calculate_cost";

    state.audit.costOfLoyalty = {
        totalCost: 18420,
        breakdown: [
            {
                category: "interest_rate",
                amount: 18420,
                description:
                    "Additional interest paid over the 60-month term due to rate being 0.64% above market benchmark.",
            },
        ],
        timeHorizonMonths: 60,
        assumptions: [
            "Principal: $450,000",
            "Term: 60 months (5 years)",
            "Market benchmark rate: 5.25% (Bank of Canada average, Feb 2026)",
            "Monthly compounding, level payment amortization",
            "No prepayment events assumed",
        ],
        confidenceRange: { low: 14_100, mid: 18_420, high: 23_200 },
    };
    state.audit.updatedAt = now();

    // ------------------------------------------------------------------ //
    //  Node: generate_citations (85%)                                     //
    // ------------------------------------------------------------------ //
    await delay(500);
    state.currentNode = "generate_citations";
    // Mock: all clauses pass citation verification — source locations unchanged
    state.audit.status = AuditStatus.CITING;
    state.audit.updatedAt = now();

    // ------------------------------------------------------------------ //
    //  Node: synthesize (95%)                                             //
    // ------------------------------------------------------------------ //
    await delay(500);
    state.currentNode = "synthesize";
    const completedAt = now();

    state.audit.riskScore = 42;
    state.audit.executiveSummary =
        "This is a 5-year fixed-rate mortgage agreement. The most significant finding is that your interest rate of 5.89% sits 0.64 percentage points above the current Canadian market average, which translates to roughly $18,420 in additional interest costs over the term — money that could have stayed in your pocket with a more competitive lender. The prepayment penalty structure is also worth paying attention to: the Interest Rate Differential clause means that if you need to break your mortgage early and rates have fallen, your penalty could be considerably higher than you might expect. Overall, this contract is a workable mortgage but it is not priced competitively for today's market. It is worth having a conversation with your lender about rate matching, or exploring alternatives at renewal.";
    state.audit.status = AuditStatus.COMPLETE;
    state.audit.completedAt = completedAt;
    state.audit.updatedAt = completedAt;
    state.audit.warnings = [...state.errors];

    // ------------------------------------------------------------------ //
    //  Node: complete (100%)                                              //
    // ------------------------------------------------------------------ //
    await delay(500);
    state.currentNode = "complete";

    return state;
}
