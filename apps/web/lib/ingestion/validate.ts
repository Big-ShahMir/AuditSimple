// ============================================================
// apps/web/lib/ingestion/validate.ts
// ============================================================
// Validates an incoming UploadRequest via magic bytes (not extension
// or declared MIME type). Size cap is enforced before any byte inspection.
// NEVER trust file extensions — always validate via magic bytes.
// ============================================================

import type { UploadRequest } from "@auditsimple/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValidationErrorCode =
    | "INVALID_MIME_TYPE"
    | "FILE_TOO_LARGE"
    | "MAGIC_BYTES_MISMATCH"
    | "INVALID_BASE64"
    | "EMPTY_FILE";

export type ValidationResult =
    | { valid: true; fileBuffer: Buffer }
    | { valid: false; errorCode: ValidationErrorCode; errorMessage: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UPLOAD_CONSTRAINTS = {
    maxFileSizeMB: 25,
    allowedMimeTypes: [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
    ] as const,
} as const;

const MAX_FILE_SIZE_BYTES = UPLOAD_CONSTRAINTS.maxFileSizeMB * 1024 * 1024;

/**
 * Magic byte signatures for each supported MIME type.
 * WebP is special: first 4 bytes are RIFF, bytes 8-11 must be WEBP.
 */
const MAGIC_BYTES: Record<string, number[]> = {
    "application/pdf": [0x25, 0x50, 0x44, 0x46], // %PDF
    "image/png": [0x89, 0x50, 0x4e, 0x47], // .PNG
    "image/jpeg": [0xff, 0xd8, 0xff], // ÿØÿ
    "image/webp": [0x52, 0x49, 0x46, 0x46], // RIFF (+ WEBP check at offset 8)
};

// ASCII codes for W, E, B, P
const WEBP_MARKER = [0x57, 0x45, 0x42, 0x50];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the buffer's first bytes match the expected magic bytes.
 */
function matchesMagicBytes(buf: Buffer, magic: number[]): boolean {
    if (buf.length < magic.length) return false;
    return magic.every((byte, i) => buf[i] === byte);
}

/**
 * Additional WebP validation: bytes 8-11 must be "WEBP".
 */
function isValidWebP(buf: Buffer): boolean {
    if (buf.length < 12) return false;
    return WEBP_MARKER.every((byte, i) => buf[8 + i] === byte);
}

/**
 * Returns true if the declared MIME type is in the allowlist.
 */
function isAllowedMimeType(
    mimeType: string
): mimeType is (typeof UPLOAD_CONSTRAINTS.allowedMimeTypes)[number] {
    return (UPLOAD_CONSTRAINTS.allowedMimeTypes as readonly string[]).includes(
        mimeType
    );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates an UploadRequest by checking magic bytes (not file extension),
 * MIME type allowlist, and file size.
 *
 * @returns ValidationResult — either valid (with decoded Buffer) or an error.
 */
export function validateUpload(req: UploadRequest): ValidationResult {
    // 1. Check declared MIME type against allowlist
    if (!isAllowedMimeType(req.mimeType)) {
        return {
            valid: false,
            errorCode: "INVALID_MIME_TYPE",
            errorMessage: `MIME type '${req.mimeType}' is not supported. Allowed types: ${UPLOAD_CONSTRAINTS.allowedMimeTypes.join(", ")}.`,
        };
    }

    // 2. Decode base64
    let fileBuffer: Buffer;
    try {
        fileBuffer = Buffer.from(req.fileContent, "base64");
    } catch {
        return {
            valid: false,
            errorCode: "INVALID_BASE64",
            errorMessage: "File content could not be decoded from base64.",
        };
    }

    // 3. Reject empty files
    if (fileBuffer.length === 0) {
        return {
            valid: false,
            errorCode: "EMPTY_FILE",
            errorMessage: "File is empty.",
        };
    }

    // 4. Enforce size limit
    if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
        const sizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
        return {
            valid: false,
            errorCode: "FILE_TOO_LARGE",
            errorMessage: `File size ${sizeMB} MB exceeds the maximum allowed size of ${UPLOAD_CONSTRAINTS.maxFileSizeMB} MB.`,
        };
    }

    // 5. Validate magic bytes — the ONLY authoritative check (not file extension)
    const expectedMagic = MAGIC_BYTES[req.mimeType];
    if (!matchesMagicBytes(fileBuffer, expectedMagic)) {
        return {
            valid: false,
            errorCode: "MAGIC_BYTES_MISMATCH",
            errorMessage: `File content does not match the declared MIME type '${req.mimeType}'. The file header bytes do not match the expected signature.`,
        };
    }

    // 6. Additional WebP validation (RIFF + WEBP marker at offset 8)
    if (req.mimeType === "image/webp" && !isValidWebP(fileBuffer)) {
        return {
            valid: false,
            errorCode: "MAGIC_BYTES_MISMATCH",
            errorMessage: "File declares image/webp but does not contain a valid WEBP marker at offset 8.",
        };
    }

    return { valid: true, fileBuffer };
}
