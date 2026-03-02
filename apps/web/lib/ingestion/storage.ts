// ============================================================
// apps/web/lib/ingestion/storage.ts
// ============================================================
// Object storage interface for raw uploaded documents.
// Uses @vercel/blob in production (BLOB_READ_WRITE_TOKEN must be set).
// Falls back to local filesystem storage in development so the pipeline
// works without any cloud credentials.
//
// Key contract:
//   - storeDocument: uploads the raw file, returns a URL/path string
//   - getDocumentUrl: returns the stored URL for a given auditId + mimeType
// ============================================================

import { put, head, type PutBlobResult } from "@vercel/blob";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

/** Key prefix for all document blobs */
const DOCUMENT_PREFIX = "documents";

/** Local uploads directory (relative to the Next.js app root) */
const LOCAL_UPLOADS_DIR = path.join(process.cwd(), "uploads");

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

// ---------------------------------------------------------------------------
// Local filesystem fallback (used when BLOB_READ_WRITE_TOKEN is not set)
// ---------------------------------------------------------------------------

function localFilePath(auditId: string, mimeType: string): string {
    const ext = mimeToExtension(mimeType);
    return path.join(LOCAL_UPLOADS_DIR, auditId, `${auditId}.${ext}`);
}

async function storeDocumentLocally(
    auditId: string,
    fileBuffer: Buffer,
    mimeType: string
): Promise<string> {
    const filePath = localFilePath(auditId, mimeType);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, fileBuffer);
    console.info(
        `[storage] (local) Document stored at ${filePath}. ` +
        `Size: ${fileBuffer.length} bytes, MIME: ${mimeType}`
    );
    return `local://uploads/${auditId}/${auditId}.${mimeToExtension(mimeType)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Stores an uploaded document.
 * Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production).
 * Falls back to local filesystem storage for local development.
 *
 * @param auditId    - The unique audit ID (used as storage key).
 * @param fileBuffer - Raw file bytes.
 * @param mimeType   - MIME type (already validated via magic bytes).
 * @returns A URL or local path string identifying the stored file.
 * @throws If the upload/write fails.
 */
export async function storeDocument(
    auditId: string,
    fileBuffer: Buffer,
    mimeType: string
): Promise<string> {
    // Local dev fallback — no Vercel credentials required
    if (!BLOB_TOKEN) {
        return storeDocumentLocally(auditId, fileBuffer, mimeType);
    }

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
 *
 * @param auditId  - The audit ID.
 * @param mimeType - The MIME type of the stored document.
 * @returns The URL/path for the document, or null if not found.
 */
export async function getDocumentUrl(
    auditId: string,
    mimeType: string
): Promise<string | null> {
    // Local dev fallback
    if (!BLOB_TOKEN) {
        const filePath = localFilePath(auditId, mimeType);
        if (fs.existsSync(filePath)) {
            return `local://uploads/${auditId}/${auditId}.${mimeToExtension(mimeType)}`;
        }
        return null;
    }

    const blobKey = buildBlobKey(auditId, mimeType);
    try {
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
        if (errStr.includes("not found") || errStr.includes("404")) {
            return null;
        }
        throw new Error(
            `[storage] Failed to retrieve document URL for audit ${auditId}: ${errStr}`
        );
    }
}
