"use client";

import React from "react";
import { AuditWarning } from "@auditsimple/types";
import { useRouter } from "next/navigation";

interface ErrorViewProps {
    auditId: string;
    warnings: AuditWarning[];
}

export function ErrorView({ auditId, warnings }: ErrorViewProps) {
    const router = useRouter();

    return (
        <div className="max-w-2xl mx-auto mt-20 px-6 animate-fade-in text-center">
            <div className="bg-white border border-rose-200 rounded-xl p-8 shadow-sm">
                <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>

                <h1 className="text-3xl font-serif text-slate-900 tracking-tight mb-4">
                    Analysis Failed
                </h1>

                <p className="text-slate-600 mb-8 max-w-md mx-auto">
                    We encountered an issue while processing your document. Our system could not complete the audit pipeline.
                </p>

                {warnings.length > 0 && (
                    <div className="mb-8 text-left bg-rose-50 rounded-lg p-4 border border-rose-100">
                        <h3 className="text-sm font-bold text-rose-800 uppercase tracking-widest mb-3">
                            Error Profile
                        </h3>
                        <ul className="space-y-2">
                            {warnings.map((warning, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm text-rose-700">
                                    <span className="mt-0.5">•</span>
                                    <span>{warning.message} <span className="opacity-70 text-xs ml-1">({warning.code})</span></span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="space-y-4">
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="px-6 py-3 rounded-md bg-slate-800 text-white font-medium hover:bg-slate-900 transition-all focus:outline-none focus:ring-2 focus:ring-slate-400 shadow-sm w-full sm:w-auto"
                    >
                        Try Again
                    </button>
                    <div className="text-xs text-slate-400 uppercase tracking-wider">
                        Diagnostic ID: {auditId}
                    </div>
                </div>
            </div>
        </div>
    );
}
