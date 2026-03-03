// ============================================================
// apps/web/lib/ingestion/extract-pdf.ts
// ============================================================
// Pass 1: Structured text extraction using pdfjs-dist.
// Extracts text items with their transform matrices and converts
// from PDF coordinate space (bottom-left origin, points) to
// normalized 0-1 bounding boxes (top-left origin, relative to
// page dimensions).
//
// Exports:
//   extractPdfStructured(fileBuffer: Buffer): Promise<PageText[]>
// ============================================================

import path from "path";
import { pathToFileURL } from "url";
import type { AgentState } from "@auditsimple/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape matching AgentState["pageTexts"][number] */
export type PageText = AgentState["pageTexts"][number];

// pdfjs-dist ships its own types; we use a lite structural shape here
// so we don't have to worry about the exact import path across versions.
interface PdfTextItem {
    str: string;
    transform: number[]; // [scaleX, skewX, skewY, scaleY, translateX, translateY]
    width: number;
    height: number;
    dir?: string;
}

interface PdfTextMarkedContent {
    type: string;
}

// ---------------------------------------------------------------------------
// pdfjs-dist bootstrap
// ---------------------------------------------------------------------------

// pdfjs-dist requires a worker in browser environments; in Node we use the
// legacy build which includes the worker inline.
async function getPdfJs() {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // pdfjs-dist v4 requires a valid workerSrc — setting it to "" no longer works.
    // In Node.js (Next.js API routes) we point directly to the bundled worker file.
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
        path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
    ).href;
    return pdfjs;
}

// ---------------------------------------------------------------------------
// Coordinate conversion
// ---------------------------------------------------------------------------

/**
 * Converts a PDF text item from PDF coordinate space to a normalized 0-1
 * bounding box in top-left origin space.
 *
 * PDF coordinate system:
 *   - Origin at bottom-left of the page
 *   - y increases upward
 *   - Units are points (1 pt = 1/72 inch)
 *
 * Target coordinate system:
 *   - Origin at top-left
 *   - y increases downward
 *   - All values normalized to [0, 1] by page width/height
 */
function itemToBoundingBox(
    item: PdfTextItem,
    pageWidth: number,
    pageHeight: number
): PageText["wordPositions"][number]["boundingBox"] {
    const [, , , , x, y] = item.transform; // translateX, translateY
    const w = item.width;
    const h = item.height > 0 ? item.height : 12; // fallback for zero-height items

    // Convert from bottom-left to top-left origin
    const topLeftX = x / pageWidth;
    const topLeftY = (pageHeight - y - h) / pageHeight;
    const bottomRightX = (x + w) / pageWidth;
    const bottomRightY = (pageHeight - y) / pageHeight;

    return {
        topLeftX: Math.max(0, Math.min(1, topLeftX)),
        topLeftY: Math.max(0, Math.min(1, topLeftY)),
        bottomRightX: Math.max(0, Math.min(1, bottomRightX)),
        bottomRightY: Math.max(0, Math.min(1, bottomRightY)),
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts text from a PDF buffer using pdfjs-dist.
 * Returns page-by-page text with word-level bounding boxes (normalized 0-1).
 *
 * @param fileBuffer - Raw PDF bytes.
 * @returns Array of PageText objects, one per page.
 */
export async function extractPdfStructured(
    fileBuffer: Buffer
): Promise<PageText[]> {
    const pdfjs = await getPdfJs();

    // Load the PDF document
    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(fileBuffer),
        // Prevent pdfjs from trying to fetch resources
        disableFontFace: true,
        verbosity: 0,
    });

    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const pageTexts: PageText[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const pageWidth = viewport.width;
        const pageHeight = viewport.height;

        const textContent = await page.getTextContent();

        const wordPositions: PageText["wordPositions"] = [];
        let pageText = "";

        for (const item of textContent.items) {
            // Skip marked content items (e.g., begin/end tags)
            if ((item as PdfTextMarkedContent).type !== undefined) continue;

            const textItem = item as PdfTextItem;
            if (!textItem.str || textItem.str.trim() === "") {
                // Still add a space to preserve formatting
                if (textItem.str === " ") pageText += " ";
                continue;
            }

            const boundingBox = itemToBoundingBox(textItem, pageWidth, pageHeight);

            // Split the text item into individual words for word-level positions.
            // pdfjs sometimes returns multi-word items; we split and distribute
            // bounding boxes proportionally.
            const words = textItem.str.split(/(\s+)/);
            let itemCharOffset = pageText.length;

            for (const segment of words) {
                if (segment.trim() !== "") {
                    wordPositions.push({
                        word: segment.trim(),
                        boundingBox,
                        charOffset: itemCharOffset,
                    });
                }
                itemCharOffset += segment.length;
            }

            pageText += textItem.str;

            // Add a space between text items unless the item ends with a newline
            if (!textItem.str.endsWith("\n")) {
                pageText += " ";
            }
        }

        pageTexts.push({
            pageNumber: pageNum,
            text: pageText,
            wordPositions,
        });

        page.cleanup();
    }

    pdfDoc.cleanup?.();

    return pageTexts;
}
