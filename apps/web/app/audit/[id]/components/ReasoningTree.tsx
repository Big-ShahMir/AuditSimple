import React, { useMemo } from "react";
import { ExtractedClause, AuditIssue, SeverityLevel } from "@auditsimple/types";
import { CategoryNode } from "./CategoryNode";
import { ClauseLeaf } from "./ClauseLeaf";

interface ReasoningTreeProps {
    clauses: ExtractedClause[];
    issues: AuditIssue[];
    selectedClauseId: string | null;
    onClauseSelect: (clause: ExtractedClause) => void;
}

// Helper to determine the worst severity in a group
const severityRank: Record<SeverityLevel, number> = {
    [SeverityLevel.INFO]: 0,
    [SeverityLevel.LOW]: 1,
    [SeverityLevel.MEDIUM]: 2,
    [SeverityLevel.HIGH]: 3,
    [SeverityLevel.CRITICAL]: 4,
};

export function ReasoningTree({
    clauses,
    issues,
    selectedClauseId,
    onClauseSelect,
}: ReasoningTreeProps) {
    // Group clauses by category
    const groupedClauses = useMemo(() => {
        const groups: Record<string, ExtractedClause[]> = {};
        for (const clause of clauses) {
            if (!groups[clause.category]) {
                groups[clause.category] = [];
            }
            groups[clause.category].push(clause);
        }
        return groups;
    }, [clauses]);

    // Create lookup map for issues by related clause ID
    const issueMap = useMemo(() => {
        const map = new Map<string, AuditIssue>();
        for (const issue of issues) {
            for (const related of issue.relatedClauses) {
                // If multiple issues apply to one clause, we take the worst severity
                const existing = map.get(related.clauseId);
                if (!existing || severityRank[issue.severity] > severityRank[existing.severity]) {
                    map.set(related.clauseId, issue);
                }
            }
        }
        return map;
    }, [issues]);

    return (
        <div className="mt-8">
            <h2 className="text-lg font-serif text-slate-800 tracking-tight mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                Reasoning Tree
            </h2>

            <div className="flex flex-col gap-2">
                {Object.entries(groupedClauses).map(([category, categoryClauses]) => {
                    // Find highest severity in this category
                    let highestSeverity: SeverityLevel | null = null;
                    for (const c of categoryClauses) {
                        const issue = issueMap.get(c.clauseId);
                        if (issue) {
                            if (
                                !highestSeverity ||
                                severityRank[issue.severity] > severityRank[highestSeverity]
                            ) {
                                highestSeverity = issue.severity;
                            }
                        }
                    }

                    return (
                        <CategoryNode
                            key={category}
                            category={category}
                            clauseCount={categoryClauses.length}
                            highestSeverity={highestSeverity}
                        >
                            {categoryClauses.map((clause) => (
                                <ClauseLeaf
                                    key={clause.clauseId}
                                    clause={clause}
                                    issue={issueMap.get(clause.clauseId)}
                                    // NOTE: Benchmark property usually would be joined similar to issues,
                                    // assuming we pass it down or find it in issue.benchmarkComparison
                                    benchmark={issueMap.get(clause.clauseId)?.benchmarkComparison ?? undefined}
                                    isSelected={selectedClauseId === clause.clauseId}
                                    onSelect={onClauseSelect}
                                />
                            ))}
                        </CategoryNode>
                    );
                })}

                {clauses.length === 0 && (
                    <div className="text-sm text-slate-500 italic py-8 text-center border border-dashed border-slate-300 rounded-lg">
                        No clauses extracted yet.
                    </div>
                )}
            </div>
        </div>
    );
}
