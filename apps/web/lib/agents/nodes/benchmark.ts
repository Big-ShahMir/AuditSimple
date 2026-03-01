// ============================================================
// apps/web/lib/agents/nodes/benchmark.ts
// ============================================================
// Benchmark comparison node — NO LLM CALL.
//
// For each extracted clause with a numericValue, calls getBenchmarkForClause()
// from lib/benchmarks. Creates AuditIssue objects for UNFAVORABLE deviations.
// Graceful degradation: benchmark lookup failures are warned, never fatal.
// ============================================================

import type { AgentState, ExtractedClause, AuditIssue, AuditWarning } from "@auditsimple/types";
import { AuditStatus, SeverityLevel } from "@auditsimple/types";
import { getBenchmarkForClause } from "@/lib/benchmarks";
import { assignSeverity, buildAuditIssue } from "@/lib/analysis";
import { emitProgress } from "../progress";

// ---------------------------------------------------------------------------
// Severity sort order
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<SeverityLevel, number> = {
    [SeverityLevel.CRITICAL]: 5,
    [SeverityLevel.HIGH]: 4,
    [SeverityLevel.MEDIUM]: 3,
    [SeverityLevel.LOW]: 2,
    [SeverityLevel.INFO]: 1,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a term length (in months) from clauses that have a months unit.
 * Looks for common "term" labels first, then falls back to any clause with unit=months.
 */
function extractTermMonths(clauses: ExtractedClause[]): number | undefined {
    const TERM_LABELS = ["term_length", "amortization_period", "lease_term", "policy_term", "lock_up_period"];
    const termClause = clauses.find(
        (c) => TERM_LABELS.includes(c.label) && c.numericValue !== null && c.unit === "months",
    );
    if (termClause?.numericValue !== null && termClause?.numericValue !== undefined) {
        return termClause.numericValue;
    }
    return undefined;
}

/**
 * Extracts the principal amount from clauses.
 */
function extractPrincipal(clauses: ExtractedClause[]): number | undefined {
    const principalClause = clauses.find(
        (c) => c.label === "principal_amount" && c.numericValue !== null,
    );
    if (principalClause?.numericValue !== null && principalClause?.numericValue !== undefined) {
        return principalClause.numericValue;
    }
    return undefined;
}

// ---------------------------------------------------------------------------
// Node implementation
// ---------------------------------------------------------------------------

export async function benchmarkNode(state: AgentState): Promise<Partial<AgentState>> {
    emitProgress(state, { node: "benchmark" });

    const clauses = state.audit.clauses ?? [];
    const contractType = state.audit.contractType;
    const warnings: AuditWarning[] = [];
    const issues: AuditIssue[] = [];

    if (!contractType) {
        warnings.push({
            code: "BENCHMARK_NO_CONTRACT_TYPE",
            message: "Cannot benchmark without a contract type — benchmark node skipped",
            recoverable: true,
            stage: AuditStatus.BENCHMARKING,
        });
        return {
            currentNode: "benchmark",
            audit: { issues: [], updatedAt: new Date().toISOString() },
            errors: warnings,
        };
    }

    const termMonths = extractTermMonths(clauses);
    const principal = extractPrincipal(clauses);

    // Process each benchmarkable clause
    for (const clause of clauses) {
        if (clause.numericValue === null || clause.numericValue === undefined) {
            // No numeric value — nothing to benchmark
            continue;
        }

        let benchmark;
        try {
            benchmark = await getBenchmarkForClause(clause, contractType, termMonths, principal);
        } catch (err) {
            // Per SPEC: if benchmark lookup fails for a clause, skip with warning — do NOT fail the pipeline
            warnings.push({
                code: "BENCHMARK_LOOKUP_ERROR",
                message: `Benchmark lookup failed for clause "${clause.label}": ${err instanceof Error ? err.message : String(err)}`,
                recoverable: true,
                stage: AuditStatus.BENCHMARKING,
            });
            continue;
        }

        if (!benchmark) {
            // No benchmark available for this category — expected, not an error
            continue;
        }

        // Create an issue for all UNFAVORABLE deviations
        if (benchmark.direction === "UNFAVORABLE") {
            const severity = assignSeverity(
                benchmark.deltaPercent,
                clause.category,
            );

            const issue = buildAuditIssue(clause, benchmark, severity);
            issues.push(issue);
        } else if (benchmark.direction === "FAVORABLE") {
            // FAVORABLE: include as INFO for completeness
            const issue = buildAuditIssue(clause, benchmark, SeverityLevel.INFO);
            issues.push(issue);
        }
        // NEUTRAL: no issue created
    }

    // Sort by severity DESC (CRITICAL first)
    const sortedIssues = [...issues].sort(
        (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
    );

    return {
        currentNode: "benchmark",
        audit: {
            issues: sortedIssues,
            status: AuditStatus.BENCHMARKING,
            updatedAt: new Date().toISOString(),
        },
        errors: warnings,
    };
}
