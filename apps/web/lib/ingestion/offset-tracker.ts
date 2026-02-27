// ============================================================
// apps/web/lib/ingestion/offset-tracker.ts
// ============================================================
// Pure utility for adjusting character offsets after PII placeholder
// replacements. When a placeholder is longer or shorter than the original
// text, every downstream offset must shift accordingly.
//
// Key invariant: replacements must be provided sorted in DESCENDING order
// by `start` (i.e., last replacement first) — consistent with how scrub.ts
// processes entities. This module processes them in that order and
// accumulates the delta so that adjustments are correct regardless of
// whether offsets precede or follow each replacement site.
// ============================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OffsetReplacement {
    /** Start offset of the original text in the PRE-scrubbed document */
    start: number;
    /** End offset (exclusive) of the original text in the PRE-scrubbed document */
    end: number;
    /** Length of the replacement placeholder (may be shorter or longer) */
    replacementLength: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Adjusts an array of character offsets to account for PII placeholder
 * replacements of varying lengths.
 *
 * @param originalOffsets - Array of character offsets in the pre-scrubbed text.
 * @param replacements    - Replacement operations, sorted DESCENDING by `start`
 *                         (as produced by the scrubPII descending sort). Each
 *                         entry describes where a replacement was made and how
 *                         long the new placeholder is.
 * @returns New offset array with all positions adjusted for the replacements.
 *
 * @example
 * // "John Smith" (10 chars) at offset 500 → "[PERSON_1]" (10 chars): no shift
 * // "123-45-6789" (11 chars) at offset 600 → "[SSN_REDACTED]" (14 chars): +3 shift
 * adjustOffsets([600, 650], [{ start: 600, end: 611, replacementLength: 14 }])
 * // => [600, 653]
 */
export function adjustOffsets(
    originalOffsets: number[],
    replacements: OffsetReplacement[]
): number[] {
    if (replacements.length === 0) return [...originalOffsets];

    // Sort replacements ascending by start so we can scan through them in order.
    // (scrub.ts passes them descending; we normalise here to be safe regardless.)
    const sorted = [...replacements].sort((a, b) => a.start - b.start);

    return originalOffsets.map((offset) => {
        let adjustedOffset = offset;

        for (const rep of sorted) {
            if (rep.start >= offset) {
                // This replacement is at or after our offset — does not affect it.
                break;
            }

            const originalLength = rep.end - rep.start;
            const delta = rep.replacementLength - originalLength;

            if (offset >= rep.end) {
                // Offset is entirely past this replacement — shift by full delta.
                adjustedOffset += delta;
            } else {
                // Offset falls INSIDE the replaced span (within a PII token).
                // Clamp to the start of the replacement placeholder.
                adjustedOffset = rep.start;
                // No further adjustments can be applied since we've clamped.
                break;
            }
        }

        return adjustedOffset;
    });
}

/**
 * Adjusts a single [start, end] range pair, applying the same delta logic.
 * Convenience wrapper used when adjusting bounding character ranges.
 */
export function adjustRange(
    start: number,
    end: number,
    replacements: OffsetReplacement[]
): { start: number; end: number } {
    const [newStart, newEnd] = adjustOffsets([start, end], replacements);
    return { start: newStart!, end: newEnd! };
}
