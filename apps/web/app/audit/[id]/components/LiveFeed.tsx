import React, { useEffect, useRef } from "react";
import { ProgressEvent } from "@auditsimple/types";
import { getSeverityStyle } from "../lib/severity-styles";

export function LiveFeed({ events }: { events: ProgressEvent[] }) {
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new events arrive
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [events]);

    const displayEvents = events.filter(e =>
        e.type === "status_change" ||
        e.type === "clause_found" ||
        e.type === "issue_flagged" ||
        e.type === "error"
    );

    if (displayEvents.length === 0) {
        return (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm italic border border-dashed border-slate-300 rounded-lg">
                Waiting for pipeline to begin...
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="h-80 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3 custom-scrollbar"
        >
            {displayEvents.map((evt, idx) => {
                if (evt.type === "status_change" && evt.message) {
                    return (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-lg shadow-sm animate-fade-in-up">
                            <div className="text-slate-400 bg-slate-50 p-1 rounded-full flex-shrink-0">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                            <span className="text-sm text-slate-600">{evt.message}</span>
                        </div>
                    );
                }

                if (evt.type === "clause_found") {
                    return (
                        <div key={idx} className="flex items-start gap-3 p-3 bg-white border border-slate-100 rounded-lg shadow-sm animate-fade-in-up">
                            <div className="mt-0.5 text-teal-600 bg-teal-50 p-1 rounded-full">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">
                                    Extracted Clause
                                </span>
                                <span className="text-sm font-medium text-slate-800">
                                    {evt.clause.label}
                                </span>
                            </div>
                        </div>
                    );
                }

                if (evt.type === "issue_flagged") {
                    const style = getSeverityStyle(evt.issue.severity);
                    return (
                        <div key={idx} className={`flex items-start gap-3 p-3 bg-white border ${style.borderColor} rounded-lg shadow-sm animate-fade-in-up`}>
                            <div className="mt-0.5 text-xl" aria-hidden="true">{style.icon}</div>
                            <div className="w-full">
                                <div className="flex items-center justify-between w-full mb-1">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                        Flagged Issue
                                    </span>
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-white/50 border ${style.borderColor}`}>
                                        {style.label}
                                    </span>
                                </div>
                                <span className="text-sm font-medium text-slate-800">
                                    {evt.issue.title}
                                </span>
                            </div>
                        </div>
                    );
                }

                if (evt.type === "error") {
                    return (
                        <div key={idx} className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-200 rounded-lg animate-fade-in-up">
                            <div className="mt-0.5 text-rose-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div>
                                <span className="text-xs font-bold text-rose-700 uppercase tracking-widest block mb-1">
                                    Warning
                                </span>
                                <span className="text-sm font-medium text-rose-900">
                                    {evt.warning.message}
                                </span>
                            </div>
                        </div>
                    );
                }

                return null; // fallback
            })}
        </div>
    );
}
