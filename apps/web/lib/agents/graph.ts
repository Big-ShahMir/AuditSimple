// ============================================================
// apps/web/lib/agents/graph.ts
// ============================================================
// LangGraph state machine for the AuditSimple analysis pipeline.
//
// Topology:
//   classify → extract_clauses → validate_clauses → benchmark
//           → calculate_cost → generate_citations → synthesize → complete
//
// Error routing:
//   classify / extract_clauses: retry (via withRetry) then route to "failed"
//   All other nodes: graceful degradation — always continue to next node
//
// Exports:
//   runAuditPipeline(initialState) — single public entry point
// ============================================================

import { StateGraph, START, END } from "@langchain/langgraph";
import type { AgentState, AuditWarning } from "@auditsimple/types";
import { AuditStatus } from "@auditsimple/types";
import { AgentStateAnnotation } from "./state";
import { withRetry, buildDefaultPolicy, type NodeFn } from "./retry";
import { emitProgress } from "./progress";
import { classifyNode } from "./nodes/classify";
import { extractClausesNode } from "./nodes/extract-clauses";
import { validateClausesNode } from "./nodes/validate-clauses";
import { benchmarkNode } from "./nodes/benchmark";
import { calculateCostNode } from "./nodes/calculate-cost";
import { generateCitationsNode } from "./nodes/generate-citations";
import { synthesizeNode } from "./nodes/synthesize";

// ---------------------------------------------------------------------------
// Safety wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps a node function so that any thrown error (including re-throws from
 * withRetry for non-retryable codes) is caught and surfaced as a
 * non-recoverable AuditWarning.
 *
 * This ensures LangGraph conditional edges always receive a clean state
 * update rather than an unhandled exception propagating up to the caller.
 */
function makeSafeNode(fn: NodeFn, errorCode: string, stage: AuditStatus): NodeFn {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        try {
            return await fn(state);
        } catch (err) {
            console.error(
                `[graph] Node "${state.currentNode || "unknown"}" threw and was converted to ${errorCode}.`,
                err,
            );
            const warning: AuditWarning = {
                code: errorCode,
                message: err instanceof Error ? err.message : String(err),
                recoverable: false,
                stage,
            };
            return { errors: [warning] };
        }
    };
}

// ---------------------------------------------------------------------------
// Wrapped nodes: classify + extract_clauses get retry + safety catch
// ---------------------------------------------------------------------------

const classifyNodeWrapped = makeSafeNode(
    withRetry(classifyNode, buildDefaultPolicy(AuditStatus.CLASSIFYING), "classify"),
    "CLASSIFY_FATAL",
    AuditStatus.CLASSIFYING,
);

const extractClausesNodeWrapped = makeSafeNode(
    withRetry(extractClausesNode, buildDefaultPolicy(AuditStatus.EXTRACTING), "extract_clauses"),
    "EXTRACT_CLAUSES_FATAL",
    AuditStatus.EXTRACTING,
);

// ---------------------------------------------------------------------------
// Conditional edge routers
// ---------------------------------------------------------------------------

/**
 * Routes to "failed" if any non-recoverable error was added by the classify
 * node (or its retry wrapper). Otherwise continues to extract_clauses.
 *
 * Safety: at this point state.errors only contains errors from classify
 * because the errors reducer appends and no prior node has run.
 */
function routeAfterClassify(state: AgentState): "extract_clauses" | "failed" {
    return state.errors.some((e) => !e.recoverable) ? "failed" : "extract_clauses";
}

/**
 * Routes to "failed" if any non-recoverable error exists after
 * extract_clauses runs. By the time this router executes, classify has
 * already confirmed no fatal errors (otherwise we'd be in the "failed"
 * branch already), so any non-recoverable error here belongs to
 * extract_clauses.
 */
function routeAfterExtractClauses(state: AgentState): "validate_clauses" | "failed" {
    return state.errors.some((e) => !e.recoverable) ? "failed" : "validate_clauses";
}

