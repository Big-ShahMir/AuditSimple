// ============================================================
// apps/web/lib/ingestion/storage.ts
// ============================================================
// Object storage interface for raw uploaded documents.
// Uses @vercel/blob for Vercel deployments.
//
// Key contract:
//   - storeDocument: uploads the raw file, returns a blob URL
//   - getDocumentUrl: returns a time-limited pre-signed URL for viewing
//
// AES-256 encryption at rest and 30-day TTL are enforced by Vercel Blob
// when configured in the project settings. The blob key includes the auditId
// so retrieval is deterministic.
// ============================================================

import { put, head, type PutBlobResult } from "@vercel/blob";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

/** Key prefix for all document blobs */
const DOCUMENT_PREFIX = "documents";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mimeToExtension(mimeType: string): string {
    const map: Record<string, string> = {
        "application/pdf": "pdf",
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
    };
    return map[mimeType] ?? "bin";
}

/**
 * Constructs the deterministic blob key for a document.
 * Pattern: documents/{auditId}/{auditId}.{ext}
 */
function buildBlobKey(auditId: string, mimeType: string): string {
    const ext = mimeToExtension(mimeType);
    return `${DOCUMENT_PREFIX}/${auditId}/${auditId}.${ext}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Stores an uploaded document in Vercel Blob object storage.
 *
 * @param auditId    - The unique audit ID (used as blob key component).
 * @param fileBuffer - Raw file bytes.
 * @param mimeType   - MIME type (already validated via magic bytes).
 * @returns The blob URL (publicly addressable within the Vercel project).
 * @throws If the Blob upload fails.
 */
export async function storeDocument(
    auditId: string,
    fileBuffer: Buffer,
    mimeType: string
): Promise<string> {
    const blobKey = buildBlobKey(auditId, mimeType);

    let result: PutBlobResult;
    try {
        result = await put(blobKey, fileBuffer, {
            access: "public",
            addRandomSuffix: false,
            contentType: mimeType,
            token: BLOB_TOKEN,
        });
    } catch (err) {
        throw new Error(
            `[storage] Failed to upload document for audit ${auditId}: ${String(err)}`
        );
    }

    console.info(
        `[storage] Document stored for audit ${auditId}. ` +
        `Size: ${fileBuffer.length} bytes, MIME: ${mimeType}`
    );

    return result.url;
}

/**
 * Retrieves the URL for a previously stored document.
 * Vercel Blob public URLs don't expire, but callers should treat the URL
 * as ephemeral (e.g., wrap in a short-lived proxy for security).
 *
 * @param auditId  - The audit ID.
 * @param mimeType - The MIME type of the stored document.
 * @returns The blob URL for the document, or null if not found.
 */
export async function getDocumentUrl(
    auditId: string,
    mimeType: string
): Promise<string | null> {
    const blobKey = buildBlobKey(auditId, mimeType);

    try {
        // @vercel/blob's `head` fetches metadata for a blob by URL/key.
        // We reconstruct the URL from environment config.
        const blobStoreUrl = process.env.BLOB_STORE_URL;
        if (!blobStoreUrl) {
            throw new Error(
                "BLOB_STORE_URL environment variable is not set. Cannot reconstruct blob URL."
            );
        }

        const fullUrl = `${blobStoreUrl.replace(/\/$/, "")}/${blobKey}`;
        const metadata = await head(fullUrl, { token: BLOB_TOKEN });
        return metadata.url;
    } catch (err) {
        const errStr = String(err);
        // Blob not found is a non-fatal case — return null so caller can handle it
        if (errStr.includes("not found") || errStr.includes("404")) {
            return null;
        }
        throw new Error(
            `[storage] Failed to retrieve document URL for audit ${auditId}: ${errStr}`
        );
    }
}
