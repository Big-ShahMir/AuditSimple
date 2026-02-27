# Module: ingestion

## Purpose

This module handles everything between "user drops a file" and "scrubbed text is ready for analysis." It owns three responsibilities: file validation, text extraction with positional metadata, and PII scrubbing via the Presidio sidecar. The output of this module is a fully populated `AgentState` with `scrubbledDocumentText` and `pageTexts` — ready to be handed to `lib/agents` for pipeline execution.

**Hard invariant: PII never reaches the LLM.** This module is the enforcement boundary. Every byte of text that leaves this module toward the analysis pipeline has been deterministically scrubbed. The PII map is encrypted and stored in PostgreSQL — it never appears in logs, API responses, or LLM prompts.

## Interfaces (import from `packages/types`)

### Consumed
- `UploadRequest` — incoming file payload from the API route
- `PIIEntityType` — enum for entity classification
- `AgentState` — this module constructs the initial state object
- `AuditWarning` — appended when non-fatal issues occur (e.g., partial PII scrub, low text yield)
- `AuditStatus` — used to track progression through ingestion sub-stages

### Produced
- `UploadResponse` — returned to the client immediately after validation
- `PIIScrubResult` — internal result of the scrubbing pass (piiMap stays in this module)
- `PIIEntity` — individual detected PII instances with source locations
- `AgentState` — fully initialized state with scrubbed text and positional metadata, ready for `lib/agents`

## Dependencies

### This module calls:
- `services/presidio` — HTTP calls to the Presidio Docker sidecar for PII detection (`POST /analyze` and `POST /anonymize`)
- `pdfjs-dist` — PDF text extraction with positional metadata (Pass 1)
- `@anthropic-ai/sdk` — Claude Vision API for OCR fallback on scanned PDFs (Pass 2)
- `crypto` (Node.js built-in) — SHA-256 hashing for document fingerprinting and PII map encryption
- Prisma client — writing the `Audit` record (initial creation) and `PIIRecord` (encrypted PII map)
- Object storage client (Vercel Blob / S3 SDK) — storing the raw uploaded file

### Called by:
- `app/api/upload/route.ts` — the upload endpoint calls `validateAndIngest()` to kick off the pipeline
- `app/api/analyze/route.ts` — may call `getProcessedState()` to retrieve a previously ingested state if re-analysis is needed

### Does NOT call:
- `lib/agents` — this module produces the input for agents, it does not trigger the pipeline
- `lib/citations` — no interaction at this layer
- `lib/benchmarks` — no interaction at this layer

## Files to Create

