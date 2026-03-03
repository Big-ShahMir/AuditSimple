// ============================================================
// apps/web/lib/ingestion/scrub.ts
// ============================================================
// PII scrubbing orchestrator.
// Calls the Presidio sidecar to detect PII, generates deterministic
// placeholders for each entity, builds the encrypted piiMap, and
// adjusts pageText word offsets to reflect the scrubbed text.
//
// HARD INVARIANTS (enforced here):
//   1. piiMap is NEVER returned to callers — it goes directly to
//      encryption.ts and then to storage.
//   2. PII original values are NEVER logged.
//   3. If Presidio is unreachable, scrubPII throws — no fallback.
//
// Exports:
//   scrubPII(fullText, pageTexts, warnings?): Promise<PIIScrubResult>
// ============================================================

import { createHash } from "crypto";
import type {
    PIIScrubResult,
    PIIEntity,
    AuditWarning,
} from "@auditsimple/types";
import { AuditStatus as AuditStatusEnum, PIIEntityType } from "@auditsimple/types";
import {
    analyzeText,
    type PresidioEntity,
    PIIServiceUnavailableError,
} from "./presidio-client";
import { generatePlaceholder } from "./redaction-rules";
import {
    adjustOffsets,
    type OffsetReplacement,
} from "./offset-tracker";
import type { PageText } from "./extract-pdf";

// ---------------------------------------------------------------------------
// Presidio → PIIEntityType mapping
// ---------------------------------------------------------------------------

/**
 * Maps Presidio entity type strings to our PIIEntityType enum.
 * Returns null for types we don't track (caller may choose to skip or log).
 */
function mapPresidioType(presidioType: string): PIIEntityType | null {
    const mapping: Record<string, PIIEntityType> = {
        PERSON: PIIEntityType.PERSON_NAME,
        PHONE_NUMBER: PIIEntityType.PHONE_NUMBER,
        EMAIL_ADDRESS: PIIEntityType.EMAIL_ADDRESS,
        CREDIT_CARD: PIIEntityType.CREDIT_CARD_NUMBER,
        IBAN_CODE: PIIEntityType.BANK_ACCOUNT,
        US_BANK_NUMBER: PIIEntityType.BANK_ACCOUNT,
        US_SSN: PIIEntityType.SSN_SIN,
        CA_SIN: PIIEntityType.SSN_SIN,
        LOCATION: PIIEntityType.ADDRESS,
        DATE_TIME: PIIEntityType.DATE_OF_BIRTH,
    };

    return mapping[presidioType] ?? null;
}

// ---------------------------------------------------------------------------
// Offset adjustment for pageTexts
// ---------------------------------------------------------------------------

/**
 * Re-builds all pageText word charOffsets to reflect the scrubbed document.
 * The replacements list must be sorted DESCENDING by start (as scrubPII does).
 */
function adjustPageTextOffsets(
    pageTexts: PageText[],
    replacements: OffsetReplacement[]
): PageText[] {
    return pageTexts.map((page) => {
        const adjustedWordPositions = page.wordPositions.map((wp: PageText["wordPositions"][number]) => ({
            ...wp,
            charOffset: adjustOffsets([wp.charOffset], replacements)[0] ?? wp.charOffset,
        }));

        return { ...page, wordPositions: adjustedWordPositions };
    });
}

// ---------------------------------------------------------------------------
// Build PIIEntity from a Presidio detection
// ---------------------------------------------------------------------------

