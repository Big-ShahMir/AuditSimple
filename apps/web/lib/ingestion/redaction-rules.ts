// ============================================================
// apps/web/lib/ingestion/redaction-rules.ts
// ============================================================
// Deterministic placeholder generation for PII entities.
// PURE FUNCTION — same inputs always produce the same output.
// This idempotency is required so that the piiMap can be used
// to reverse placeholders during the citation de-anonymization phase.
//
// NEVER log the `originalValue` parameter anywhere in this file.
// ============================================================

import { PIIEntityType } from "@auditsimple/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the last `n` digits from a string.
 * Falls back to "XXXX" if fewer than `n` digits are present.
 */
function lastDigits(value: string, n: number): string {
    const digits = value.replace(/\D/g, "");
    return digits.length >= n ? digits.slice(-n) : "XXXX";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a deterministic, human-readable placeholder for a PII entity.
 *
 * @param entityType    - The type of PII detected.
 * @param originalValue - The raw PII value (used ONLY for partial-digit extraction;
 *                        NEVER logged or returned verbatim).
 * @param instanceIndex - Zero-based occurrence index within this document scrub pass.
 *                        This is the descending-sorted index from scrubPII, so
 *                        the first entity encountered gets index 0.
 * @returns A bracketed placeholder string, e.g. "[PERSON_1]" or "[ACCOUNT_***4523]".
 */
export function generatePlaceholder(
    entityType: PIIEntityType,
    originalValue: string,
    instanceIndex: number
): string {
    // Human-readable 1-based counter for display (e.g., PERSON_1, PERSON_2)
    const n = instanceIndex + 1;

    switch (entityType) {
        case PIIEntityType.PERSON_NAME:
            return `[PERSON_${n}]`;

        case PIIEntityType.PHONE_NUMBER:
            return `[PHONE_${n}]`;

        case PIIEntityType.EMAIL_ADDRESS:
            return `[EMAIL_${n}]`;

        case PIIEntityType.CREDIT_CARD_NUMBER: {
            const last4 = lastDigits(originalValue, 4);
            return `[CARD_***${last4}]`;
        }

        case PIIEntityType.BANK_ACCOUNT: {
            const last4 = lastDigits(originalValue, 4);
            return `[ACCOUNT_***${last4}]`;
        }

        case PIIEntityType.SSN_SIN:
            // Never leak any digits of SSN/SIN — fully redacted
            return `[SSN_REDACTED]`;

        case PIIEntityType.ADDRESS:
            return `[ADDRESS_${n}]`;

        case PIIEntityType.DATE_OF_BIRTH:
            // Never leak a DOB value
            return `[DOB_REDACTED]`;

        default: {
            // Exhaustive check — TypeScript will error here if a new PIIEntityType
            // is added to the enum but not handled above.
            const _exhaustive: never = entityType;
            void _exhaustive;
            return `[REDACTED_${n}]`;
        }
    }
}

/**
 * Returns the PIIEntityType-specific display name used in UI and logs.
 * Safe to log — never references the original value.
 */
export function entityTypeDisplayName(entityType: PIIEntityType): string {
    const names: Record<PIIEntityType, string> = {
        [PIIEntityType.PERSON_NAME]: "Person Name",
        [PIIEntityType.PHONE_NUMBER]: "Phone Number",
        [PIIEntityType.EMAIL_ADDRESS]: "Email Address",
        [PIIEntityType.CREDIT_CARD_NUMBER]: "Credit Card Number",
        [PIIEntityType.BANK_ACCOUNT]: "Bank Account",
        [PIIEntityType.SSN_SIN]: "SSN/SIN",
        [PIIEntityType.ADDRESS]: "Address",
        [PIIEntityType.DATE_OF_BIRTH]: "Date of Birth",
    };
    return names[entityType] ?? "Unknown";
}
