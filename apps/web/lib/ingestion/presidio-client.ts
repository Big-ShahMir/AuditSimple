// ============================================================
// apps/web/lib/ingestion/presidio-client.ts
// ============================================================
// HTTP client for the Presidio PII detection/anonymization sidecar.
// Retries 3 times with 1s backoff. Throws a typed
// L1_PII_SERVICE_UNAVAILABLE error if all retries fail.
//
// HARD INVARIANT: if this client throws, the pipeline MUST NOT proceed.
// There is no fallback. PII scrubbing is never optional.
// ============================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single PII entity detection result from Presidio's /analyze endpoint.
 * Uses Presidio's snake_case naming convention from the REST API.
 */
export interface PresidioEntity {
    /** Entity type string as returned by Presidio (e.g., "PERSON", "EMAIL_ADDRESS") */
    entity_type: string;
    /** Start character offset in the input text (inclusive) */
    start: number;
    /** End character offset in the input text (exclusive) */
    end: number;
    /** Confidence score from Presidio's recognizers (0.0–1.0) */
    score: number;
}

/**
 * Typed error thrown when all retries to the Presidio sidecar fail.
 * Pipeline code MUST catch this and fail the audit with FAILED status.
 */
export class PIIServiceUnavailableError extends Error {
    readonly code = "L1_PII_SERVICE_UNAVAILABLE" as const;

    constructor(cause?: Error) {
        super(
            "Presidio PII sidecar is unreachable after 3 attempts. " +
            "Pipeline cannot continue without PII scrubbing. " +
            (cause ? `Original error: ${cause.message}` : "")
        );
        this.name = "PIIServiceUnavailableError";
        if (cause) this.cause = cause;
    }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PRESIDIO_BASE_URL =
    process.env.PRESIDIO_URL?.replace(/\/$/, "") ?? "http://localhost:8080";

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 1_000;

// Presidio entity types we want to detect. Aligns with PIIEntityType enum.
const PRESIDIO_ENTITIES = [
    "PERSON",
    "PHONE_NUMBER",
    "EMAIL_ADDRESS",
    "CREDIT_CARD",
    "IBAN_CODE",
    "US_SSN",
    "CA_SIN",
    "AU_MEDICARE",
    "IN_PAN",
    "LOCATION",
    "DATE_TIME",
    "US_BANK_NUMBER",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Makes an HTTP POST to the Presidio sidecar with automatic retry.
 * Throws PIIServiceUnavailableError after MAX_RETRIES failures.
 */
async function presidioPost<T>(
    path: string,
    body: unknown,
    attempt = 1
): Promise<T> {
    try {
        const response = await fetch(`${PRESIDIO_BASE_URL}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
            throw new Error(
                `Presidio returned HTTP ${response.status} ${response.statusText} for ${path}`
            );
        }

        return (await response.json()) as T;
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        if (attempt < MAX_RETRIES) {
            console.warn(
                `[presidio-client] ${path} failed (attempt ${attempt}/${MAX_RETRIES}): ${error.message}. ` +
                `Retrying in ${RETRY_BACKOFF_MS}ms...`
            );
            await sleep(RETRY_BACKOFF_MS * attempt); // linear backoff: 1s, 2s
            return presidioPost<T>(path, body, attempt + 1);
        }

        // All retries exhausted — hard fail
        throw new PIIServiceUnavailableError(error);
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calls Presidio's `/analyze` endpoint to detect PII entities in `text`.
 *
 * @param text     - The full document text (unscrubbed). Stays within this module.
 * @param language - BCP-47 language code (default: "en").
 * @returns Array of detected PII entities with their offsets and confidence scores.
 * @throws {PIIServiceUnavailableError} if Presidio is unreachable after 3 attempts.
 */
export async function analyzeText(
    text: string,
    language = "en"
): Promise<PresidioEntity[]> {
    const result = await presidioPost<PresidioEntity[]>("/analyze", {
        text,
        language,
        entities: PRESIDIO_ENTITIES,
        return_decision_process: false,
    });

    // Log only counts and types — NEVER the text content
    console.info(
        `[presidio-client] /analyze detected ${result.length} entity/entities. ` +
        `Types: ${[...new Set(result.map((e) => e.entity_type))].join(", ")}`
    );

    return result;
}

/**
 * Calls Presidio's `/anonymize` endpoint to apply redaction operators.
 * Note: in our pipeline, we do NOT rely on Presidio's anonymization — we
 * build our own placeholders via `redaction-rules.ts` for full control.
 * This function is provided for completeness and direct-anonymize use cases.
 *
 * @param text     - The full document text (unscrubbed).
 * @param entities - Entities detected by `analyzeText`.
 * @returns Anonymized text with Presidio's default operators applied.
 * @throws {PIIServiceUnavailableError} if Presidio is unreachable after 3 attempts.
 */
export async function anonymizeText(
    text: string,
    entities: PresidioEntity[]
): Promise<string> {
    const result = await presidioPost<{ text: string }>("/anonymize", {
        text,
        anonymizers: { DEFAULT: { type: "replace", new_value: "[REDACTED]" } },
        analyzer_results: entities,
    });

    return result.text;
}
