// ============================================================
// apps/web/lib/ingestion/encryption.ts
// ============================================================
// AES-256-GCM encryption/decryption for the PII map.
// The PII map must be encrypted BEFORE it leaves this module and
// enters any persistent storage (PostgreSQL PIIRecord table).
//
// Layout of the encrypted buffer:
//   [0..11]   — 12-byte random IV (96-bit nonce for GCM)
//   [12..27]  — 16-byte GCM authentication tag
//   [28..]    — ciphertext (JSON-serialized piiMap)
//
// NEVER log, expose in return types, or pass the raw piiMap
// to anything outside of this module's callers.
// ============================================================

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12; // GCM recommended 96-bit nonce
const AUTH_TAG_LENGTH = 16;
const KEY_BYTE_LENGTH = 32; // 256 bits for AES-256
const KEY_HEX_LENGTH = KEY_BYTE_LENGTH * 2; // 64 hex characters

// ---------------------------------------------------------------------------
// Key resolution
// ---------------------------------------------------------------------------

/**
 * Reads and validates the PII_ENCRYPTION_KEY environment variable.
 * Throws a descriptive error at startup if the key is absent or malformed —
 * we want to fail loudly rather than silently operate without encryption.
 */
function getEncryptionKey(): Buffer {
    const hexKey = process.env.PII_ENCRYPTION_KEY;

    if (!hexKey) {
        throw new Error(
            "[encryption] PII_ENCRYPTION_KEY environment variable is not set. " +
            "This is required for PII map encryption. " +
            "Set it to a 64-character hex string (32 random bytes)."
        );
    }

    if (hexKey.length !== KEY_HEX_LENGTH) {
        throw new Error(
            `[encryption] PII_ENCRYPTION_KEY must be exactly ${KEY_HEX_LENGTH} hex characters ` +
            `(${KEY_BYTE_LENGTH} bytes), but got ${hexKey.length} characters.`
        );
    }

    if (!/^[0-9a-fA-F]+$/.test(hexKey)) {
        throw new Error(
            "[encryption] PII_ENCRYPTION_KEY contains non-hex characters. " +
            "It must be a valid hex-encoded 32-byte key."
        );
    }

    return Buffer.from(hexKey, "hex");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypts a PII map using AES-256-GCM.
 *
 * Serializes the map to JSON, encrypts, and returns a single Buffer with
 * the IV, auth tag, and ciphertext concatenated.
 *
 * @param piiMap - The plaintext placeholder → original-value map.
 * @returns Encrypted buffer suitable for storage in the PIIRecord table.
 */
export function encryptPIIMap(piiMap: Record<string, string>): Buffer {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const plaintext = JSON.stringify(piiMap);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Layout: [IV (12)] [AuthTag (16)] [Ciphertext]
    return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypts an encrypted PII map buffer produced by `encryptPIIMap`.
 *
 * @param encrypted - The raw buffer from the PIIRecord table.
 * @returns The original placeholder → original-value map.
 * @throws If the buffer is malformed, the key is wrong, or the auth tag fails.
 */
export function decryptPIIMap(encrypted: Buffer): Record<string, string> {
    const key = getEncryptionKey();

    if (encrypted.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
        throw new Error(
            "[encryption] Encrypted PII map buffer is too short to contain IV + auth tag + ciphertext."
        );
    }

    const iv = encrypted.subarray(0, IV_LENGTH);
    const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted: string;
    try {
        decrypted =
            decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
    } catch (err) {
        throw new Error(
            "[encryption] Failed to decrypt PII map — authentication tag mismatch or wrong key. " +
            String(err)
        );
    }

    try {
        return JSON.parse(decrypted) as Record<string, string>;
    } catch {
        throw new Error(
            "[encryption] Decrypted PII map is not valid JSON. The buffer may be corrupted."
        );
    }
}
