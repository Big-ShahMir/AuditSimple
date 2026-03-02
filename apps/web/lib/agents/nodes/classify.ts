// ============================================================
// apps/web/lib/agents/nodes/classify.ts
// ============================================================
// Classification node — identifies the contract type from scrubbed text.
//
// LLM config: temperature 0.0, max_tokens 10000, timeout 30s, json_object mode
// response_format json_object forces DeepSeek V3.2 to emit only valid JSON.
// The <think> stripper + regex fallback remain as belt-and-suspenders in case
// the NIM endpoint passes thinking tokens through in the content field.
// Returns: ContractType + appends warning if confidence < 0.6
// ============================================================

// import Anthropic from "@anthropic-ai/sdk";        // ← Anthropic SDK (commented out)
// const anthropic = new Anthropic();                 // ← Anthropic client (commented out)
import OpenAI from "openai";
import type { AgentState, AuditWarning } from "@auditsimple/types";
import { AuditStatus, ContractType } from "@auditsimple/types";
import { buildClassifyPrompt } from "../prompts";
import { emitProgress } from "../progress";

// NVIDIA NIM — OpenAI-compatible endpoint hosting DeepSeek V3.2
const nvidia = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY ?? "",
    baseURL: "https://integrate.api.nvidia.com/v1",
});

const CLASSIFY_TIMEOUT_MS = 30_000;
const LOW_CONFIDENCE_THRESHOLD = 0.6;

// ---------------------------------------------------------------------------
// Node implementation
// ---------------------------------------------------------------------------

export async function classifyNode(state: AgentState): Promise<Partial<AgentState>> {
    emitProgress(state, { node: "classify" });

    const { system, user } = buildClassifyPrompt(state.scrubbledDocumentText);

    // AbortController for the 15s timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);

    let rawContent: string;

    try {
        // ── ANTHROPIC call (commented out) ───────────────────────────────────
        // const response = await anthropic.messages.create(
        //     {
        //         model: "claude-3-5-haiku-20241022",
        //         max_tokens: 200,
        //         temperature: 0.0,
        //         system,
        //         messages: [{ role: "user", content: user }],
        //     },
        //     { signal: controller.signal },
        // );
        // const firstBlock = response.content[0];
        // if (!firstBlock || firstBlock.type !== "text") {
        //     throw new Error("Unexpected response structure from Claude (expected text block)");
        // }
        // rawContent = firstBlock.text.trim();
        // ─────────────────────────────────────────────────────────────────────

        // NVIDIA NIM — DeepSeek V3.2
        // response_format json_object: suppresses any reasoning preamble and
        // forces DeepSeek to emit only valid JSON.
        // max_tokens 10000: safety margin.
        const response = await nvidia.chat.completions.create(
            {
                model: "deepseek-ai/deepseek-v3.2",
                max_tokens: 10000,
                temperature: 0.0,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
            },
            { signal: controller.signal },
        );

        const content = response.choices[0]?.message?.content ?? "";
        // Strip <think>…</think> reasoning blocks emitted before the answer
        rawContent = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    } finally {
        clearTimeout(timer);
    }

    // Parse the JSON response.
    // DeepSeek may still wrap the JSON in surrounding text even after <think> removal,
    // so fall back to extracting the first {...} block via regex.
    let parsed: { contractType: string; confidence: number };
    try {
        parsed = JSON.parse(rawContent);
    } catch {
        const match = rawContent.match(/\{[\s\S]*\}/);
        if (!match) {
            throw new Error(`DeepSeek returned non-JSON for classify: ${rawContent.slice(0, 300)}`);
        }
        try {
            parsed = JSON.parse(match[0]);
        } catch {
            throw new Error(`DeepSeek returned non-JSON for classify: ${rawContent.slice(0, 300)}`);
        }
    }

    // Validate contractType is a known enum value
    const validTypes = new Set<string>(Object.values(ContractType));
    const rawType = parsed.contractType as string;
    const confidence: number = typeof parsed.confidence === "number" ? parsed.confidence : 0;

    const errors: AuditWarning[] = [];
    let contractType: ContractType;

    if (!validTypes.has(rawType)) {
        // Claude returned an unknown type — treat as UNKNOWN
        errors.push({
            code: "CLASSIFY_INVALID_TYPE",
            message: `Claude returned unknown ContractType "${rawType}" — defaulting to UNKNOWN`,
            recoverable: true,
            stage: AuditStatus.CLASSIFYING,
        });
        contractType = ContractType.UNKNOWN;
    } else if (confidence < LOW_CONFIDENCE_THRESHOLD) {
        // Low confidence — downgrade to UNKNOWN per SPEC
        errors.push({
            code: "CLASSIFY_LOW_CONFIDENCE",
            message: `Classification confidence ${confidence.toFixed(2)} below threshold ${LOW_CONFIDENCE_THRESHOLD} — defaulting to UNKNOWN`,
            recoverable: true,
            stage: AuditStatus.CLASSIFYING,
        });
        contractType = ContractType.UNKNOWN;
    } else {
        contractType = rawType as ContractType;
    }

    return {
        currentNode: "classify",
        audit: {
            contractType,
            status: AuditStatus.EXTRACTING,
            updatedAt: new Date().toISOString(),
        },
        errors,
    };
}
