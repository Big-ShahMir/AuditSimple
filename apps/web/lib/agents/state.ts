// ============================================================
// apps/web/lib/agents/state.ts
// ============================================================
// AgentState initialization and LangGraph channel definitions.
//
// Exports:
//   createInitialState()    — builds a fresh AgentState for pipeline entry
//   AgentStateAnnotation    — LangGraph Annotation.Root() channel schema
// ============================================================

import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import type { AgentState } from "@auditsimple/types";
import { AuditStatus } from "@auditsimple/types";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Channel schema for LangGraph
// ---------------------------------------------------------------------------

// Reducers:
//   - Most fields: last-write-wins (identity reducer — LangGraph default)
//   - errors: array append (we never want a node to discard previous warnings)
//   - retryCounters: object merge (each node updates only its own key)

export const AgentStateAnnotation = Annotation.Root({
    audit: Annotation<AgentState["audit"]>({
        reducer: (prev, next) => ({ ...prev, ...next }),
        default: () => ({}),
    }),
    scrubbledDocumentText: Annotation<string>({
        reducer: (_prev, next) => next,
        default: () => "",
    }),
    pageTexts: Annotation<AgentState["pageTexts"]>({
        reducer: (_prev, next) => next,
        default: () => [],
    }),
    errors: Annotation<AgentState["errors"]>({
        // Append incoming warnings to the accumulated list — never overwrite
        reducer: (prev, next) => [...prev, ...next],
        default: () => [],
    }),
    currentNode: Annotation<string>({
        reducer: (_prev, next) => next,
        default: () => "start",
    }),
    retryCounters: Annotation<Record<string, number>>({
        // Merge so each node only stomps its own counter
        reducer: (prev, next) => ({ ...prev, ...next }),
        default: () => ({}),
    }),
});

// suppress unused-import warning — messagesStateReducer is kept for potential
// future use with LangGraph message passing
void messagesStateReducer;

// ---------------------------------------------------------------------------
// createInitialState
// ---------------------------------------------------------------------------

/**
 * Builds a fresh AgentState to be passed into runAuditPipeline().
 *
 * This is the only function that constructs a complete AgentState from scratch.
 * The ingestion layer (which populates scrubbledDocumentText and pageTexts)
 * calls this before handing state to the agents module.
 *
 * @param scrubbledText  PII-scrubbed document text (what the LLM sees)
 * @param pageTexts      Page-by-page text with word-level bounding boxes
 * @param auditId        Pre-assigned UUID v4 for this audit
 */
export function createInitialState(
    scrubbledText: string,
    pageTexts: AgentState["pageTexts"],
    auditId: string,
): AgentState {
    const now = new Date().toISOString();

    return {
        scrubbledDocumentText: scrubbledText,
        pageTexts,
        errors: [],
        currentNode: "classify",
        retryCounters: {},
        audit: {
            auditId: auditId || randomUUID(),
            status: AuditStatus.CLASSIFYING,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
            // Remaining fields are populated by pipeline nodes:
            // contractType  → classify node
            // clauses       → extract_clauses node
            // issues        → benchmark node
            // costOfLoyalty → calculate_cost node
            // riskScore     → synthesize node
            // executiveSummary → synthesize node
            // warnings      → populated from state.errors at pipeline end
        },
    };
}
