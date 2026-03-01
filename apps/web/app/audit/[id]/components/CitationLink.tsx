import React from "react";

interface CitationLinkProps {
    pageNumber: number;
    isUnverified?: boolean;
    onClick: () => void;
}

export function CitationLink({ pageNumber, isUnverified, onClick }: CitationLinkProps) {
    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 ${isUnverified
                    ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-transparent"
                }`}
        >
            {isUnverified ? (
                <span className="group relative flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Unverified Citation
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-slate-50 text-[10px] rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10 whitespace-normal text-center leading-relaxed">
                        Citation could not be verified in source document.
                    </div>
                </span>
            ) : (
                <>
                    <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Page {pageNumber}
                </>
            )}
        </button>
    );
}
