// ============================================================
// apps/web/lib/agents/prompts.ts
// ============================================================
// All LLM prompt templates for the agents pipeline.
//
// Exports:
//   buildClassifyPrompt()      — system + user for classify node
//   buildExtractPrompt()       — system + user + Anthropic tool schema
//   buildSynthesizePrompt()    — system + user for synthesize node
//
// Per SPEC: every system prompt MUST include the anti-hallucination invariant:
//   "If you cannot find information in the provided document, respond with
//    null. Do not infer, guess, or fabricate values."
// ============================================================

import type { AgentState, ContractType } from "@auditsimple/types";
import type { ClauseTemplate } from "@/lib/analysis";

// ---------------------------------------------------------------------------
// Anti-hallucination invariant (injected into every system prompt)
// ---------------------------------------------------------------------------

const ANTI_HALLUCINATION_INVARIANT =
    "If you cannot find information in the provided document, respond with null. " +
    "Do not infer, guess, or fabricate values.";

// ---------------------------------------------------------------------------
// Classify prompt
// ---------------------------------------------------------------------------

export interface ClassifyPromptResult {
    system: string;
    user: string;
}

/**
 * Builds the classify node prompt.
 * Instructs Claude to return JSON with exactly one ContractType value plus
 * a confidence score. Temperature 0.0, max_tokens 200.
 *
 * @param scrubbledText  PII-scrubbed document text (what the LLM sees)
 */
export function buildClassifyPrompt(scrubbledText: string): ClassifyPromptResult {
    const system = [
        "You are a financial document classifier for a Canadian fintech audit platform.",
        "You will be given PII-scrubbed financial contract text.",
        "Your task is to identify the contract type from the following exhaustive list:",
        "  MORTGAGE, AUTO_LEASE, AUTO_LOAN, CREDIT_CARD, PERSONAL_LOAN,",
        "  LINE_OF_CREDIT, INSURANCE_POLICY, INVESTMENT_AGREEMENT, UNKNOWN",
        "",
        "Return a JSON object with exactly two fields:",
        '  { "contractType": "<TYPE>", "confidence": <0.0–1.0> }',
        "",
        "Rules:",
        "- contractType MUST be one of the values listed above. NEVER return a value not in this list.",
        "- confidence is your certainty that you have correctly identified the contract type (0.0 = not sure, 1.0 = certain).",
        "- If the document does not clearly match any type, return UNKNOWN with the appropriate confidence.",
        "- Return ONLY the JSON object. No markdown fences, no explanation, no extra fields.",
        "",
        ANTI_HALLUCINATION_INVARIANT,
    ].join("\n");

    const user = [
        "Classify the following financial document:",
        "",
        "---BEGIN DOCUMENT---",
        scrubbledText.slice(0, 8000), // Guard against excessively long inputs
        "---END DOCUMENT---",
    ].join("\n");

    return { system, user };
}

// ---------------------------------------------------------------------------
// Extract-clauses prompt (tool-use / function-calling mode)
// ---------------------------------------------------------------------------

// ── ANTHROPIC TOOL FORMAT (commented out, preserved for reference) ──────────
// export interface AnthropicTool {
//     name: string;
//     description: string;
//     input_schema: {
//         type: "object";
//         properties: Record<string, unknown>;
//         required: string[];
//     };
// }
//
// export interface ExtractPromptResult {
//     system: string;
//     user: string;
//     tools: AnthropicTool[];
//     tool_choice: { type: "any" };
// }
// ────────────────────────────────────────────────────────────────────────────

// OpenAI-compatible tool format (used by NVIDIA NIM / Qwen3.5-397B)
export interface OpenAITool {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, unknown>;
            required: string[];
        };
    };
}

export interface ExtractPromptResult {
    system: string;
    user: string;
    tools: OpenAITool[];
    tool_choice: "required";
}

/**
 * Builds the extract_clauses node prompt with a dynamically generated tool schema.
 *
 * One Anthropic tool is generated per ClauseTemplate. The LLM is instructed to
 * call each tool with the extracted clause data (or rawValue = "null" if unfound).
 *
 * Temperature 0.0, max_tokens 4000.
 *
 * @param scrubbledText  PII-scrubbed document text
 * @param templates      Contract-type-specific extraction templates
 * @param contractType   The detected contract type (for context in the prompt)
 */
