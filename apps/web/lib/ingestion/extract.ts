// ============================================================
// apps/web/lib/ingestion/extract.ts
// ============================================================
// Two-pass text extraction orchestrator.
//
// Pass 1 (pdfjs-dist):   Structured extraction for digital/text PDFs.
// Pass 2 (Claude Vision): OCR fallback for scanned PDFs and all image uploads.
//
// Decision logic (from SPEC):
//   - Non-PDF → always Pass 2 (image upload, no structured text to extract)
//   - PDF and totalChars >= 200 → Pass 1 result is sufficient
//   - PDF and totalChars < 200  → scanned/image-based → render pages → Pass 2
//
// Exports:
//   extractText(fileBuffer, mimeType, warnings?): Promise<PageText[]>
//   renderPdfToImages(fileBuffer):                Promise<RenderResult>
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import type { AuditWarning } from "@auditsimple/types";
import { extractPdfStructured, type PageText } from "./extract-pdf";
import {
    extractViaVision,
    type PageDimension,
} from "./extract-vision";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { PageText };

export interface RenderResult {
    buffers: Buffer[];
    dimensions: PageDimension[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum character count from Pass 1 before we trust the result */
const MIN_TEXT_LENGTH = 200;

/**
 * DPI scale for PDF-to-image rendering.
 * 2.0 gives 144 DPI (good OCR quality without being too large for Vision).
 */
const PDF_RENDER_SCALE = 2.0;

// ---------------------------------------------------------------------------
// PDF → Image rendering
// ---------------------------------------------------------------------------

/**
 * Renders each page of a PDF to a PNG Buffer using pdfjs-dist canvas rendering.
 * This is used when Pass 1 indicates a scanned document (low text yield).
 *
 * In a Node.js/Next.js server environment, `canvas` (node-canvas) must be
 * installed. pdfjs-dist uses it when `globalThis.document` is not available.
 *
 * @param fileBuffer - Raw PDF bytes.
 * @returns Array of PNG buffers and their pixel dimensions, one per page.
 */
export async function renderPdfToImages(
    fileBuffer: Buffer
): Promise<RenderResult> {
    // Dynamically import — avoids issues when canvas is not installed
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "";

    // canvas is an optional peer dependency; import will throw a clear error
    // if not installed, which is better than a silent fallback.
    const canvasModule = await import("canvas");
    const { createCanvas } = canvasModule;

    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(fileBuffer),
        disableFontFace: true,
        verbosity: 0,
    });

    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    const buffers: Buffer[] = [];
    const dimensions: PageDimension[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });

        const canvas = createCanvas(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height)
        );
        const context = canvas.getContext("2d");

        await page.render({
            canvasContext: context as unknown as CanvasRenderingContext2D,
            viewport,
        }).promise;

        buffers.push(canvas.toBuffer("image/png"));
        dimensions.push({
            width: Math.ceil(viewport.width),
            height: Math.ceil(viewport.height),
        });

        page.cleanup();
    }

    pdfDoc.cleanup?.();

    return { buffers, dimensions };
}

// ---------------------------------------------------------------------------
// Image dimension detection (for direct image uploads)
// ---------------------------------------------------------------------------

/**
 * Reads the pixel dimensions of an image buffer (PNG, JPEG, or WebP).
 * Uses the image header bytes — no external dependency needed.
 */
function getDimensions(imageBuffer: Buffer): PageDimension {
    // PNG: width at bytes 16-19, height at bytes 20-23
    if (
        imageBuffer[0] === 0x89 &&
        imageBuffer[1] === 0x50 &&
        imageBuffer[2] === 0x4e &&
        imageBuffer[3] === 0x47
    ) {
        const width = imageBuffer.readUInt32BE(16);
        const height = imageBuffer.readUInt32BE(20);
        return { width, height };
    }

    // JPEG: scan for SOF marker (0xFF 0xC0 or 0xFF 0xC2)
    if (imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8) {
        let offset = 2;
        while (offset < imageBuffer.length - 8) {
            if (imageBuffer[offset] !== 0xff) break;
            const marker = imageBuffer[offset + 1]!;
            const segLen = imageBuffer.readUInt16BE(offset + 2);
            if (marker === 0xc0 || marker === 0xc2) {
                const height = imageBuffer.readUInt16BE(offset + 5);
                const width = imageBuffer.readUInt16BE(offset + 7);
                return { width, height };
            }
            offset += 2 + segLen;
        }
    }

    // WebP: width at bytes 24-25 (little-endian), height at 26-27
    if (
        imageBuffer[0] === 0x52 &&
        imageBuffer[1] === 0x49 &&
        imageBuffer.length >= 30
    ) {
        const width = imageBuffer.readUInt16LE(24) + 1;
        const height = imageBuffer.readUInt16LE(26) + 1;
        return { width, height };
    }

    // Fallback — use a standard A4 equivalent in pixels at 144 DPI
    console.warn(
        "[extract] Could not determine image dimensions from header bytes. Using default 1240x1754."
    );
    return { width: 1240, height: 1754 };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Orchestrates the two-pass text extraction strategy.
 *
 * @param fileBuffer - Raw file bytes (PDF or image).
 * @param mimeType   - Declared MIME type (already validated via magic bytes).
 * @param warnings   - Mutable array to collect non-fatal AuditWarnings.
 * @returns Array of PageText objects, one per page.
 */
export async function extractText(
    fileBuffer: Buffer,
    mimeType: string,
    warnings: AuditWarning[] = []
): Promise<PageText[]> {
    // Non-PDF image upload → skip straight to Vision (Pass 2)
    if (mimeType !== "application/pdf") {
        console.info(
            `[extract] Non-PDF upload (${mimeType}) — using Vision (Pass 2) directly.`
        );
        const dimensions = getDimensions(fileBuffer);
        return extractViaVision([fileBuffer], [dimensions], warnings);
    }

    // Pass 1: structured PDF extraction
    console.info("[extract] Pass 1: attempting pdfjs-dist structured extraction.");
    const structured = await extractPdfStructured(fileBuffer);
    const totalChars = structured.reduce((sum, p) => sum + p.text.length, 0);

    if (totalChars >= MIN_TEXT_LENGTH) {
        console.info(
            `[extract] Pass 1 succeeded — ${totalChars} chars extracted across ${structured.length} page(s).`
        );
        return structured;
    }

    // Pass 2: scanned/image-based PDF — render pages to PNG and run Vision OCR
    console.info(
        `[extract] Pass 1 yielded only ${totalChars} chars (< ${MIN_TEXT_LENGTH}). ` +
        "Falling back to Vision OCR (Pass 2)."
    );

    warnings.push({
        code: "STRUCTURED_EXTRACTION_LOW_YIELD",
        message:
            `PDF text extraction yielded only ${totalChars} characters. ` +
            "This appears to be a scanned or image-based PDF. Falling back to Claude Vision OCR.",
        recoverable: true,
        stage: "UPLOADING" as AuditWarning["stage"],
    });

    const pageImages = await renderPdfToImages(fileBuffer);
    return extractViaVision(
        pageImages.buffers,
        pageImages.dimensions,
        warnings
    );
}
