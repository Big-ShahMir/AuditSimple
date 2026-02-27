# Module: agents

## Purpose

This module is the **orchestration core** of the analysis pipeline. It implements a LangGraph.js state machine that takes PII-scrubbed document text and drives it through a deterministic sequence of analysis nodes: classification → extraction → validation → benchmarking → cost calculation → citation generation → synthesis. Every node reads from and writes to a single typed `AgentState` object. The state machine enforces strict transition rules, retry policies, and graceful degradation — a node failure produces warnings but never silently drops data.

## Interfaces (import from `packages/types`)

### Consumed (inputs to this module)
- `AgentState` — the central state object this module owns and mutates
- `AuditStatus` — enum used to track pipeline progression
- `ContractType` — enum returned by the classify node
- `ExtractedClause` — produced by extract_clauses node
- `AuditIssue` — produced by benchmark node
- `ClauseBenchmark` — produced by benchmark node
- `CostOfLoyalty` — produced by calculate_cost node
- `AuditWarning` — appended to state.errors by any node on non-fatal failure
- `SeverityLevel` — used by benchmark node to assign issue severity

### Produced (outputs from this module)
- A fully populated `AgentState` with `audit` containing all fields needed to construct a `ContractAudit`
- `ProgressEvent` emissions (via callback) for SSE streaming to the frontend

## Dependencies

### This module calls:
- `lib/ingestion` — does NOT call ingestion. Receives already-scrubbed `AgentState` as input.
- `lib/analysis` — imports clause extraction templates (`EXTRACTION_TEMPLATES`) and validation rules (`VALIDATION_RULES`)
- `lib/benchmarks` — imports `getBenchmarkForClause()` to fetch market data from PostgreSQL
- `lib/citations` — imports `verifyCitations()` to run the citation engine on extracted clauses
- `@anthropic-ai/sdk` — direct LLM calls for classify, extract_clauses, and synthesize nodes
- `@langchain/langgraph` — state machine definition, node registration, edge routing

### Called by:
- `app/api/analyze/route.ts` — the API route that triggers pipeline execution
- Receives an `AgentState` with `scrubbledDocumentText` and `pageTexts` already populated by the ingestion layer

## Files to Create

- **`graph.ts`** — Main LangGraph state machine definition. Defines the graph topology, registers all nodes, defines conditional edges and the transition map. Exports a single `runAuditPipeline(initialState: AgentState): Promise<AgentState>` function.
- **`state.ts`** — AgentState initialization and channel definitions for LangGraph. Exports `createInitialState(scrubbledText: string, pageTexts: AgentState["pageTexts"], auditId: string): AgentState` and the LangGraph channel schema.
- **`nodes/classify.ts`** — Classification node. Sends scrubbed text to Claude with a constrained prompt. Returns exactly one `ContractType` enum value plus confidence. If confidence < 0.6, sets `UNKNOWN` and appends warning.
- **`nodes/extract-clauses.ts`** — Clause extraction node. Uses contract-type-specific templates from `lib/analysis`. Prompts Claude via tool-use/structured-output mode to return `ExtractedClause[]`. Enforces JSON schema compliance. Explicitly instructs the LLM to return `null` for unfound clauses.
- **`nodes/validate-clauses.ts`** — Deterministic validation node. **No LLM call.** Imports `VALIDATION_RULES` from `lib/analysis` and runs each clause through plausibility checks. Downgrades `extractionConfidence` to 0.3 for failed validations. Appends warnings but never removes clauses.
- **`nodes/benchmark.ts`** — Benchmark comparison node. For each extracted clause with a numeric value, calls `getBenchmarkForClause()` from `lib/benchmarks`. Computes delta, deltaPercent, projectedCostImpact. Creates `AuditIssue` objects for unfavorable deviations using severity thresholds. **Graceful degradation:** if benchmark lookup fails for a clause, skip it with a warning — do not fail the pipeline.
- **`nodes/calculate-cost.ts`** — Cost of Loyalty calculation node. **No LLM call.** Pure math. Sums projected cost impacts from all UNFAVORABLE issues. For interest rate deltas, uses amortization formula over remaining term. Produces low/mid/high confidence range using ±1 stddev on benchmark data. Records all assumptions.
- **`nodes/generate-citations.ts`** — Citation verification node. Calls `verifyCitations()` from `lib/citations` passing `audit.clauses` and `pageTexts`. Receives back clauses with verified `SourceLocation` data and confidence adjustments. Clauses that fail verification get `extractionConfidence` multiplied by 0.4.
- **`nodes/synthesize.ts`** — Summary generation node. Sends the full audit state to Claude (temperature 0.3, max_tokens 1000) to produce `executiveSummary` (max 300 words, plain language). Calculates `riskScore` using the deterministic weighted formula (no LLM involvement for the score itself).
- **`retry.ts`** — Retry policy implementation. Exports `withRetry(nodeFn, policy): wrappedNodeFn` higher-order function. Implements exponential backoff per the schedule [1000, 3000, 8000]ms. Only retries on whitelisted error codes.
- **`progress.ts`** — Progress emission utility. Exports `emitProgress(state: AgentState, event: ProgressEvent): void`. Writes progress events to Redis for SSE pickup. Calculates progress percentage based on current node position in the pipeline.
- **`prompts.ts`** — All LLM prompt templates. System prompts for classify, extract_clauses, and synthesize. Every system prompt includes the invariant: `"If you cannot find information in the provided document, respond with null. Do not infer, guess, or fabricate values."` Exports typed prompt builder functions.
- **`mock.ts`** — Mock implementations of every node for testing and frontend development. Exports `runMockPipeline(auditId: string): Promise<AgentState>` that returns realistic fake data with 500ms delays per node to simulate real pipeline behavior.

