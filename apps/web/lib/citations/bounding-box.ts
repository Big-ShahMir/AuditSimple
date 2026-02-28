// ============================================================
// apps/web/lib/citations/bounding-box.ts
// ============================================================
// Bounding box computation from word-level positions.
// Given a character offset range and OCR word positions,
// computes the union rectangle enclosing all matched words.
// ============================================================

import type { SourceLocation } from "@auditsimple/types";
import type { AuditWarning } from "@auditsimple/types";
import { AuditStatus } from "@auditsimple/types";
import type { WordPosition } from "./types";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/** Return value of computeBoundingBox — includes an optional warning for fallbacks */
export interface BoundingBoxResult {
    boundingBox: SourceLocation["boundingBox"];
    /** Populated when no matching words were found; signals frontend to use page-level highlight */
    warning?: AuditWarning;
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

/**
 * Computes the enclosing bounding box for all words that overlap with the
 * character offset range [matchStart, matchEnd).
 *
 * "Overlap" means the word's character span intersects the match range — a word
 * that begins before `matchEnd` and ends after `matchStart` is included.
 *
 * All coordinates are page-relative fractions in [0, 1] (same as OCR output).
 *
 * Implementation note: multi-line text spans are handled naturally by computing
 * the union rectangle — topLeftY is the minimum Y across all matched words, and
 * bottomRightY is the maximum Y, so the box covers the full vertical span.
 *
 * @param matchStart    - Character offset of match start within page text
 * @param matchEnd      - Character offset of match end within page text (exclusive)
 * @param wordPositions - Word-level bounding boxes from OCR (for the same page)
 */
export function computeBoundingBox(
    matchStart: number,
    matchEnd: number,
    wordPositions: WordPosition[],
): BoundingBoxResult {
    // Find all words whose character span overlaps with [matchStart, matchEnd)
    const overlapping = wordPositions.filter((wp) => {
        const wordEnd = wp.charOffset + wp.word.length;
        return wp.charOffset < matchEnd && wordEnd > matchStart;
    });

    if (overlapping.length === 0) {
        // Fallback: return a full-page bounding box.
        // Per SPEC: this must generate an AuditWarning with code L4_RENDER_CITATION_FAILED
        // so the frontend knows to show a page-level highlight instead of a precise one.
        return {
            boundingBox: {
                topLeftX: 0,
                topLeftY: 0,
                bottomRightX: 1,
                bottomRightY: 1,
            },
            warning: {
                code: "L4_RENDER_CITATION_FAILED",
                message:
                    "Could not locate word-level bounding boxes for citation — " +
                    "falling back to full-page highlight.",
                recoverable: true,
                stage: AuditStatus.CITING,
            },
        };
    }

    // Compute the union rectangle of all overlapping word bounding boxes.
    // For a multi-line span, topLeftY is the top of the first line and
    // bottomRightY is the bottom of the last line.
    const boundingBox: SourceLocation["boundingBox"] = {
        topLeftX: Math.min(...overlapping.map((w) => w.boundingBox.topLeftX)),
        topLeftY: Math.min(...overlapping.map((w) => w.boundingBox.topLeftY)),
        bottomRightX: Math.max(...overlapping.map((w) => w.boundingBox.bottomRightX)),
        bottomRightY: Math.max(...overlapping.map((w) => w.boundingBox.bottomRightY)),
    };

    return { boundingBox };
}