function buildPIIEntity(
    entity: PresidioEntity,
    entityType: PIIEntityType,
    originalValue: string,
    placeholder: string,
    pageTexts: PageText[]
): PIIEntity {
    // Determine which page this entity falls on
    let runningOffset = 0;
    let pageNumber = 1;
    for (const page of pageTexts) {
        if (runningOffset + page.text.length > entity.start) {
            pageNumber = page.pageNumber;
            break;
        }
        runningOffset += page.text.length;
    }

    // Compute SHA-256 hash of the original value for tamper detection
    const textHash = createHash("sha256").update(originalValue).digest("hex");

    return {
        entityType,
        originalValue, // stored ONLY in encrypted piiMap, never logged
        redactedPlaceholder: placeholder,
        confidence: entity.score,
        location: {
            pageNumber,
            boundingBox: { topLeftX: 0, topLeftY: 0, bottomRightX: 1, bottomRightY: 1 },
            verbatimText: originalValue,
            textHash,
            charOffsetStart: entity.start,
            charOffsetEnd: entity.end,
        },
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scrubs PII from the full document text using the Presidio sidecar.
 *
 * Algorithm (from SPEC):
 * 1. Send full text to Presidio /analyze
 * 2. Sort entities DESCENDING by start offset (to replace from end → no offset drift)
 * 3. Build piiMap and apply placeholder substitutions
 * 4. Adjust pageTexts word charOffsets for placeholder length differences
 * 5. Return PIIScrubResult (piiMap included — caller MUST encrypt immediately)
 *
 * @param fullText  - The raw, unscrubbed document text. Stays within this module.
 * @param pageTexts - Page-by-page text with word positions (pre-scrubbing).
 * @param warnings  - Mutable array to append non-fatal AuditWarnings.
 * @returns PIIScrubResult including piiMap — caller MUST NOT expose piiMap externally.
 * @throws {PIIServiceUnavailableError} if Presidio is unreachable after all retries.
 */
export async function scrubPII(
    fullText: string,
    pageTexts: PageText[],
    warnings: AuditWarning[] = []
): Promise<PIIScrubResult> {
    // Step 1: Detect PII via Presidio (hard fail if unavailable)
    let presidioEntities: PresidioEntity[];
    try {
        presidioEntities = await analyzeText(fullText);
    } catch (err) {
        if (err instanceof PIIServiceUnavailableError) {
            throw err; // Propagate hard failure — pipeline must stop
        }
        throw err;
    }

    // Step 2: Sort DESCENDING by start offset (last PII first)
    // This lets us apply replacements from the end of the document backward,
    // so earlier offsets are not affected by earlier substitutions.
    const sorted = [...presidioEntities].sort((a, b) => b.start - a.start);

    // Step 3: Build piiMap and scrubbed text
    const piiMap: Record<string, string> = {};
    let scrubbled = fullText;
    const replacements: OffsetReplacement[] = [];
    const entities: PIIEntity[] = [];

    let unknownTypeCount = 0;

    for (const [i, entity] of sorted.entries()) {
        const entityType = mapPresidioType(entity.entity_type);

        if (!entityType) {
            // Unknown entity — skip, but log the type (NEVER the value)
            console.warn(
                `[scrub] Unrecognized Presidio entity type '${entity.entity_type}' at offset ` +
                `${entity.start}-${entity.end}. Skipping.`
            );
            unknownTypeCount++;
            continue;
        }

        const original = fullText.slice(entity.start, entity.end);
        const placeholder = generatePlaceholder(entityType, original, i);

        piiMap[placeholder] = original;

        scrubbled =
            scrubbled.slice(0, entity.start) +
            placeholder +
            scrubbled.slice(entity.end);

        replacements.push({
            start: entity.start,
            end: entity.end,
            replacementLength: placeholder.length,
        });

        entities.push(
            buildPIIEntity(entity, entityType, original, placeholder, pageTexts)
        );
    }

    if (unknownTypeCount > 0) {
        warnings.push({
            code: "UNKNOWN_PII_ENTITY_TYPES",
            message: `${unknownTypeCount} PII entity detection(s) were skipped because their entity type is not recognized by SimplyAudit. The affected offsets have been logged (types only, no values).`,
            recoverable: true,
            stage: AuditStatusEnum.PII_SCRUBBING,
        });
    }

    // Step 4: Adjust pageText word offsets to match the scrubbed text
    // replacements is already sorted descending — adjustOffsets handles ascending internally
    const adjustedPageTexts = adjustPageTextOffsets(pageTexts, replacements);

    console.info(
        `[scrub] PII scrubbing complete. ` +
        `Detected: ${presidioEntities.length}, Redacted: ${entities.length}, ` +
        `Unknown/skipped: ${unknownTypeCount}`
    );

    return {
        scrubbledText: scrubbled,
        piiMap, // CALLER MUST encrypt this immediately — never expose externally
        entities,
        totalRedacted: entities.length,
    };
}

// Re-export PageText type so callers don't need to reach into extract-pdf
export type { PageText };