## Key Logic

### State Machine Transition Map
```typescript
const TRANSITIONS: Record<string, { next: string; onError: string }> = {
  classify:           { next: "extract_clauses",    onError: "classify_retry" },
  classify_retry:     { next: "extract_clauses",    onError: "failed" },
  extract_clauses:    { next: "validate_clauses",   onError: "extract_retry" },
  extract_retry:      { next: "validate_clauses",   onError: "failed" },
  validate_clauses:   { next: "benchmark",          onError: "benchmark" },
  benchmark:          { next: "calculate_cost",      onError: "calculate_cost" },
  calculate_cost:     { next: "generate_citations",  onError: "generate_citations" },
  generate_citations: { next: "synthesize",          onError: "synthesize" },
  synthesize:         { next: "complete",             onError: "complete" },
};
```

### Node Execution Pattern (every node follows this)
```typescript
async function nodeFunction(state: AgentState): Promise<Partial<AgentState>> {
  // 1. Read inputs from state
  // 2. Execute logic (LLM call or deterministic)
  // 3. Emit progress event
  // 4. Return ONLY the state fields this node modifies
  // 5. On error: append to state.errors, return partial state (graceful degradation)
}
```

### LLM Call Configuration
| Node | Temperature | max_tokens | Mode | Timeout |
|---|---|---|---|---|
| classify | 0.0 | 200 | Structured output (JSON) | 15s |
| extract_clauses | 0.0 | 4000 | Tool-use / function-calling | 60s |
| synthesize | 0.3 | 1000 | Free text (constrained by system prompt) | 30s |

### Risk Score Formula (deterministic, in synthesize node)
```typescript
const SEVERITY_WEIGHTS: Record<SeverityLevel, number> = {
  INFO: 0, LOW: 5, MEDIUM: 15, HIGH: 30, CRITICAL: 50,
};

function calculateRiskScore(issues: AuditIssue[]): number {
  const raw = issues.reduce((sum, issue) =>
    sum + SEVERITY_WEIGHTS[issue.severity] * issue.confidence, 0);
  return Math.min(100, Math.round(raw));
}
```

### Progress Percentage Mapping
```typescript
const NODE_PROGRESS: Record<string, number> = {
  classify: 15,
  extract_clauses: 40,
  validate_clauses: 50,
  benchmark: 65,
  calculate_cost: 75,
  generate_citations: 85,
  synthesize: 95,
  complete: 100,
  failed: 100,
};
```

## Constraints

- **Never import from `lib/ingestion`** — this module receives pre-processed state, it does not trigger ingestion.
- **Never import from `app/` routes** — this module is called BY the API layer, it does not call it.
- **Never store PII** — this module only sees `scrubbledDocumentText`. It has no access to the PII map.
- **Never mutate state directly** — each node returns a partial state update. LangGraph merges it. This ensures serializability and replay.
- **All LLM calls must use structured output / tool-use mode** for classify and extract_clauses. Free text is only acceptable for synthesize.
- **Temperature 0.0 for all extraction/classification calls.** Only synthesize uses 0.3.
- **Every LLM system prompt must include the anti-hallucination invariant** — see `prompts.ts` description above.
- **Retry only on whitelisted error codes** — see `retry.ts`. Never retry on validation failures or confidence-below-threshold results. These are correct outcomes, not errors.
- **The `graph.ts` file must be the single entry point** — external code calls `runAuditPipeline()` and nothing else from this module except `runMockPipeline()` for testing.
