// ============================================================
// apps/web/lib/agents/nodes/classify.ts
// ============================================================
// Classification node — identifies the contract type from scrubbed text.
//
// LLM config: temperature 0.0, max_tokens 200, timeout 15s
// Returns: ContractType + appends warning if confidence < 0.6
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import type { AgentState, AuditWarning } from "@auditsimple/types";
import { AuditStatus, ContractType } from "@auditsimple/types";
import { buildClassifyPrompt } from "../prompts";
import { emitProgress } from "../progress";

const anthropic = new Anthropic();
const CLASSIFY_TIMEOUT_MS = 15_000;
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
        const response = await anthropic.messages.create(
            {
                model: "claude-3-5-haiku-20241022",
                max_tokens: 200,
                temperature: 0.0,
                system,
                messages: [{ role: "user", content: user }],
            },
            { signal: controller.signal },
        );

        // Extract text content from the first content block
        const firstBlock = response.content[0];
        if (!firstBlock || firstBlock.type !== "text") {
            throw new Error("Unexpected response structure from Claude (expected text block)");
        }
        rawContent = firstBlock.text.trim();
    } finally {
        clearTimeout(timer);
    }

    // Parse the JSON response
    let parsed: { contractType: string; confidence: number };
    try {
        parsed = JSON.parse(rawContent);
    } catch {
        throw new Error(`Claude returned non-JSON for classify: ${rawContent.slice(0, 200)}`);
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
