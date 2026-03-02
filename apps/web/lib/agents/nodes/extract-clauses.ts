// ============================================================
// apps/web/lib/agents/nodes/extract-clauses.ts
// ============================================================
// Clause extraction node — uses Claude tool-use to extract structured data.
//
// LLM config: temperature 0.0, max_tokens 4000, timeout 60s
// Uses contract-type-specific EXTRACTION_TEMPLATES from lib/analysis.
// Instructs the LLM to return null for unfound clauses.
// ============================================================

// import Anthropic from "@anthropic-ai/sdk";        // ← Anthropic SDK (commented out)
// const anthropic = new Anthropic();                 // ← Anthropic client (commented out)
import OpenAI from "openai";
import { randomUUID, createHash } from "crypto";
import type { AgentState, ExtractedClause, AuditWarning, SourceLocation } from "@auditsimple/types";
import { AuditStatus, ContractType } from "@auditsimple/types";
import { EXTRACTION_TEMPLATES } from "@/lib/analysis";
import { buildExtractPrompt } from "../prompts";
import { emitProgress, emitRichEvent } from "../progress";

// NVIDIA NIM — OpenAI-compatible endpoint hosting DeepSeek V3.2
const nvidia = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY ?? "",
    baseURL: "https://integrate.api.nvidia.com/v1",
});

const EXTRACT_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a stub SourceLocation for a clause before citation verification */
function buildStubSourceLocation(
    verbatimText: string,
    pageNumber: number,
    charOffsetStart: number,
    charOffsetEnd: number,
): SourceLocation {
    return {
        pageNumber: Math.max(1, pageNumber),
        boundingBox: {
            // Full-page bounding box as placeholder; citations node will refine this
            topLeftX: 0,
            topLeftY: 0,
            bottomRightX: 1,
            bottomRightY: 1,
        },
        verbatimText: verbatimText || "",
        textHash: createHash("sha256").update(verbatimText || "", "utf8").digest("hex"),
        charOffsetStart: Math.max(0, charOffsetStart),
        charOffsetEnd: Math.max(0, charOffsetEnd),
    };
}

// ---------------------------------------------------------------------------
// Node implementation
// ---------------------------------------------------------------------------

export async function extractClausesNode(state: AgentState): Promise<Partial<AgentState>> {
    emitProgress(state, { node: "extract_clauses" });

    const contractType = state.audit.contractType ?? ContractType.UNKNOWN;
    const templates = EXTRACTION_TEMPLATES[contractType] ?? EXTRACTION_TEMPLATES[ContractType.UNKNOWN];

    const { system, user, tools, tool_choice } = buildExtractPrompt(
        state.scrubbledDocumentText,
        templates,
        contractType,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);

    // ── ANTHROPIC call (commented out) ───────────────────────────────────────
    // let response: Anthropic.Message;
    // try {
    //     response = await anthropic.messages.create(
    //         {
    //             model: "claude-3-5-sonnet-20241022",
    //             max_tokens: 4000,
    //             temperature: 0.0,
    //             system,
    //             messages: [{ role: "user", content: user }],
    //             tools: tools as Anthropic.Tool[],
    //             tool_choice: tool_choice as Anthropic.ToolChoiceAny,
    //         },
    //         { signal: controller.signal },
    //     );
    // } finally {
    //     clearTimeout(timer);
    // }
    // for (const block of response.content) {
    //     if (block.type !== "tool_use") continue;
    //     const template = templateMap.get(block.name);
    //     if (!template) continue;
    //     const input = block.input as { ... };
    // }
    // ─────────────────────────────────────────────────────────────────────────

    // NVIDIA NIM — DeepSeek V3.2 (OpenAI-compatible function calling)
    let response: OpenAI.Chat.ChatCompletion;
    try {
        response = await nvidia.chat.completions.create(
            {
                model: "deepseek-ai/deepseek-v3.2",
                max_tokens: 6000,
                temperature: 0.0,
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
                tools,
                tool_choice,
            },
            { signal: controller.signal },
        );
    } finally {
        clearTimeout(timer);
    }

    // Build a template lookup map for fast access
    const templateMap = new Map(templates.map((t) => [`extract_${t.label}`, t]));

    const clauses: ExtractedClause[] = [];
    const warnings: AuditWarning[] = [];

    // OpenAI tool_calls are on response.choices[0].message.tool_calls
    const toolCalls = response.choices[0]?.message?.tool_calls ?? [];

    for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") continue;

        const template = templateMap.get(toolCall.function.name);
        if (!template) continue;

        // The LLM may return rawValue = null to indicate "not found in document"
        // OpenAI returns tool arguments as a JSON string — parse it.
        // (Anthropic returned block.input as a pre-parsed object.)
        let input: {
            rawValue: string | null;
            numericValue: number | null;
            unit: string | null;
            plainLanguageSummary: string;
            verbatimText: string;
            pageNumber: number;
            charOffsetStart: number;
            charOffsetEnd: number;
            extractionConfidence: number;
        };
        try {
            input = JSON.parse(toolCall.function.arguments);
        } catch {
            // Malformed arguments from the model — skip this tool call
            continue;
        }

        // Skip null clauses (explicitly not found in document)
        if (input.rawValue === null) continue;

        const verbatimText = input.verbatimText || input.rawValue || "";
        const clauseId = randomUUID();

        const source = buildStubSourceLocation(
            verbatimText,
            input.pageNumber ?? 1,
            input.charOffsetStart ?? 0,
            input.charOffsetEnd ?? verbatimText.length,
        );

        const clause: ExtractedClause = {
            clauseId,
            label: template.label,
            category: template.category,
            rawValue: input.rawValue,
            numericValue: input.numericValue ?? null,
            unit: input.unit ?? template.expectedUnit ?? null,
            plainLanguageSummary: input.plainLanguageSummary || "",
            source,
            extractionConfidence: Math.min(1, Math.max(0, input.extractionConfidence ?? 0.7)),
        };

        // Warn on unusually low confidence
        if (clause.extractionConfidence < 0.5) {
            warnings.push({
                code: "EXTRACT_LOW_CONFIDENCE",
                message: `Clause "${template.label}" extracted with low confidence (${clause.extractionConfidence.toFixed(2)})`,
                recoverable: true,
                stage: AuditStatus.EXTRACTING,
            });
        }

        clauses.push(clause);
        emitRichEvent(state.audit.auditId!, { type: "clause_found", clause });
    }

    if (clauses.length === 0) {
        warnings.push({
            code: "EXTRACT_NO_CLAUSES",
            message: "Extraction produced zero clauses — document may be too short or unrecognised",
            recoverable: true,
            stage: AuditStatus.EXTRACTING,
        });
    }

    return {
        currentNode: "extract_clauses",
        audit: {
            clauses,
            status: AuditStatus.EXTRACTING,
            updatedAt: new Date().toISOString(),
        },
        errors: warnings,
    };
}
