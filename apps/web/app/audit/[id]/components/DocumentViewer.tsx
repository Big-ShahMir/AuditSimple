"use client";

import React, { useEffect, useState, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { ExtractedClause } from "@auditsimple/types";
import { PageRenderer } from "./PageRenderer";

interface DocumentViewerProps {
    documentUrl: string;
    activeClause: ExtractedClause | null;
}

export function DocumentViewer({ documentUrl, activeClause }: DocumentViewerProps) {
    const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [scale, setScale] = useState<number>(1.2);
    const [loading, setLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let loadingTask: pdfjsLib.PDFDocumentLoadingTask;

        async function loadDocument() {
            try {
                setLoading(true);
                const resolvedUrl = documentUrl.startsWith("local://uploads/")
                    ? `/api/local-document?path=${encodeURIComponent(documentUrl)}`
                    : documentUrl;

                loadingTask = pdfjsLib.getDocument(resolvedUrl);
                const doc = await loadingTask.promise;
                setPdfDoc(doc);
                setNumPages(doc.numPages);
            } catch (err) {
                console.error("Failed to load PDF", err);
            } finally {
                setLoading(false);
            }
        }

        loadDocument();

        return () => {
            if (loadingTask) {
                loadingTask.destroy();
            }
        };
    }, [documentUrl]);

    // Scroll to active clause page when it changes
    useEffect(() => {
        if (activeClause && containerRef.current) {
            const pageId = `pdf-page-${activeClause.source.pageNumber}`;
            const element = document.getElementById(pageId);

            if (element) {
                // Smooth scroll within the container container
                const containerOffset = containerRef.current.offsetTop;
                const elementOffset = element.offsetTop;

                containerRef.current.scrollTo({
                    top: elementOffset - containerOffset - 20, // 20px padding
                    behavior: "smooth"
                });
            }
        }
    }, [activeClause]);

    const handleZoomIn = () => setScale(s => Math.min(s + 0.2, 3.0));
    const handleZoomOut = () => setScale(s => Math.max(s - 0.2, 0.5));

    if (loading) {
        return (
            <div className="bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center p-8 h-[600px]">
                <div className="flex flex-col items-center gap-4 text-slate-500">
                    <svg className="animate-spin w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm font-medium">Loading Document...</span>
                </div>
            </div>
        );
    }

    if (!pdfDoc) {
        return (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-8 h-[600px] flex items-center justify-center text-rose-600 text-sm">
                Unable to load document viewer.
            </div>
        );
    }

    // Create array of pages
    const pages = Array.from(new Array(numPages), (el, index) => index + 1);

    return (
        <div className="bg-slate-100 border border-slate-200 rounded-lg overflow-hidden flex flex-col h-[calc(100vh-120px)] lg:h-[800px]">
            {/* Toolbar */}
            <div className="bg-white border-b border-slate-200 px-4 py-2 flex justify-between items-center shadow-sm z-10 sticky top-0">
                <div className="text-xs font-medium text-slate-500">
                    {numPages} {numPages === 1 ? 'Page' : 'Pages'}
                </div>
                <div className="flex items-center gap-1 bg-slate-100 rounded-md p-0.5">
                    <button
                        onClick={handleZoomOut}
                        className="p-1.5 text-slate-600 hover:bg-white rounded hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-300"
                        title="Zoom Out"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                        </svg>
                    </button>
                    <span className="text-[10px] font-medium text-slate-500 w-10 text-center select-none">
                        {Math.round(scale * 100)}%
                    </span>
                    <button
                        onClick={handleZoomIn}
                        className="p-1.5 text-slate-600 hover:bg-white rounded hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-slate-300"
                        title="Zoom In"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Document Scroll View */}
            <div
                ref={containerRef}
                className="flex-1 overflow-auto bg-slate-200/50 p-6 flex flex-col items-center custom-scrollbar"
            >
                {pages.map((pageNum) => (
                    <div key={pageNum} id={`pdf-page-${pageNum}`}>
                        <PageRenderer
                            pageNumber={pageNum}
                            pdfDoc={pdfDoc}
                            scale={scale}
                            activeSource={activeClause?.source.pageNumber === pageNum ? activeClause.source : undefined}
                            activeSummary={activeClause?.source.pageNumber === pageNum ? activeClause.plainLanguageSummary : undefined}
                            isUnverified={activeClause?.source.pageNumber === pageNum ? activeClause.extractionConfidence < 0.5 : undefined}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
