// ============================================================
// apps/web/lib/citations/render-page.ts
// ============================================================
// Renders a single stored document page to an image Buffer for
// Tier 3 citation re-extraction.
// ============================================================

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { AuditWarning } from "@auditsimple/types";
import { AuditStatus } from "@auditsimple/types";

const PDF_RENDER_SCALE = 1.75;
const LOCAL_UPLOADS_DIR = path.join(process.cwd(), "uploads");

type RenderedPageResult = {
    image: Buffer | null;
    mediaType: "image/png" | "image/jpeg" | "image/webp" | null;
    warning?: AuditWarning;
};

function buildWarning(code: string, message: string): AuditWarning {
    return {
        code,
        message,
        recoverable: true,
        stage: AuditStatus.CITING,
    };
}

function detectMediaTypeFromExtension(ext: string): "image/png" | "image/jpeg" | "image/webp" | null {
    switch (ext.toLowerCase()) {
        case ".png":
            return "image/png";
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".webp":
            return "image/webp";
        default:
            return null;
    }
}

function findLocalDocumentPath(auditId: string): string | null {
    const auditDir = path.join(LOCAL_UPLOADS_DIR, auditId);
    if (!fs.existsSync(auditDir)) {
        return null;
    }

    const files = fs.readdirSync(auditDir);
    const preferredPrefix = `${auditId}.`;
    const matching = files.find((file) => file.startsWith(preferredPrefix));
    if (!matching) {
        return null;
    }

    return path.join(auditDir, matching);
}

async function renderPdfPage(filePath: string, pageNumber: number): Promise<RenderedPageResult> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
        path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ).href;

    const canvasModule = await import("canvas");
    const { createCanvas } = canvasModule;
    const fileBuffer = fs.readFileSync(filePath);

    const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(fileBuffer),
        disableFontFace: true,
        verbosity: 0,
    });

    const pdfDoc = await loadingTask.promise;

    if (pageNumber < 1 || pageNumber > pdfDoc.numPages) {
        pdfDoc.cleanup?.();
        return {
            image: null,
            mediaType: null,
            warning: buildWarning(
                "L3_CITE_PAGE_OUT_OF_RANGE",
                `Citation requested page ${pageNumber}, but the document only has ${pdfDoc.numPages} page(s).`,
            ),
        };
    }

    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");

    await page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
    }).promise;

    const image = canvas.toBuffer("image/png");
    page.cleanup();
    pdfDoc.cleanup?.();

    return { image, mediaType: "image/png" };
}

async function renderImagePage(filePath: string, pageNumber: number): Promise<RenderedPageResult> {
    if (pageNumber !== 1) {
        return {
            image: null,
            mediaType: null,
            warning: buildWarning(
                "L3_CITE_PAGE_OUT_OF_RANGE",
                `Citation requested page ${pageNumber}, but image uploads expose only page 1.`,
            ),
        };
    }

    const ext = path.extname(filePath);
    const mediaType = detectMediaTypeFromExtension(ext);
    if (!mediaType) {
        return {
            image: null,
            mediaType: null,
            warning: buildWarning(
                "L3_CITE_RENDER_PAGE_FAILED",
                `Unsupported local image type "${ext}" for citation rendering.`,
            ),
        };
    }

    return {
        image: fs.readFileSync(filePath),
        mediaType,
    };
}

export async function renderStoredPageToImage(
    auditId: string,
    pageNumber: number,
): Promise<RenderedPageResult> {
    const filePath = findLocalDocumentPath(auditId);
    if (!filePath) {
        return {
            image: null,
            mediaType: null,
            warning: buildWarning(
                "L3_CITE_RENDER_PAGE_FAILED",
                `Could not find a locally stored source document for audit ${auditId}.`,
            ),
        };
    }

    try {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === ".pdf") {
            return await renderPdfPage(filePath, pageNumber);
        }
        return await renderImagePage(filePath, pageNumber);
    } catch (err) {
        return {
            image: null,
            mediaType: null,
            warning: buildWarning(
                "L3_CITE_RENDER_PAGE_FAILED",
                `Failed to render page ${pageNumber} for citation verification: ${err instanceof Error ? err.message : String(err)}`,
            ),
        };
    }
}
