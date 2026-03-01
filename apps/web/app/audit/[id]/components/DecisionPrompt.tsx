"use client";

import React from "react";

interface DecisionPromptProps {
    auditId: string;
}

export function DecisionPrompt({ auditId }: DecisionPromptProps) {
    const handleDownload = async () => {
        try {
            // In a real implementation this would fetch from /api/audit/[id]/report
            // and trigger a Blob download.
            window.open(`/api/audit/${auditId}/report`, "_blank");
        } catch (error) {
            console.error("Failed to download report", error);
        }
    };

    const handleTalkToAdvisor = () => {
        // Arbitrary link for the demo
        window.open("https://www.wealthsimple.com/en-ca", "_blank");
    };

    return (
        <div className="py-12 flex flex-col items-center justify-center text-center">
            <h2 className="text-3xl font-serif text-slate-900 tracking-tight mb-4">
                Review Complete — The Decision Is Yours.
            </h2>
            <p className="text-base text-slate-600 max-w-2xl mb-10 leading-relaxed">
                We have presented the data, illuminated the hidden terms, and projected the costs.
                The choice of what to do next belongs entirely to you.
            </p>

            {/* Neutral buttons. NO red/green. NO nudge. */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center w-full max-w-md">
                <button
                    onClick={handleDownload}
                    className="w-full sm:w-auto px-6 py-3 rounded-md bg-white border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 transition-all focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                    Download Report (PDF)
                </button>
                <button
                    onClick={handleTalkToAdvisor}
                    className="w-full sm:w-auto px-6 py-3 rounded-md bg-slate-800 border border-transparent text-white font-medium hover:bg-slate-900 transition-all focus:outline-none focus:ring-2 focus:ring-slate-400 shadow-sm"
                >
                    Talk to an Advisor
                </button>
            </div>
        </div>
    );
}
