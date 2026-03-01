"use client";

import React from "react";
import { useAuditSSE } from "../hooks/useAuditSSE";
import { ProgressBar } from "./ProgressBar";
import { LiveFeed } from "./LiveFeed";

export function ProgressView({ auditId }: { auditId: string }) {
    const { events, progress, status, isConnected } = useAuditSSE(auditId);

    return (
        <div className="max-w-3xl mx-auto mt-20 px-6 animate-fade-in">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-serif text-slate-900 tracking-tight mb-4">
                    Analyzing Document
                </h1>
                <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
                    Our AI fiduciary is currently scanning your contract for predatory clauses, hidden fees, and unfavorable terms.
                </p>
            </div>

            <div className="mb-10">
                <ProgressBar progress={progress} stage={status} />

                {!isConnected && status !== "COMPLETE" && status !== "FAILED" && (
                    <p className="text-sm text-center text-amber-600 mt-4 animate-pulse">
                        Connection lost. Attempting to reconnect...
                    </p>
                )}
            </div>

            <div className="bg-white border text-center border-slate-200 rounded-xl p-8 shadow-sm">
                <h2 className="text-sm font-medium text-slate-500 tracking-wide uppercase mb-6 border-b border-slate-100 pb-4">
                    Live Analysis Feed
                </h2>
                <div className="text-left">
                    <LiveFeed events={events} />
                </div>
            </div>
        </div>
    );
}
