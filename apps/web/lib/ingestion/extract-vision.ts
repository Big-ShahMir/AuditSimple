// ============================================================
// apps/web/lib/ingestion/extract-vision.ts
// ============================================================
// Pass 2: OCR fallback using Claude Vision API.
// Used when:
//   (a) The uploaded file is a non-PDF image (PNG, JPEG, WebP), or
//   (b) Pass 1 (pdfjs) yields fewer than 200 characters (scanned PDF).
//
// SPEC constraint: Vision MUST still produce wordPositions bounding boxes.
// If Claude cannot provide precise positions, we estimate them and append
// an AuditWarning flagging reduced precision.
//
// Exports:
//   extractViaVision(pages, pageDimensions, warnings?): Promise<PageText[]>
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import type { AgentState, AuditWarning } from "@auditsimple/types";
import { AuditStatus as AuditStatusEnum } from "@auditsimple/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PageText = AgentState["pageTexts"][number];
export type PageDimension = { width: number; height: number };

/**
 * The structured JSON response we request from Claude Vision for each page.
 */
interface VisionTextLine {
    text: string;
    /** Approximate bounding box as fractions of page width/height (0-1) */
    boundingBox?: {
        topLeftX: number;
        topLeftY: number;
        bottomRightX: number;
        bottomRightY: number;
    };
}

interface VisionPageResult {
    lines: VisionTextLine[];
    /** True when Claude reports it cannot provide precise bounding boxes */
    positionsAreEstimated?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = "claude-3-5-sonnet-20241022";
const MAX_TOKENS = 4096;

const EXTRACTION_PROMPT = `You are a precise document text extraction assistant for a financial document auditing system.

Analyze the provided page image and extract ALL text visible on the page.

Respond with ONLY a JSON object in this exact format — no markdown, no explanation:
{
  "lines": [
    {
      "text": "the exact text of this line",
      "boundingBox": {
        "topLeftX": 0.05,
        "topLeftY": 0.03,
        "bottomRightX": 0.95,
        "bottomRightY": 0.06
      }
    }
  ],
  "positionsAreEstimated": false
}

Rules:
- boundingBox values are fractions of page width/height, ranging from 0.0 to 1.0
- Origin is top-left (topLeftX=0, topLeftY=0)
- Preserve all text exactly as it appears, including numbers, punctuation, and formatting
- If you cannot determine precise bounding boxes, set "positionsAreEstimated" to true and estimate based on line position within the page
- Include ALL text — headers, footers, tables, fine print
- Separate logically distinct lines into separate entries`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BoundingBox = {
    topLeftX: number;
    topLeftY: number;
    bottomRightX: number;
    bottomRightY: number;
};

/**
 * Estimates a bounding box for a line based on its row index and total line count.
 * Used when Vision cannot provide precise coordinates.
 */
function estimateBoundingBox(
    lineIndex: number,
    totalLines: number
): BoundingBox {
    const lineHeight = 1 / Math.max(totalLines, 1);
    const topY = lineIndex * lineHeight;
    return {
        topLeftX: 0.05,
        topLeftY: topY,
        bottomRightX: 0.95,
        bottomRightY: Math.min(topY + lineHeight, 1.0),
    };
}

/**
 * Converts a page image Buffer to a base64 media source for the Anthropic API.
 */
function bufferToMediaSource(
    imageBuffer: Buffer,
    mimeType: "image/png" | "image/jpeg" | "image/webp"
): Anthropic.ImageBlockParam["source"] {
    return {
        type: "base64",
        media_type: mimeType,
        data: imageBuffer.toString("base64"),
    };
}

/**
 * Parses Claude's JSON response or returns null on failure.
 */
function parseVisionResponse(content: string): VisionPageResult | null {
    try {
        // Strip any accidental markdown fences
        const cleaned = content.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
        return JSON.parse(cleaned) as VisionPageResult;
    } catch {
        return null;
    }
}

/**
 * Infers the MIME type from image buffer magic bytes.
 * Defaults to "image/png" for PDF-rendered pages.
 */
function inferMimeType(
    buf: Buffer
): "image/png" | "image/jpeg" | "image/webp" {
    if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
    if (buf[0] === 0x52 && buf[1] === 0x49) return "image/webp"; // RIFF
    return "image/png"; // default — PDF-rendered pages are always PNG
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts text from page images using Claude Vision with structured JSON output.
 *
 * @param pages          - Array of image buffers, one per page.
 * @param pageDimensions - Width and height in pixels for each page.
 * @param warnings       - Mutable array to append AuditWarnings to (e.g., imprecise positions).
 * @returns PageText array with word-level positions.
 */
export async function extractViaVision(
    pages: Buffer[],
    pageDimensions: PageDimension[],
    warnings: AuditWarning[] = []
): Promise<PageText[]> {
    const client = new Anthropic();
    const pageTexts: PageText[] = [];

    let anyImprecise = false;

    for (let i = 0; i < pages.length; i++) {
        const pageNum = i + 1;
        const imageBuffer = pages[i]!;
        const mimeType = inferMimeType(imageBuffer);

        let visionResult: VisionPageResult | null = null;

        try {
            const response = await client.messages.create({
                model: MODEL,
                max_tokens: MAX_TOKENS,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "image",
                                source: bufferToMediaSource(imageBuffer, mimeType),
                            },
                            {
                                type: "text",
                                text: EXTRACTION_PROMPT,
                            },
                        ],
                    },
                ],
            });

