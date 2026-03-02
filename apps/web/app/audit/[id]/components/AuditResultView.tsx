"use client";

import React from "react";
import Link from "next/link";
import { ContractAudit } from "@auditsimple/types";
import { CostOfLoyaltyCard } from "./CostOfLoyaltyCard";
import { RiskScoreGauge } from "./RiskScoreGauge";
import { ReasoningTree } from "./ReasoningTree";
import { DocumentViewer } from "./DocumentViewer";
import { DecisionInterface } from "./DecisionInterface";
import { useClauseSelection } from "../hooks/useClauseSelection";

interface AuditResultViewProps {
    audit: ContractAudit;
    documentViewUrl: string;
}

export function AuditResultView({ audit, documentViewUrl }: AuditResultViewProps) {
    const { selectedClause, selectClause } = useClauseSelection();

    // If there are critical pipeline warnings (e.g., stale benchmarks), 
    // we would show a banner at the top.
    const criticalWarnings = audit.warnings?.filter(w => !w.recoverable) || [];

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">

            {/* Back to dashboard */}
            <div className="mb-6">
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors group"
                >
                    <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Analyze another document
                </Link>
            </div>

            {/* Warning Banner */}
            {criticalWarnings.length > 0 && (
                <div className="mb-8 bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-md">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-amber-800">
                                Notice regarding optimal analysis
                            </h3>
                            <div className="mt-2 text-sm text-amber-700">
                                <ul className="list-disc pl-5 space-y-1">
                                    {criticalWarnings.map((w, i) => <li key={i}>{w.message}</li>)}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Grid: Left Panel (Analysis) and Right Panel (Document) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 xl:gap-12">
                {/* Left Panel */}
                <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <CostOfLoyaltyCard costOfLoyalty={audit.costOfLoyalty} />
                        <RiskScoreGauge score={audit.riskScore} />
                    </div>

                    <ReasoningTree
                        clauses={audit.clauses}
                        issues={audit.issues}
                        selectedClauseId={selectedClause?.clauseId ?? null}
                        onClauseSelect={selectClause}
                    />
                </div>

                {/* Right Panel */}
                <div className="sticky top-6 hidden lg:block h-[calc(100vh-48px)]">
                    <DocumentViewer
                        documentUrl={documentViewUrl}
                        activeClause={selectedClause}
                    />
                </div>
            </div>

            {/* Full width: decision handoff */}
            <div className="col-span-full">
                <DecisionInterface audit={audit} />
            </div>

            {/* Mobile Drawer (visible only on small screens) */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] p-4">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-slate-800">Document Viewer</span>
                    <span className="text-xs text-slate-500">Tap a citation to view source</span>
                </div>
                <div className="h-64 overflow-hidden rounded border border-slate-200">
                    <DocumentViewer
                        documentUrl={documentViewUrl}
                        activeClause={selectedClause}
                    />
                </div>
            </div>
        </div>
    );
}
