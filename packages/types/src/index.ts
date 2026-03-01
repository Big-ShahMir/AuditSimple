// ============================================================
// packages/types/src/index.ts
// ============================================================

// --- Enums ---

export enum ContractType {
    MORTGAGE = "MORTGAGE",
    AUTO_LEASE = "AUTO_LEASE",
    AUTO_LOAN = "AUTO_LOAN",
    CREDIT_CARD = "CREDIT_CARD",
    PERSONAL_LOAN = "PERSONAL_LOAN",
    LINE_OF_CREDIT = "LINE_OF_CREDIT",
    INSURANCE_POLICY = "INSURANCE_POLICY",
    INVESTMENT_AGREEMENT = "INVESTMENT_AGREEMENT",
    UNKNOWN = "UNKNOWN",
}

export enum SeverityLevel {
    /** Informational — no action required */
    INFO = "INFO",
    /** Slightly above market but within tolerance */
    LOW = "LOW",
    /** Materially above market or contains unfavorable terms */
    MEDIUM = "MEDIUM",
    /** Predatory clause, hidden fee, or significant financial harm */
    HIGH = "HIGH",
    /** Potentially illegal or regulatory-violation-level clause */
    CRITICAL = "CRITICAL",
}

export enum AuditStatus {
    UPLOADING = "UPLOADING",
    PII_SCRUBBING = "PII_SCRUBBING",
    CLASSIFYING = "CLASSIFYING",
    EXTRACTING = "EXTRACTING",
    BENCHMARKING = "BENCHMARKING",
    CITING = "CITING",
    COMPLETE = "COMPLETE",
    FAILED = "FAILED",
}

export enum PIIEntityType {
    PERSON_NAME = "PERSON_NAME",
    PHONE_NUMBER = "PHONE_NUMBER",
    EMAIL_ADDRESS = "EMAIL_ADDRESS",
    CREDIT_CARD_NUMBER = "CREDIT_CARD_NUMBER",
    BANK_ACCOUNT = "BANK_ACCOUNT",
    SSN_SIN = "SSN_SIN",
    ADDRESS = "ADDRESS",
    DATE_OF_BIRTH = "DATE_OF_BIRTH",
}

// --- Source Location (Citation Anchor) ---

/**
 * Pinpoints exactly where in the source document a piece of
 * information was extracted from. This is the atomic unit of
 * the Citation Engine (Layer 3).
 */
export interface SourceLocation {
    /** 1-indexed page number in the original PDF */
    pageNumber: number;
    /** Bounding box coordinates as percentages of page dimensions (0-1) */
    boundingBox: {
        topLeftX: number;
        topLeftY: number;
        bottomRightX: number;
        bottomRightY: number;
    };
    /** The exact verbatim text extracted from the source */
    verbatimText: string;
    /** SHA-256 hash of verbatimText for tamper detection */
    textHash: string;
    /** Character offset range within the full document text */
    charOffsetStart: number;
    charOffsetEnd: number;
}

// --- PII Scrubbing ---

export interface PIIEntity {
    entityType: PIIEntityType;
    originalValue: string;
    redactedPlaceholder: string; // e.g., "[PERSON_1]", "[ACCOUNT_***4523]"
    confidence: number; // 0-1
    location: SourceLocation;
}

export interface PIIScrubResult {
    /** The full document text with PII replaced by placeholders */
    scrubbledText: string;
    /** Map of placeholder -> original value (stored encrypted, never sent to LLM) */
    piiMap: Record<string, string>;
    /** All detected entities with their locations */
    entities: PIIEntity[];
    /** Total PII instances redacted */
    totalRedacted: number;
}

// --- Extracted Clauses ---

/**
 * A single clause or term extracted from the contract.
 * Every clause MUST have a SourceLocation — no exceptions.
 */
export interface ExtractedClause {
    /** Unique ID within this audit */
    clauseId: string;
    /** Human-readable label, e.g., "Prepayment Penalty" */
    label: string;
    /** Category for grouping in the UI */
    category:
    | "interest_rate"
    | "fees"
    | "penalties"
    | "insurance"
    | "collateral"
    | "term_conditions"
    | "rights_obligations"
    | "early_termination"
    | "variable_rate_terms"
    | "other";
    /** The raw extracted value (e.g., "4.99%", "$450", "36 months") */
    rawValue: string;
    /** Parsed numeric value where applicable (e.g., 4.99, 450, 36) */
    numericValue: number | null;
    /** Unit of the numeric value (e.g., "percent", "CAD", "months") */
    unit: string | null;
    /** Plain-language explanation of what this clause means */
    plainLanguageSummary: string;
    /** Source location in the document — REQUIRED, never null */
    source: SourceLocation;
    /** Confidence score for extraction accuracy (0-1) */
    extractionConfidence: number;
}

// --- Benchmark Comparison ---

export interface BenchmarkDataPoint {
    /** Source of benchmark data (e.g., "Bank of Canada Prime", "Wealthsimple Mortgage") */
    sourceName: string;
    /** The benchmark value */
    value: number;
    unit: string;
    /** When this benchmark was last updated (ISO 8601) */
    asOfDate: string;
    /** URL or reference for verification */
    referenceUrl: string | null;
}