export function buildExtractPrompt(
    scrubbledText: string,
    templates: ClauseTemplate[],
    contractType: ContractType,
): ExtractPromptResult {
    const system = [
        "You are a financial clause extractor for a Canadian fintech audit platform.",
        "You will be given PII-scrubbed financial contract text and a list of clause types to extract.",
        `You are analyzing a ${contractType.replace(/_/g, " ")} contract.`,
        "",
        "For EACH clause type, you MUST call the corresponding tool with the extracted data.",
        "If a clause is not present in the document, call the tool with rawValue = null.",
        "",
        "Extraction rules:",
        "- Extract the VERBATIM text from the document for the verbatimText field.",
        "- For numericValue: parse the number only (e.g., '4.99%' → 4.99, '$450' → 450).",
        "- For pageNumber: use 1-indexed page number where the clause appears. Default to 1 if unknown.",
        "- For charOffsetStart/End: your best estimate of character position in the full document text.",
        "- For extractionConfidence: your confidence in this extraction (0.0–1.0).",
        "- NEVER fabricate clause text. If you are unsure, set rawValue to null.",
        "",
        ANTI_HALLUCINATION_INVARIANT,
    ].join("\n");

    const user = [
        "Extract all specified clauses from the following financial document:",
        "",
        "---BEGIN DOCUMENT---",
        scrubbledText.slice(0, 16000),
        "---END DOCUMENT---",
    ].join("\n");

    // ── ANTHROPIC tool schema (commented out, preserved for reference) ────────
    // const tools: AnthropicTool[] = templates.map((template) => ({
    //     name: `extract_${template.label}`,
    //     description: `Extract the "${template.label}" clause. ${template.promptHint}`,
    //     input_schema: {
    //         type: "object" as const,
    //         properties: { ... },
    //         required: [ ... ],
    //     },
    // }));
    // ─────────────────────────────────────────────────────────────────────────

    // OpenAI-compatible tool schema (NVIDIA NIM / Qwen3.5-397B)
    const tools: OpenAITool[] = templates.map((template) => ({
        type: "function" as const,
        function: {
            name: `extract_${template.label}`,
            description: `Extract the "${template.label}" clause. ${template.promptHint}`,
            parameters: {
                type: "object" as const,
                properties: {
                rawValue: {
                    type: ["string", "null"],
                    description:
                        `The raw extracted value (e.g., "4.99%", "$450", "36 months"). ` +
                        `Return null if not found in the document.`,
                },
                numericValue: {
                    type: ["number", "null"],
                    description: template.expectedUnit
                        ? `Numeric value in ${template.expectedUnit}. Null if not applicable.`
                        : "Parsed numeric value. Null if not applicable.",
                },
                unit: {
                    type: ["string", "null"],
                    description: template.expectedUnit
                        ? `The unit. Expected: "${template.expectedUnit}".`
                        : "The unit of measurement, or null.",
                },
                plainLanguageSummary: {
                    type: "string",
                    description:
                        "A 1-2 sentence plain-language explanation of what this clause means for the consumer.",
                },
                verbatimText: {
                    type: "string",
                    description: "The exact verbatim text from the source document for this clause.",
                },
                pageNumber: {
                    type: "integer",
                    description: "1-indexed page number where this clause appears.",
                },
                charOffsetStart: {
                    type: "integer",
                    description: "Character offset (from document start) where this clause begins.",
                },
                charOffsetEnd: {
                    type: "integer",
                    description: "Character offset (from document start) where this clause ends.",
                },
                extractionConfidence: {
                    type: "number",
                    description: "Your confidence in this extraction (0.0 = low, 1.0 = high).",
                },
            },
            required: [
                "rawValue",
                "numericValue",
                "unit",
                "plainLanguageSummary",
                "verbatimText",
                "pageNumber",
                "charOffsetStart",
                "charOffsetEnd",
                "extractionConfidence",
            ],
            },  // closes parameters
        },      // closes function
    }));

    return { system, user, tools, tool_choice: "required" };
}

// ---------------------------------------------------------------------------
// Synthesize prompt
// ---------------------------------------------------------------------------

export interface SynthesizePromptResult {
    system: string;
    user: string;
}

/**
 * Builds the synthesize node prompt.
 * Instructs Claude to produce an executive summary in plain language.
 * Temperature 0.3, max_tokens 1000.
 *
 * @param state  The full AgentState after all analysis nodes have run
 */
export function buildSynthesizePrompt(state: AgentState): SynthesizePromptResult {
    const { audit } = state;
    const issues = audit.issues ?? [];
    const clauses = audit.clauses ?? [];
    const contractType = audit.contractType?.replace(/_/g, " ") ?? "Unknown";

    const issuesSummary = issues
        .slice(0, 10) // Cap to avoid exceeding context
        .map((issue) => `- [${issue.severity}] ${issue.title}: ${issue.description}`)
        .join("\n");

    const clausesSummary = clauses
        .slice(0, 15)
        .map(
            (c) =>
                `- ${c.label.replace(/_/g, " ")}: ${c.rawValue}` +
                (c.numericValue !== null ? ` (${c.numericValue} ${c.unit ?? ""})` : ""),
        )
        .join("\n");

    const costOfLoyalty = audit.costOfLoyalty;

    const system = [
        "You are a financial advisor writing a plain-language executive summary for a Canadian consumer.",
        "You will be given a structured analysis of their financial contract.",
        "Write an executive summary that:",
        "  1. States what type of contract this is",
        "  2. Highlights the 2-3 most important findings (prioritise HIGH and CRITICAL issues)",
        "  3. Gives the consumer a clear sense of whether this contract is fair, concerning, or mixed",
        "  4. Uses plain everyday language — no jargon. Write as if explaining to a friend.",
        "  5. Is STRICTLY no longer than 300 words.",
        "",
        "Do NOT:",
        "  - Give legal advice",
        "  - Tell the consumer what to do",
        "  - Repeat every clause — summarise only what matters most",
        "  - Use bullet points (write flowing paragraphs)",
        "",
        ANTI_HALLUCINATION_INVARIANT,
    ].join("\n");

    const user = [
        `Contract type: ${contractType}`,
        "",
        "Key clauses extracted:",
        clausesSummary || "(none extracted)",
        "",
        `Issues found (${issues.length} total):`,
        issuesSummary || "(none found)",
        "",
        costOfLoyalty
            ? `Estimated cost of staying with this contract: $${costOfLoyalty.totalCost.toLocaleString("en-CA")} CAD over ${costOfLoyalty.timeHorizonMonths} months`
            : "",
        "",
        "Write the executive summary now:",
    ]
        .filter(Boolean)
        .join("\n");

    return { system, user };
}