            const textBlock = response.content.find((b: Anthropic.ContentBlock) => b.type === "text");
            if (textBlock && textBlock.type === "text") {
                visionResult = parseVisionResponse(textBlock.text);
            }
        } catch (err) {
            console.error(
                `[extract-vision] Claude Vision API failed for page ${pageNum}: ${String(err)}`
            );
            // Return an empty page rather than crashing — caller handles low text yield
            visionResult = { lines: [], positionsAreEstimated: true };
        }

        if (!visionResult || visionResult.lines.length === 0) {
            console.warn(
                `[extract-vision] No text extracted from page ${pageNum}. Returning empty page.`
            );
            pageTexts.push({ pageNumber: pageNum, text: "", wordPositions: [] });
            continue;
        }

        const isEstimated = visionResult.positionsAreEstimated ?? false;
        if (isEstimated) anyImprecise = true;

        const totalLines = visionResult.lines.length;
        const wordPositions: PageText["wordPositions"] = [];
        let pageText = "";

        for (let lineIdx = 0; lineIdx < visionResult.lines.length; lineIdx++) {
            const line = visionResult.lines[lineIdx]!;
            const lineBBox: BoundingBox =
                line.boundingBox ?? estimateBoundingBox(lineIdx, totalLines);

            // Split line into words and assign proportional horizontal bounding boxes
            const words = line.text.split(/\s+/).filter((w) => w.length > 0);
            const lineTextLength = line.text.length;
            let lineCharOffset = pageText.length;

            let wordHorizOffset = 0;
            for (const word of words) {
                const wordFrac = word.length / Math.max(lineTextLength, 1);
                const wordLeftX =
                    lineBBox.topLeftX +
                    wordHorizOffset * (lineBBox.bottomRightX - lineBBox.topLeftX);
                const wordRightX =
                    lineBBox.topLeftX +
                    (wordHorizOffset + wordFrac) *
                    (lineBBox.bottomRightX - lineBBox.topLeftX);

                wordPositions.push({
                    word,
                    boundingBox: {
                        topLeftX: Math.max(0, Math.min(1, wordLeftX)),
                        topLeftY: lineBBox.topLeftY,
                        bottomRightX: Math.max(0, Math.min(1, wordRightX)),
                        bottomRightY: lineBBox.bottomRightY,
                    },
                    charOffset: lineCharOffset,
                });

                wordHorizOffset += wordFrac;
                lineCharOffset += word.length + 1; // +1 for space separator
            }

            pageText += line.text + "\n";
        }

        pageTexts.push({
            pageNumber: pageNum,
            text: pageText,
            wordPositions,
        });
    }

    // Emit a single warning if any page had imprecise positions
    if (anyImprecise) {
        warnings.push({
            code: "VISION_IMPRECISE_POSITIONS",
            message:
                "Claude Vision could not determine precise word-level bounding boxes for one or more pages. " +
                "Positions have been estimated based on text line positions. Citation accuracy may be reduced.",
            recoverable: true,
            stage: "PII_SCRUBBING" as (typeof AuditStatusEnum)[keyof typeof AuditStatusEnum],
        } as AuditWarning);
    }

    return pageTexts;
}
