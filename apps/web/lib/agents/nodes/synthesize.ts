// ============================================================
// apps/web/lib/agents/nodes/synthesize.ts
// ============================================================
// Summary generation + risk score node.
//
// LLM config: temperature 0.3, max_tokens 1000, timeout 30s
// Risk score is DETERMINISTIC — calculated from SEVERITY_WEIGHTS formula,
// NO LLM involvement in the score.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import type { AgentState, AuditIssue, AuditWarning } from "@auditsimple/types";
import { AuditStatus, SeverityLevel } from "@auditsimple/types";
import { gateConfidence } from "@/lib/citations";
import { buildSynthesizePrompt } from "../prompts";
import { emitProgress } from "../progress";

const anthropic = new Anthropic();
const SYNTHESIZE_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Risk score formula (per SPEC — deterministic, no LLM)
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHTS: Record<SeverityLevel, number> = {
    [SeverityLevel.INFO]: 0,
    [SeverityLevel.LOW]: 5,
    [SeverityLevel.MEDIUM]: 15,
    [SeverityLevel.HIGH]: 30,
    [SeverityLevel.CRITICAL]: 50,
};

/**
 * Calculates the risk score from AuditIssues using the deterministic
 * weighted formula specified in SPEC:
 *
 *   raw = Σ(SEVERITY_WEIGHTS[issue.severity] × issue.confidence)
 *   score = min(100, round(raw))
 */
function calculateRiskScore(issues: AuditIssue[]): number {
    const raw = issues.reduce(
        (sum, issue) => sum + SEVERITY_WEIGHTS[issue.severity] * issue.confidence,
        0,
    );
    return Math.min(100, Math.round(raw));
}

// ---------------------------------------------------------------------------
// Node implementation
// ---------------------------------------------------------------------------

export async function synthesizeNode(state: AgentState): Promise<Partial<AgentState>> {
    emitProgress(state, { node: "synthesize" });

    const issues = state.audit.issues ?? [];
    const clauses = state.audit.clauses ?? [];
    const currentErrors = state.errors ?? [];
    const warnings: AuditWarning[] = [];

    // 1. Calculate risk score deterministically (no LLM)
    const riskScore = calculateRiskScore(issues);

    // 2. Gate low-confidence clauses before synthesizing
    //    (filters clauses below the confidence threshold for summary context)
    const gateResult = gateConfidence(clauses);
    if (gateResult.warnings.length > 0) {
        for (const w of gateResult.warnings) {
            warnings.push(w);
        }
    }

    // Build state with gated clauses for prompt construction
    const stateForPrompt: AgentState = {
        ...state,
        audit: {
            ...state.audit,
            clauses: gateResult.passedClauses,
        },
    };

    // 3. Generate executive summary via LLM
    const { system, user } = buildSynthesizePrompt(stateForPrompt);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SYNTHESIZE_TIMEOUT_MS);

    let executiveSummary: string = "";

    try {
        const response = await anthropic.messages.create(
            {
                model: "claude-3-5-haiku-20241022",
                max_tokens: 1000,
                temperature: 0.3,
                system,
                messages: [{ role: "user", content: user }],
            },
            { signal: controller.signal },
        );

        const firstBlock = response.content[0];
        if (firstBlock?.type === "text") {
            executiveSummary = firstBlock.text.trim();
        }
    } catch (err) {
        // Graceful degradation: summary generation failure doesn't fail the audit
        warnings.push({
            code: "SYNTHESIZE_LLM_ERROR",
            message: `Executive summary generation failed: ${err instanceof Error ? err.message : String(err)}. Using fallback summary.`,
            recoverable: true,
            stage: AuditStatus.CITING,
        });

        // Fallback summary — constructed deterministically
        const criticalCount = issues.filter((i) => i.severity === SeverityLevel.CRITICAL).length;
        const highCount = issues.filter((i) => i.severity === SeverityLevel.HIGH).length;
        executiveSummary =
            `This ${state.audit.contractType?.replace(/_/g, " ") ?? "financial"} contract ` +
            `was analysed. ${issues.length} issue(s) were identified ` +
            `(${criticalCount} critical, ${highCount} high severity). ` +
            `Risk score: ${riskScore}/100. Please review the detailed findings below.`;
    } finally {
        clearTimeout(timer);
    }

    const completedAt = new Date().toISOString();

    // 4. Collate all accumulated warnings into audit.warnings
    const allWarnings = [...currentErrors, ...warnings];

    return {
        currentNode: "synthesize",
        audit: {
            riskScore,
            executiveSummary,
            status: AuditStatus.COMPLETE,
            completedAt,
            updatedAt: completedAt,
            warnings: allWarnings,
        },
        errors: warnings,
    };
}
