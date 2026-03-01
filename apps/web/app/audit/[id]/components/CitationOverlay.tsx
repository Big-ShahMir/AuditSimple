import React from "react";
import { SourceLocation } from "@auditsimple/types";

interface CitationOverlayProps {
    source: SourceLocation;
    canvasWidth: number;
    canvasHeight: number;
    summaryText: string;
    isUnverified?: boolean;
}

export function CitationOverlay({
    source,
    canvasWidth,
    canvasHeight,
    summaryText,
    isUnverified,
}: CitationOverlayProps) {
    const { boundingBox, verbatimText } = source;
    const { topLeftX, topLeftY, bottomRightX, bottomRightY } = boundingBox;

    // Convert 0-1 percentages to pixel values
    const top = topLeftY * canvasHeight;
    const left = topLeftX * canvasWidth;
    const width = (bottomRightX - topLeftX) * canvasWidth;
    const height = (bottomRightY - topLeftY) * canvasHeight;

    // Render differently if unverified
    const unverifiedClasses = "border-rose-500 bg-rose-200/40 border-dashed animate-pulse";
    const verifiedClasses = "border-amber-400 bg-amber-200/40 border-solid";

    return (
        <div
            className={`absolute z-10 border-2 rounded-sm group cursor-help transition-all ${isUnverified ? unverifiedClasses : verifiedClasses
                }`}
            style={{
                top: `${top}px`,
                left: `${left}px`,
                width: `${width}px`,
                height: `${height}px`,
            }}
        >
            {/* Tooltip on Hover */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-slate-50 text-xs rounded shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                {isUnverified && (
                    <div className="text-rose-400 font-bold mb-1 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Unverified Citation
                    </div>
                )}
                <p className="font-semibold text-amber-200 mb-1 leading-tight">
                    "{verbatimText}"
                </p>
                <p className="opacity-90 leading-relaxed text-slate-300">
                    AI Summary: {summaryText}
                </p>
            </div>

            {isUnverified && (
                <div className="absolute -top-3 -right-3 w-6 h-6 bg-rose-500 rounded-full flex items-center justify-center text-white shadow-md">
                    !
                </div>
            )}
        </div>
    );
}
