import React, { useState } from "react";
import { AuditIssue } from "@auditsimple/types";
import { getSeverityStyle } from "../lib/severity-styles";

export function IssueFlag({ issue }: { issue: AuditIssue }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const style = getSeverityStyle(issue.severity);

    return (
        <div className={`mt-3 rounded-md border ${style.borderColor} overflow-hidden bg-white`}>
            <div
                className={`px-3 py-2 flex items-start gap-2 ${style.badgeClass} bg-opacity-30 cursor-pointer`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="text-sm select-none" aria-hidden="true">{style.icon}</span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-white/50 border ${style.borderColor}`}>
                            {style.label}
                        </span>
                        <h4 className="text-sm font-semibold truncate flex-1">{issue.title}</h4>
                    </div>
                    <p className="text-xs mt-1 opacity-90 leading-relaxed">
                        {issue.description}
                    </p>
                </div>
                <button
                    className="text-inherit opacity-60 hover:opacity-100 transition-opacity p-1"
                    aria-label={isExpanded ? "Collapse details" : "Expand details"}
                >
                    <svg
                        className={`w-4 h-4 transform transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </div>

            {isExpanded && issue.detailedAnalysis && (
                <div className="px-4 py-3 bg-white text-sm text-slate-700 leading-relaxed border-t border-slate-100">
                    {issue.detailedAnalysis}
                </div>
            )}
        </div>
    );
}
