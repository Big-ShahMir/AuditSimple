import React from "react";
import { ExtractedClause, AuditIssue, ClauseBenchmark } from "@auditsimple/types";
import { IssueFlag } from "./IssueFlag";
import { BenchmarkBar } from "./BenchmarkBar";
import { CitationLink } from "./CitationLink";

interface ClauseLeafProps {
    clause: ExtractedClause;
    issue?: AuditIssue;
    benchmark?: ClauseBenchmark;
    isSelected: boolean;
    onSelect: (clause: ExtractedClause) => void;
}

export function ClauseLeaf({ clause, issue, benchmark, isSelected, onSelect }: ClauseLeafProps) {
    // Mock logic to determine if a clause is unverified
    // Real implementation might rely on extractionConfidence or a specific warning
    const isUnverified = clause.extractionConfidence < 0.5;

    return (
        <div
            className={`ml-4 pl-4 py-4 border-l-2 transition-colors cursor-pointer hover:bg-slate-50 ${isSelected ? "border-slate-800 bg-slate-50" : "border-slate-200"
                }`}
            onClick={() => onSelect(clause)}
        >
            <div className="flex justify-between items-start gap-4 mb-2">
                <div>
                    <h4 className="text-sm font-semibold text-slate-800 tracking-tight">
                        {clause.label}
                    </h4>
                    <span className="inline-block mt-0.5 px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] uppercase font-bold tracking-wider rounded-sm border border-slate-200">
                        RAW: {clause.rawValue}
                    </span>
                </div>
                <CitationLink
                    pageNumber={clause.source.pageNumber}
                    isUnverified={isUnverified}
                    onClick={() => onSelect(clause)}
                />
            </div>

            <p className="text-sm text-slate-600 leading-relaxed mb-3">
                {clause.plainLanguageSummary}
            </p>

            {benchmark && <BenchmarkBar benchmark={benchmark} />}
            {issue && <IssueFlag issue={issue} />}
        </div>
    );
}