- **`validate.ts`** — File validation logic. Exports `validateUpload(req: UploadRequest): ValidationResult`. Checks MIME type via magic bytes (first 8 bytes of the buffer, not file extension), enforces size limit (25MB), rejects unsupported types. Returns a typed result with specific error codes on failure.
- **`extract.ts`** — Text extraction orchestrator. Exports `extractText(fileBuffer: Buffer, mimeType: string): Promise<PageText[]>` where `PageText` matches the `AgentState["pageTexts"][number]` shape. Implements the two-pass strategy: Pass 1 with `pdfjs-dist` for structured extraction, Pass 2 with Claude Vision for scanned/image-based documents. Both passes produce word-level bounding boxes.
- **`extract-pdf.ts`** — Pass 1 implementation. Uses `pdfjs-dist` `getPage().getTextContent()` to extract text items with their `transform` matrix (x, y, width, height). Converts `pdfjs-dist` coordinate space (bottom-left origin) to normalized 0-1 bounding boxes (top-left origin) relative to page dimensions. Exports `extractPdfStructured(fileBuffer: Buffer): Promise<PageText[]>`.
- **`extract-vision.ts`** — Pass 2 implementation (OCR fallback). Converts PDF pages to PNG images using `pdfjs-dist` canvas rendering (or accepts image uploads directly). Sends each page image to Claude Vision with a prompt requesting structured text extraction with approximate word positions. Maps Vision response back to bounding box coordinates using known image dimensions. Exports `extractViaVision(pages: Buffer[], pageDimensions: { width: number; height: number }[]): Promise<PageText[]>`.
- **`scrub.ts`** — PII scrubbing orchestrator. Exports `scrubPII(fullText: string, pageTexts: PageText[]): Promise<PIIScrubResult>`. Calls the Presidio sidecar, receives entity detections, applies the redaction rules (placeholder patterns per entity type), builds the `piiMap`, and adjusts character offsets in `pageTexts` to account for placeholder length differences.
- **`presidio-client.ts`** — HTTP client for the Presidio sidecar. Exports `analyzeText(text: string): Promise<PresidioEntity[]>` and `anonymizeText(text: string, entities: PresidioEntity[]): Promise<string>`. Handles connection errors with retry (3 attempts, 1s backoff). If Presidio is unreachable after retries, throws a typed `L1_PII_SERVICE_UNAVAILABLE` error — the pipeline must NOT proceed without PII scrubbing.
- **`redaction-rules.ts`** — Deterministic placeholder generation. Exports `generatePlaceholder(entityType: PIIEntityType, originalValue: string, instanceIndex: number): string`. Implements the redaction pattern table (e.g., `PERSON_NAME` → `[PERSON_1]`, `BANK_ACCOUNT` → `[ACCOUNT_***5432]`). Must be pure function — same inputs always produce same outputs (idempotency).
- **`encryption.ts`** — PII map encryption/decryption. Exports `encryptPIIMap(piiMap: Record<string, string>): Buffer` and `decryptPIIMap(encrypted: Buffer): Record<string, string>`. Uses AES-256-GCM with the `PII_ENCRYPTION_KEY` env var. The IV is randomly generated per encryption and prepended to the ciphertext.
- **`offset-tracker.ts`** — Character offset adjustment utility. When PII placeholders are shorter or longer than the original text, all downstream character offsets shift. This module exports `adjustOffsets(originalOffsets: number[], replacements: { start: number; end: number; replacementLength: number }[]): number[]`. Used to keep `pageTexts` word positions accurate after scrubbing.
- **`storage.ts`** — Object storage interface. Exports `storeDocument(auditId: string, fileBuffer: Buffer, mimeType: string): Promise<string>` (returns blob URL) and `getDocumentUrl(auditId: string): Promise<string>` (returns time-limited pre-signed URL). Enforces AES-256 encryption at rest and 30-day TTL.
- **`index.ts`** — Public API for the module. Exports the two functions other modules may call: `validateAndIngest(req: UploadRequest): Promise<{ auditId: string; state: AgentState }>` (the full pipeline) and `getProcessedState(auditId: string): Promise<AgentState | null>` (retrieval for re-analysis). This is the only file other modules should import from.
- **`mock.ts`** — Mock implementations for testing and parallel frontend development. Exports `mockIngest(fileName: string): Promise<{ auditId: string; state: AgentState }>` that returns realistic fake scrubbed text with PII placeholders already applied. Simulates 1-2s of processing delay.

## Key Logic

### File Validation (magic bytes)
```typescript
const MAGIC_BYTES: Record<string, number[]> = {
  "application/pdf": [0x25, 0x50, 0x44, 0x46],           // %PDF
  "image/png":       [0x89, 0x50, 0x4E, 0x47],           // .PNG
  "image/jpeg":      [0xFF, 0xD8, 0xFF],                  // ÿØÿ
  "image/webp":      [0x52, 0x49, 0x46, 0x46],           // RIFF (then check for WEBP at offset 8)
};

// Reject if declared MIME doesn't match magic bytes
```

