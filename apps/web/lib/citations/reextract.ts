// ============================================================
// apps/web/lib/citations/reextract.ts
// ============================================================
// Tier 3: LLM re-extraction fallback via Claude Vision.
//
// Only invoked when Tiers 1 and 2 both fail. This is the ONLY
// LLM call in the citations module. If it fails, treat the
// clause as UNVERIFIED — do not retry here. Retry policy is
// governed by lib/agents/retry.ts.
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedClause } from "@auditsimple/types";
import type { MatchResult, PageText } from "./types";
import { findExactMatch } from "./exact-match";
import { findFuzzyMatch } from "./fuzzy-match";
import { CITATION_MATCH_CONFIG } from "./config";

// ---------------------------------------------------------------------------
// Anthropic client (singleton per process)
// ---------------------------------------------------------------------------

let _anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
    if (!_anthropicClient) {
        _anthropicClient = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });
    }
    return _anthropicClient;
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
 * @param clause    - The clause we're trying to verify
 * @param pageImage - The rendered page image as a Buffer (PNG or JPEG)
 * @param pageText  - Full text of the relevant page (for anchor matching after LLM responds)
 */
export async function reextractFromPage(
    clause: ExtractedClause,
    pageImage: Buffer,
    pageText: string,
): Promise<MatchResult | null> {
    // If we received an empty page image or empty page text, there is nothing to do
    if (!pageImage || pageImage.length === 0 || !pageText) {
        return null;
    }

    const client = getAnthropicClient();
    const prompt = buildReextractionPrompt(clause);

    // Encode the page image as base64 for the Claude Vision API
    const base64Image = pageImage.toString("base64");

    // Detect media type from first bytes of the Buffer
    const mediaType = detectImageMediaType(pageImage);

    const response = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 512,
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: mediaType,
                            data: base64Image,
                        },
                    },
                    {
                        type: "text",
                        text: prompt,
                    },
                ],
            },
        ],
    });

    // Extract the model's text response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const llmQuote = textBlock.text.trim();

    // If the model signalled it couldn't find the clause, bail out
    if (!llmQuote || llmQuote === "NOT_FOUND") return null;

    // Wrap the single page into a PageText array so we can reuse the existing matchers
    const singlePageText: PageText = {
        pageNumber: clause.source.pageNumber,
        text: pageText,
        wordPositions: [], // Bounding box will fall back to full-page — acceptable for Tier 3
    };

    // First, try exact match against the LLM's quote on this page
    const exactResult = findExactMatch(llmQuote, [singlePageText], CITATION_MATCH_CONFIG);
    if (exactResult) return exactResult;

    // If exact fails, try fuzzy match — LLM might introduce minor differences
    const fuzzyResult = findFuzzyMatch(llmQuote, [singlePageText], CITATION_MATCH_CONFIG);
    if (fuzzyResult) return fuzzyResult;

    // LLM returned a quote but we couldn't anchor it in the text — treat as failure
    return null;
}

// ---------------------------------------------------------------------------
// Image media type detection
// ---------------------------------------------------------------------------

/**
 * Detects whether a Buffer contains a PNG or JPEG image by inspecting
 * the file signature (magic bytes). Defaults to JPEG if unknown.
 */
function detectImageMediaType(
    buffer: Buffer,
): "image/png" | "image/jpeg" | "image/gif" | "image/webp" {
    if (buffer.length < 4) return "image/jpeg";

    // PNG: starts with 0x89 0x50 0x4E 0x47
    if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
    ) {
        return "image/png";
    }

    // JPEG: starts with 0xFF 0xD8
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        return "image/jpeg";
    }

    // WebP: starts with RIFF____WEBP
    if (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
    ) {
        return "image/webp";
    }

    // GIF: starts with GIF8
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return "image/gif";
    }

    return "image/jpeg";
}
