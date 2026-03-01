import React from "react";

export function SummaryPanel({ executiveSummary }: { executiveSummary: string }) {
    // Split into paragraphs based on double newlines if they exist
    const paragraphs = executiveSummary.split(/\n\s*\n/).filter(p => p.trim());

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
            <h3 className="text-sm font-medium text-slate-500 tracking-wide uppercase mb-6 border-b border-slate-100 pb-4">
                Executive Summary
            </h3>

            <div className="space-y-4">
                {paragraphs.length > 0 ? (
                    paragraphs.map((para, idx) => (
                        <p key={idx} className="text-base text-slate-700 leading-relaxed max-w-3xl">
                            {para.trim()}
                        </p>
                    ))
                ) : (
                    <p className="text-base text-slate-700 leading-relaxed max-w-3xl">
                        {executiveSummary}
                    </p>
                )}
            </div>
        </div>
    );
}
