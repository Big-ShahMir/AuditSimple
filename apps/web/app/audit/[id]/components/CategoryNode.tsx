import React, { useState } from "react";
import { SeverityLevel } from "@auditsimple/types";
import { getSeverityStyle } from "../lib/severity-styles";

interface CategoryNodeProps {
    category: string;
    clauseCount: number;
    highestSeverity: SeverityLevel | null;
    children: React.ReactNode;
}

export function CategoryNode({
    category,
    clauseCount,
    highestSeverity,
    children,
}: CategoryNodeProps) {
    // Determine if it should be expanded by default based on severity
    // E.g., expand if MEDIUM, HIGH, or CRITICAL
    const defaultExpanded =
        highestSeverity === SeverityLevel.MEDIUM ||
        highestSeverity === SeverityLevel.HIGH ||
        highestSeverity === SeverityLevel.CRITICAL;

    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    // Format category string (e.g., "interest_rate" -> "Interest Rate")
    const formattedCategory = category
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

    const severityStyle = highestSeverity ? getSeverityStyle(highestSeverity) : null;

    return (
        <div className="mb-4 bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-expanded={isExpanded}
            >
                <div className="flex items-center gap-3">
                    <svg
                        className={`w-5 h-5 text-slate-400 transform transition-transform ${isExpanded ? "rotate-90" : ""
                            }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <div className="flex flex-col items-start gap-1">
                        <h3 className="text-base font-semibold text-slate-800 tracking-tight">
                            {formattedCategory}
                        </h3>
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-widest">
                            {clauseCount} {clauseCount === 1 ? "Clause" : "Clauses"}
                        </span>
                    </div>
                </div>

                {severityStyle && (
                    <div
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${severityStyle.borderColor} ${severityStyle.badgeClass} bg-opacity-30`}
                    >
                        <span className="text-xs" aria-hidden="true">{severityStyle.icon}</span>
                        <span className="text-xs font-bold uppercase tracking-wider">
                            {severityStyle.label}
                        </span>
                    </div>
                )}
            </button>

            {isExpanded && (
                <div className="p-4 bg-white border-t border-slate-100 flex flex-col gap-4">
                    {children}
                </div>
            )}
        </div>
    );
}