### Two-Pass Extraction Decision
```typescript
async function extractText(fileBuffer: Buffer, mimeType: string): Promise<PageText[]> {
  if (mimeType !== "application/pdf") {
    // Image upload — go straight to Vision (Pass 2)
    return extractViaVision([fileBuffer], [getDimensions(fileBuffer)]);
  }

  // Pass 1: structured PDF extraction
  const structured = await extractPdfStructured(fileBuffer);
  const totalChars = structured.reduce((sum, p) => sum + p.text.length, 0);

  if (totalChars >= 200) {
    return structured; // Good enough — structured text with positions
  }

  // Pass 2: scanned PDF — fall back to Vision OCR
  const pageImages = await renderPdfToImages(fileBuffer);
  return extractViaVision(pageImages.buffers, pageImages.dimensions);
}
```

### PII Scrubbing Flow
```typescript
async function scrubPII(fullText: string, pageTexts: PageText[]): Promise<PIIScrubResult> {
  // 1. Send full text to Presidio
  const entities = await analyzeText(fullText);

  // 2. Sort entities by start offset DESCENDING (replace from end to avoid offset drift)
  const sorted = entities.sort((a, b) => b.start - a.start);

  // 3. Build piiMap and scrubbed text
  const piiMap: Record<string, string> = {};
  let scrubbled = fullText;
  const replacements: Replacement[] = [];

  for (const [i, entity] of sorted.entries()) {
    const original = fullText.slice(entity.start, entity.end);
    const placeholder = generatePlaceholder(entity.entityType, original, i);
    piiMap[placeholder] = original;
    scrubbled = scrubbled.slice(0, entity.start) + placeholder + scrubbled.slice(entity.end);
    replacements.push({ start: entity.start, end: entity.end, replacementLength: placeholder.length });
  }

  // 4. Adjust pageTexts word offsets to match scrubbed text
  const adjustedPageTexts = adjustPageTextOffsets(pageTexts, replacements);

  return { scrubbledText: scrubbled, piiMap, entities: /* ... */, totalRedacted: sorted.length };
}
```

### Offset Adjustment Logic
When a PII entity "John Smith" (10 chars) at offset 500 is replaced with "[PERSON_1]" (10 chars), downstream offsets stay the same. But when "123-45-6789" (11 chars) becomes "[SSN_REDACTED]" (14 chars), every offset after position 500 shifts by +3. The `offset-tracker.ts` handles this by processing replacements in reverse order and accumulating the delta.

### Upload Constraints
```typescript
const UPLOAD_CONSTRAINTS = {
  maxFileSizeMB: 25,
  allowedMimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const,
  maxPageCount: 100,
  minTextLength: 200,
} as const;
```

## Constraints

- **NEVER send unscrubbed text to any module outside of `lib/ingestion`.** The `scrubbledDocumentText` on `AgentState` is the only text that leaves this module. Raw text exists only within this module's function scope.
- **NEVER log PII values.** Not in console.log, not in error messages, not in warnings. If debugging PII scrubbing, log entity types and offsets only, never the original values.
- **NEVER include `piiMap` in any return type exposed to other modules.** The `piiMap` goes to `encryption.ts` → PostgreSQL `PIIRecord` table and nowhere else.
- **NEVER skip PII scrubbing.** If Presidio is down, the pipeline MUST fail with `L1_PII_SERVICE_UNAVAILABLE`. There is no fallback. This is not a degradable step.
- **NEVER trust file extensions.** Always validate via magic bytes.
- **The Vision OCR fallback (Pass 2) MUST still produce `wordPositions` bounding boxes.** The Citation Engine depends on positional data from every extraction path. If Vision cannot provide precise positions, estimate them based on text line positions within the page image dimensions and flag the reduced precision with an `AuditWarning`.
- **`index.ts` is the only public export.** Other modules import `validateAndIngest` and `getProcessedState` from `lib/ingestion` — nothing else.
- **Do not import from `lib/agents`, `lib/analysis`, `lib/citations`, or `lib/benchmarks`.** This module has zero downstream dependencies in the application layer.