export interface ClauseBenchmark {
    clauseId: string;
    /** The user's contract value */
    contractValue: number;
    contractUnit: string;
    /** The fair-market benchmark */
    benchmark: BenchmarkDataPoint;
    /** Absolute delta (contract - benchmark) */
    delta: number;
    /** Percentage deviation from benchmark */
    deltaPercent: number;
    /** Projected cost over full contract term in CAD */
    projectedCostImpact: number;
    /** Is this delta in the consumer's favor or against? */
    direction: "FAVORABLE" | "UNFAVORABLE" | "NEUTRAL";
}

// --- Audit Issues (Flagged Problems) ---

/**
 * A single issue flagged by the forensic analysis.
 * Every issue is grounded in one or more ExtractedClauses
 * and carries a full citation chain.
 */
export interface AuditIssue {
    issueId: string;
    severity: SeverityLevel;
    /** Short headline, e.g., "Above-Market Interest Rate" */
    title: string;
    /** 2-3 sentence plain-language explanation */
    description: string;
    /** Detailed analysis for users who want to dig deeper */
    detailedAnalysis: string;
    /** The specific clauses that triggered this issue */
    relatedClauses: ExtractedClause[];
    /** Benchmark comparison data (if applicable) */
    benchmarkComparison: ClauseBenchmark | null;
    /** Estimated financial impact over contract lifetime (CAD) */
    estimatedLifetimeCost: number | null;
    /** Tags for filtering/search */
    tags: string[];
    /** The LLM's confidence in this finding (0-1) */
    confidence: number;
}

// --- Cost of Loyalty ---

/**
 * The central output metric. This is the number the human
 * uses to make their One Decision.
 */
export interface CostOfLoyalty {
    /** Total estimated excess cost of staying with current contract (CAD) */
    totalCost: number;
    /** Breakdown by category */
    breakdown: {
        category: string;
        amount: number;
        description: string;
    }[];
    /** Time horizon for the calculation */
    timeHorizonMonths: number;
    /** Assumptions made in the calculation */
    assumptions: string[];
    /** Confidence interval */
    confidenceRange: {
        low: number;
        mid: number;
        high: number;
    };
}

// --- The Top-Level Audit Object ---

/**
 * The complete audit — this is the primary entity in the system.
 * All API responses for a completed audit return this shape.
 */
export interface ContractAudit {
    /** UUID v4 */
    auditId: string;
    /** Current pipeline status */
    status: AuditStatus;
    /** Timestamps */
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    /** Detected contract type */
    contractType: ContractType;
    /** Original filename (PII-safe — no path info) */
    originalFileName: string;
    /** SHA-256 hash of original uploaded file */
    documentHash: string;
    /** PII scrub results (piiMap is NEVER included in API responses) */
    piiSummary: {
        totalRedacted: number;
        entityTypeCounts: Record<PIIEntityType, number>;
    };
    /** All extracted clauses */
    clauses: ExtractedClause[];
    /** All flagged issues, sorted by severity DESC */
    issues: AuditIssue[];
    /** The Cost of Loyalty calculation */
    costOfLoyalty: CostOfLoyalty;
    /** Overall risk score (0-100, higher = more risk) */
    riskScore: number;
    /** Executive summary in plain language */
    executiveSummary: string;
    /** Errors encountered during processing (non-fatal) */
    warnings: AuditWarning[];
}

export interface AuditWarning {
    code: string;
    message: string;
    recoverable: boolean;
    /** Which pipeline stage generated this warning */
    stage: AuditStatus;
}

// --- State Machine Types (LangGraph) ---

/**
 * The state object that flows through the LangGraph state machine.
 * Every node reads from and writes to this typed state.
 */
export interface AgentState {
    /** The audit being constructed */
    audit: Partial<ContractAudit>;
    /** Raw text after PII scrubbing (this is what the LLM sees) */
    scrubbledDocumentText: string;
    /** Page-by-page text with positional metadata */
    pageTexts: {
        pageNumber: number;
        text: string;
        /** Word-level bounding boxes from OCR/extraction */
        wordPositions: {
            word: string;
            boundingBox: SourceLocation["boundingBox"];
            charOffset: number;
        }[];
    }[];
    /** Accumulated errors — non-fatal errors don't stop the pipeline */
    errors: AuditWarning[];
    /** Current node in the state machine */
    currentNode: string;
    /** Retry counts per node */
    retryCounters: Record<string, number>;
}

// --- API Request/Response Types ---

export interface UploadRequest {
    /** Base64-encoded file content */
    fileContent: string;
    /** MIME type */
    mimeType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
    /** Original filename */
    fileName: string;
}

export interface UploadResponse {
    auditId: string;
    status: AuditStatus;
    message: string;
}

export interface AuditStatusResponse {
    auditId: string;
    status: AuditStatus;
    progress: number; // 0-100
    currentStage: string;
    estimatedSecondsRemaining: number | null;
}

export type ProgressEvent =
    | { type: "status_change"; status: AuditStatus; progress: number; message?: string }
    | { type: "clause_found"; clause: ExtractedClause }
    | { type: "issue_flagged"; issue: AuditIssue }
    | { type: "error"; warning: AuditWarning }
    | { type: "complete" };

export interface AuditResultResponse {
    audit: ContractAudit;
    /** Pre-signed URL to view original document (time-limited) */
    documentViewUrl: string;
}