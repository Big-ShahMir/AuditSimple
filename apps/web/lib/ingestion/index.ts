// ============================================================
// apps/web/lib/ingestion/index.ts
// ============================================================
// PUBLIC API for the ingestion module.
//
// THIS IS THE ONLY FILE OTHER MODULES MAY IMPORT FROM.
// All other files in lib/ingestion/ are internal implementation details.
//
// Exports ONLY:
//   validateAndIngest(req): Promise<{ auditId: string; state: AgentState }>
//   getProcessedState(auditId): Promise<AgentState | null>
//
// HARD INVARIANTS (this file is the final enforcement boundary):
//   1. scrubbledDocumentText is the ONLY text that leaves this module.
//   2. piiMap is encrypted and written to the PIIRecord table, then discarded.
//   3. piiMap NEVER appears on any return type from this file.
//   4. If Presidio is down, validateAndIngest throws — never returns partial state.
//   5. No imports from lib/agents, lib/analysis, lib/citations, lib/benchmarks.
// ============================================================

import { createHash, randomUUID } from "crypto";
import type {
    UploadRequest,
    AgentState,
    AuditWarning,
} from "@auditsimple/types";
import { AuditStatus } from "@auditsimple/types";

import { validateUpload } from "./validate";
import { extractText } from "./extract";
import { scrubPII } from "./scrub";
import { encryptPIIMap } from "./encryption";
import { storeDocument } from "./storage";
import { PIIServiceUnavailableError } from "./presidio-client";

// ---------------------------------------------------------------------------
// Prisma client singleton
// ---------------------------------------------------------------------------

// The Prisma client is imported here. If the schema changes, update field
// names below to match. Currently assumes:
//   - model Audit { auditId, status, documentHash, originalFileName,
//                   documentUrl, scrubbledText, pageTextsJson,
//                   totalPiiRedacted, warnings, createdAt, updatedAt }
//   - model PIIRecord { id, auditId, encryptedPiiMap }
//
// If the Prisma client is at a different path, update the import below.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Typed error for external consumers
// ---------------------------------------------------------------------------

export class IngestionError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = "IngestionError";
    }
}

// ---------------------------------------------------------------------------
// Pipeline helpers
// ---------------------------------------------------------------------------

/**
 * Concatenates pageTexts into a single full document string,
 * preserving page boundaries with newlines.
 */
function buildFullText(pageTexts: AgentState["pageTexts"]): string {
    return pageTexts.map((p: AgentState["pageTexts"][number]) => p.text).join("\n");
}

/**
 * Computes SHA-256 of the file buffer for tamper detection.
 */
