// ============================================================
// apps/web/lib/citations/index.ts
// ============================================================
// Public barrel export for the citations module.
//
// Consumers:
//   - lib/agents/nodes/generate-citations.ts  → verifyCitations
//   - lib/agents/nodes/synthesize.ts          → gateConfidence
//
// Internal files (exact-match, fuzzy-match, similarity, etc.)
// are NOT re-exported here — they are implementation details.
// ============================================================

// Primary entry point — used by the citation agent node
export { verifyCitations } from "./verify";

// Confidence gate — used by the synthesis agent node
export { gateConfidence } from "./confidence-gate";

// Hallucination checks — used by quality-control reporting
export { runHallucinationChecks } from "./hallucination";

// Config objects — available to callers that need to inspect or override thresholds
export { CITATION_MATCH_CONFIG, CONFIDENCE_GATE_CONFIG } from "./config";

// Internal types that consumers may need for type-checking
export type {
    VerificationResult,
    HallucinationReport,
    HallucinationFlag,
    GateResult,
    PageText,
    WordPosition,
    MatchResult,
    CitationMatchConfig,
} from "./types";
