// ============================================================
// apps/web/lib/citations/reextract.ts
// ============================================================
// Tier 3: LLM re-extraction fallback via NVIDIA multimodal.
//
// Only invoked when Tiers 1 and 2 both fail. This is the ONLY
// LLM call in the citations module. If it fails, treat the
// clause as UNVERIFIED — do not retry here. Retry policy is
// governed by lib/agents/retry.ts.
// ============================================================

import OpenAI from "openai";
import type { ExtractedClause } from "@auditsimple/types";
import type { AuditWarning } from "@auditsimple/types";
import { AuditStatus } from "@auditsimple/types";
import type { MatchResult, PageText } from "./types";
import { findExactMatch } from "./exact-match";
import { findFuzzyMatch } from "./fuzzy-match";
import { CITATION_MATCH_CONFIG } from "./config";
import { renderStoredPageToImage } from "./render-page";

// ---------------------------------------------------------------------------
// NVIDIA client (singleton per process)
// ---------------------------------------------------------------------------

const CITATION_REEXTRACT_TIMEOUT_MS = 30_000;
const CITATION_VISION_MODEL =
    process.env.NVIDIA_CITATION_VISION_MODEL ?? "meta/llama-3.2-90b-vision-instruct";

const nvidia = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY ?? "",
    baseURL: "https://integrate.api.nvidia.com/v1",
});

interface ReextractResult {
    match: MatchResult | null;
    warning?: AuditWarning;
}

function buildWarning(code: string, message: string): AuditWarning {
    return {
        code,
        message,
        recoverable: true,
        stage: AuditStatus.CITING,
    };
}

// ---------------------------------------------------------------------------
// Re-extraction prompt
// ---------------------------------------------------------------------------

/**
 * Builds the targeted Claude Vision prompt for re-extraction.
 * The prompt is intentionally narrow: we tell the model exactly which
 * clause and value to look for, avoiding open-ended generation.
 */
function buildReextractionPrompt(clause: ExtractedClause): string {
    return (
        `You are a precise document-extraction assistant. ` +
        `Your task is to locate a specific piece of text in the page image provided.\n\n` +
        `Clause label: "${clause.label}"\n` +
        `Expected value: "${clause.rawValue}"\n\n` +
        `Find the EXACT sentence or phrase on this page that refers to the above clause and value. ` +
        `Return ONLY the verbatim quote from the document — the exact words as they appear on the page. ` +
        `Do not paraphrase, summarize, or add any explanation. ` +
        `If you cannot find this clause on this page, respond with exactly: NOT_FOUND`
    );
}

// ---------------------------------------------------------------------------
// Core re-extraction function
// ---------------------------------------------------------------------------

/**
 * Tier 3 verification: LLM re-extraction via Claude Vision.
 *
 * Sends the page image to Claude with a targeted prompt asking it to locate
 * the exact text corresponding to the given clause and value. If the model
 * returns a quote, we immediately run it through Tier 1 (exact match) then
 * Tier 2 (fuzzy match) against only that single page to anchor a MatchResult.
 *
 * If the model returns NOT_FOUND or the anchoring fails, returns null.
 *
 * Per SPEC: if this call throws or times out, the error propagates up to
 * verifyCitations() which treats it as UNVERIFIED. Do NOT retry here.
 *
 * @param auditId   - The audit id, used to load the stored source document page
 * @param clause    - The clause we're trying to verify
 * @param pageText  - Full text of the relevant page (for anchor matching after LLM responds)
 */
export async function reextractFromPage(
    auditId: string,
    clause: ExtractedClause,
    pageText: string,
): Promise<ReextractResult> {
    if (!process.env.NVIDIA_API_KEY) {
        return {
            match: null,
            warning: buildWarning(
                "L3_CITE_REEXTRACT_FAILED",
                "NVIDIA_API_KEY is not set, so citation re-extraction could not run.",
            ),
        };
    }

    if (!pageText) {
        return {
            match: null,
            warning: buildWarning(
                "L3_CITE_REEXTRACT_FAILED",
                `Citation re-extraction skipped for "${clause.label}" because page text is empty.`,
            ),
        };
    }

    const renderedPage = await renderStoredPageToImage(auditId, clause.source.pageNumber);
    if (renderedPage.warning) {
        return { match: null, warning: renderedPage.warning };
    }
    if (!renderedPage.image || !renderedPage.mediaType) {
        return {
            match: null,
            warning: buildWarning(
                "L3_CITE_RENDER_PAGE_FAILED",
                `Citation re-extraction could not load page ${clause.source.pageNumber} for "${clause.label}".`,
            ),
        };
    }

    const prompt = buildReextractionPrompt(clause);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CITATION_REEXTRACT_TIMEOUT_MS);

    let llmQuote = "";
    try {
        const response = await nvidia.chat.completions.create(
            {
                model: CITATION_VISION_MODEL,
                max_tokens: 512,
                temperature: 0,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: prompt,
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:${renderedPage.mediaType};base64,${renderedPage.image.toString("base64")}`,
                                },
                            },
                        ],
                    },
                ],
            },
            { signal: controller.signal },
        );

        llmQuote = (response.choices[0]?.message?.content ?? "").trim();
    } catch (err) {
        return {
            match: null,
            warning: buildWarning(
                "L3_CITE_REEXTRACT_FAILED",
                `Citation re-extraction failed for "${clause.label}" on page ${clause.source.pageNumber}: ${err instanceof Error ? err.message : String(err)}`,
            ),
        };
    } finally {
        clearTimeout(timer);
    }

    // If the model signalled it couldn't find the clause, bail out
    if (!llmQuote || llmQuote === "NOT_FOUND") {
        return { match: null };
    }

    // Wrap the single page into a PageText array so we can reuse the existing matchers
    const singlePageText: PageText = {
        pageNumber: clause.source.pageNumber,
        text: pageText,
        wordPositions: [], // Bounding box will fall back to full-page — acceptable for Tier 3
    };

    // First, try exact match against the LLM's quote on this page
    const exactResult = findExactMatch(llmQuote, [singlePageText], CITATION_MATCH_CONFIG);
    if (exactResult) return { match: exactResult };

    // If exact fails, try fuzzy match — LLM might introduce minor differences
    const fuzzyResult = findFuzzyMatch(llmQuote, [singlePageText], CITATION_MATCH_CONFIG);
    if (fuzzyResult) return { match: fuzzyResult };

    // LLM returned a quote but we couldn't anchor it in the text — treat as failure
    return {
        match: null,
        warning: buildWarning(
            "L3_CITE_REEXTRACT_FAILED",
            `Citation re-extraction returned an unanchorable quote for "${clause.label}" on page ${clause.source.pageNumber}.`,
        ),
    };
}