function hashBuffer(buf: Buffer): string {
    return createHash("sha256").update(buf).digest("hex");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The full ingestion pipeline:
 *   validate → store raw file → extract text → scrub PII →
 *   encrypt & persist piiMap → build AgentState → return to caller
 *
 * The returned `state` has `scrubbledDocumentText` as the ONLY document text.
 * No unscrubbed text ever leaves this function.
 *
 * @param req - UploadRequest from the API route (base64 file + metadata).
 * @returns auditId and fully initialized AgentState ready for lib/agents.
 * @throws {IngestionError} with code 'VALIDATION_FAILED' for bad uploads.
 * @throws {IngestionError} with code 'L1_PII_SERVICE_UNAVAILABLE' if Presidio is down.
 * @throws {IngestionError} with code 'INGESTION_FAILED' for unexpected errors.
 */
export async function validateAndIngest(
    req: UploadRequest
): Promise<{ auditId: string; state: AgentState }> {
    const warnings: AuditWarning[] = [];

    // ─── STEP 1: Validate upload (magic bytes, size, MIME) ───────────────────
    const validation = validateUpload(req);

    if (!validation.valid && "errorCode" in validation) {
        throw new IngestionError(
            validation.errorCode as string,
            (validation as any).errorMessage as string
        );
    }

    if (!validation.valid || !("fileBuffer" in validation)) {
        throw new IngestionError("VALIDATION_FAILED", "Invalid upload");
    }

    const { fileBuffer } = validation;
    const auditId = randomUUID();
    const documentHash = hashBuffer(fileBuffer);

    // ─── STEP 2: Create initial Audit record ─────────────────────────────────
    await (prisma as any).audit.create({
        data: {
            auditId,
            status: AuditStatus.UPLOADING,
            originalFileName: req.fileName,
            documentHash,
        },
    });

    // ─── STEP 3: Store raw file in object storage ─────────────────────────────
    let documentUrl: string;
    try {
        documentUrl = await storeDocument(auditId, fileBuffer, req.mimeType);
    } catch (err) {
        await (prisma as any).audit.update({
            where: { auditId },
            data: { status: AuditStatus.FAILED },
        });
        throw new IngestionError(
            "STORAGE_FAILED",
            `Failed to store uploaded document: ${String(err)}`,
            err instanceof Error ? err : undefined
        );
    }

    await (prisma as any).audit.update({
        where: { auditId },
        data: { documentUrl },
    });

    // ─── STEP 4: Extract text (Pass 1 / Pass 2) ───────────────────────────────
    let pageTexts: AgentState["pageTexts"];
    try {
        pageTexts = await extractText(fileBuffer, req.mimeType, warnings);
    } catch (err) {
        await (prisma as any).audit.update({
            where: { auditId },
            data: { status: AuditStatus.FAILED },
        });
        throw new IngestionError(
            "EXTRACTION_FAILED",
            `Text extraction failed: ${String(err)}`,
            err instanceof Error ? err : undefined
        );
    }

    const fullText = buildFullText(pageTexts);

    // ─── STEP 5: Scrub PII (HARD FAIL if Presidio is down) ───────────────────
    await (prisma as any).audit.update({
        where: { auditId },
        data: { status: AuditStatus.PII_SCRUBBING },
    });

    let scrubResult: Awaited<ReturnType<typeof scrubPII>>;
    try {
        scrubResult = await scrubPII(fullText, pageTexts, warnings);
    } catch (err) {
        const isPIIFail = err instanceof PIIServiceUnavailableError;
        await (prisma as any).audit.update({
            where: { auditId },
            data: { status: AuditStatus.FAILED },
        });
        throw new IngestionError(
            isPIIFail ? "L1_PII_SERVICE_UNAVAILABLE" : "SCRUBBING_FAILED",
            isPIIFail
                ? "PII scrubbing is unavailable. The pipeline cannot proceed without Presidio."
                : `PII scrubbing failed unexpectedly: ${String(err)}`,
            err instanceof Error ? err : undefined
        );
    }

    // ─── STEP 6: Encrypt piiMap → write PIIRecord → discard piiMap ───────────
    const { piiMap, scrubbledText, entities, totalRedacted } = scrubResult;

    let encryptedPiiMap: Buffer;
    try {
        encryptedPiiMap = encryptPIIMap(piiMap);
    } catch (err) {
        await (prisma as any).audit.update({
            where: { auditId },
            data: { status: AuditStatus.FAILED },
        });
        throw new IngestionError(
            "ENCRYPTION_FAILED",
            `PII map encryption failed: ${String(err)}`,
            err instanceof Error ? err : undefined
        );
    }

    await (prisma as any).pIIRecord.create({
        data: {
            auditId,
            encryptedPiiMap,
        },
    });

    // piiMap is now encrypted and durably stored — discard the plaintext
    // This variable intentionally goes out of scope here, but we keep explicit
    // nulling as a defensive measure for GC signalling in long-running servers.
    (scrubResult as { piiMap?: unknown }).piiMap = undefined;

    // ─── STEP 7: Build entity type counts for piiSummary ─────────────────────
    const entityTypeCounts = entities.reduce(
        (acc: Record<string, number>, e: (typeof entities)[number]) => {
            acc[e.entityType] = (acc[e.entityType] ?? 0) + 1;
            return acc;
        },
        {} as Record<string, number>
    );

    // ─── STEP 8: Persist scrubbed text and update Audit record ───────────────
    await (prisma as any).audit.update({
        where: { auditId },
        data: {
            status: AuditStatus.CLASSIFYING, // Ready for the agents pipeline
            scrubbledText,
            pageTextsJson: JSON.stringify(pageTexts),
            totalPiiRedacted: totalRedacted,
            entityTypeCounts: JSON.stringify(entityTypeCounts),
            warnings: JSON.stringify(warnings),
        },
    });

    // ─── STEP 9: Assemble AgentState ─────────────────────────────────────────
    const state: AgentState = {
        audit: {
            auditId,
            status: AuditStatus.CLASSIFYING,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: null,
            originalFileName: req.fileName,
            documentHash,
            piiSummary: {
                totalRedacted,
                entityTypeCounts: entityTypeCounts as AgentState["audit"]["piiSummary"] extends infer P
                    ? P extends { entityTypeCounts: infer E }
                    ? E
                    : never
                    : never,
            },
            warnings,
            clauses: [],
            issues: [],
        },
        scrubbledDocumentText: scrubbledText, // The ONLY text that goes to the LLM
        pageTexts,
        errors: warnings,
        currentNode: "classify",
        retryCounters: {},
    };

    return { auditId, state };
}

/**
 * Retrieves a previously ingested AgentState for re-analysis.
 * Reconstructs the state from persisted Prisma records.
 *
 * @param auditId - The audit ID to look up.
 * @returns Reconstructed AgentState, or null if the audit doesn't exist.
 */
export async function getProcessedState(
    auditId: string
): Promise<AgentState | null> {
    const auditRecord = await (prisma as any).audit.findUnique({
        where: { auditId },
    });

    if (!auditRecord) return null;
    const audit = auditRecord as any;

    // Reconstruct pageTexts from stored JSON
    let pageTexts: AgentState["pageTexts"] = [];
    try {
        if (audit.pageTextsJson) {
            pageTexts = JSON.parse(audit.pageTextsJson) as AgentState["pageTexts"];
        }
    } catch {
        console.error(
            `[ingestion] Failed to parse pageTextsJson for audit ${auditId}. Returning empty pageTexts.`
        );
    }

    let warnings: AuditWarning[] = [];
    try {
        if (audit.warnings) {
            warnings = JSON.parse(audit.warnings) as AuditWarning[];
        }
    } catch {
        // Non-fatal — proceed with empty warnings
    }

    const state: AgentState = {
        audit: {
            auditId: audit.auditId,
            status: audit.status as AuditStatus,
            createdAt: audit.createdAt.toISOString(),
            updatedAt: audit.updatedAt.toISOString(),
            completedAt: audit.completedAt?.toISOString() ?? null,
            originalFileName: audit.originalFileName,
            documentHash: audit.documentHash,
            piiSummary: {
                totalRedacted: audit.totalPiiRedacted ?? 0,
                entityTypeCounts: audit.entityTypeCounts
                    ? (JSON.parse(audit.entityTypeCounts) as AgentState["audit"]["piiSummary"] extends infer P
                        ? P extends { entityTypeCounts: infer E }
                        ? E
                        : Record<string, number>
                        : Record<string, number>)
                    : ({} as AgentState["audit"]["piiSummary"] extends infer P
                        ? P extends { entityTypeCounts: infer E }
                        ? E
                        : never
                        : never),
            },
            warnings,
            clauses: [],
            issues: [],
        },
        scrubbledDocumentText: audit.scrubbledText ?? "",
        pageTexts,
        errors: warnings,
        currentNode: "classify",
        retryCounters: {},
    };

    return state;
}