// ---------------------------------------------------------------------------
// Terminal nodes
// ---------------------------------------------------------------------------

/**
 * "failed" terminal node.
 * Sets AuditStatus.FAILED, records completedAt, and collects all accumulated
 * warnings into audit.warnings for persistence.
 */
async function failedNode(state: AgentState): Promise<Partial<AgentState>> {
    console.error(
        `[graph] Entering failed node for audit ${state.audit.auditId ?? "unknown"}. Non-recoverable errors:`,
        state.errors.filter((error) => !error.recoverable),
    );
    emitProgress(state, { node: "failed", status: AuditStatus.FAILED });
    const completedAt = new Date().toISOString();
    return {
        currentNode: "failed",
        audit: {
            status: AuditStatus.FAILED,
            completedAt,
            updatedAt: completedAt,
            warnings: state.errors,
        },
    };
}

/**
 * "complete" terminal node.
 * Emits the final 100% progress event after synthesize has set
 * AuditStatus.COMPLETE and populated all audit fields.
 */
async function completeNode(state: AgentState): Promise<Partial<AgentState>> {
    emitProgress(state, { node: "complete" });
    return { currentNode: "complete" };
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

// LangGraph's node function type is structurally compatible with NodeFn
// (both accept the annotation state and return a partial update), but the
// generic parameter differs. We cast through unknown to satisfy the compiler
// without losing runtime safety — the shapes are identical.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNodeFn = (state: any) => Promise<Partial<any>>;

const graph = new StateGraph(AgentStateAnnotation)
    // Nodes
    .addNode("classify", classifyNodeWrapped as AnyNodeFn)
    .addNode("extract_clauses", extractClausesNodeWrapped as AnyNodeFn)
    .addNode("validate_clauses", validateClausesNode as AnyNodeFn)
    .addNode("benchmark", benchmarkNode as AnyNodeFn)
    .addNode("calculate_cost", calculateCostNode as AnyNodeFn)
    .addNode("generate_citations", generateCitationsNode as AnyNodeFn)
    .addNode("synthesize", synthesizeNode as AnyNodeFn)
    .addNode("complete", completeNode as AnyNodeFn)
    .addNode("failed", failedNode as AnyNodeFn)
    // Entry point
    .addEdge(START, "classify")
    // Fault-tolerant edges for classify and extract_clauses
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .addConditionalEdges("classify", routeAfterClassify as (state: any) => string)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .addConditionalEdges("extract_clauses", routeAfterExtractClauses as (state: any) => string)
    // Graceful-degradation edges (always advance regardless of node errors)
    .addEdge("validate_clauses", "benchmark")
    .addEdge("benchmark", "calculate_cost")
    .addEdge("calculate_cost", "generate_citations")
    .addEdge("generate_citations", "synthesize")
    // Terminal edges
    .addEdge("synthesize", "complete")
    .addEdge("complete", END)
    .addEdge("failed", END)
    .compile();

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Runs the full AuditSimple analysis pipeline on pre-processed AgentState.
 *
 * The caller (app/api/analyze/route.ts) is responsible for constructing
 * the initial state via createInitialState() from lib/agents/state.ts.
 *
 * @param initialState  AgentState with scrubbledDocumentText and pageTexts populated
 * @returns             Fully populated AgentState with audit.*  fields set
 */
export async function runAuditPipeline(initialState: AgentState): Promise<AgentState> {
    const result = await graph.invoke(initialState as unknown as Parameters<typeof graph.invoke>[0]);
    console.log(
        `[graph] Pipeline finished for audit ${result.audit?.auditId ?? initialState.audit.auditId ?? "unknown"} with status ${result.audit?.status ?? "unknown"}.`,
        {
            currentNode: result.currentNode,
            warningCodes: (result.errors ?? []).map((error) => error.code),
        },
    );
    return result as unknown as AgentState;
}
