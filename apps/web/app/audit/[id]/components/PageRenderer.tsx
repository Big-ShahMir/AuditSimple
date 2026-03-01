"use client";

import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { SourceLocation } from "@auditsimple/types";
import { CitationOverlay } from "./CitationOverlay";

// Configure the worker for pdf.js utilizing local worker file rather than external CDN if needed
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PageRendererProps {
    pageNumber: number;
    pdfDoc: pdfjsLib.PDFDocumentProxy | null;
    scale: number;
    activeSource?: SourceLocation;
    activeSummary?: string;
    isUnverified?: boolean;
}

export function PageRenderer({
    pageNumber,
    pdfDoc,
    scale,
    activeSource,
    activeSummary,
    isUnverified,
}: PageRendererProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [isRendered, setIsRendered] = useState(false);

    useEffect(() => {
        let renderTask: pdfjsLib.RenderTask | null = null;
        let isMounted = true;

        async function renderPage() {
            if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

            try {
                const page = await pdfDoc.getPage(pageNumber);

                // Use devicePixelRatio to ensure crisp rendering on high DPI displays
                const pixelRatio = window.devicePixelRatio || 1;
                const viewport = page.getViewport({ scale });

                const canvas = canvasRef.current;
                const context = canvas.getContext("2d");

                if (!context) return;

                // Set display size
                canvas.style.width = `${viewport.width}px`;
                canvas.style.height = `${viewport.height}px`;

                // Set actual size in memory (scaled to account for extra pixel density)
                canvas.width = Math.floor(viewport.width * pixelRatio);
                canvas.height = Math.floor(viewport.height * pixelRatio);

                // Normalize coordinate system to use css pixels
                context.scale(pixelRatio, pixelRatio);

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport,
                };

                renderTask = page.render(renderContext);
                await renderTask.promise;

                if (isMounted) {
                    setDimensions({ width: viewport.width, height: viewport.height });
                    setIsRendered(true);
                }
            } catch (error) {
                if (error instanceof pdfjsLib.RenderingCancelledException) return;
                console.error("Error rendering page", error);
            }
        }

        renderPage();

        return () => {
            isMounted = false;
            if (renderTask) {
                renderTask.cancel();
            }
        };
    }, [pdfDoc, pageNumber, scale]);

    return (
        <div
            ref={containerRef}
            className="relative mb-6 shadow-sm border border-slate-200 inline-block bg-white"
            style={{ minHeight: dimensions.height || 800, minWidth: dimensions.width || 600 }}
        >
            <canvas ref={canvasRef} className="block" />

            {/* Overlay rendered cleanly over the canvas output */}
            {isRendered && activeSource && (
                <CitationOverlay
                    source={activeSource}
                    canvasWidth={dimensions.width}
                    canvasHeight={dimensions.height}
                    summaryText={activeSummary ?? ""}
                    isUnverified={isUnverified}
                />
            )}
        </div>
    );
}
