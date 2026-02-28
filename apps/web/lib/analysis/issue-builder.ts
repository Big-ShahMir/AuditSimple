// ============================================================
// apps/web/lib/analysis/issue-builder.ts
// ============================================================
// Factory for constructing AuditIssue objects from structured inputs.
// Generates title, description, and detailedAnalysis strings
// from clause + benchmark data without calling the LLM.
// No async, no I/O, no side effects.
// ============================================================

import {
    AuditIssue,
    ClauseBenchmark,
    ExtractedClause,
    SeverityLevel,
} from "@auditsimple/types";

// ---- Helpers -------------------------------------------------------------------

/**
 * Formats a numeric CAD amount for display (rounded to nearest dollar).
 * e.g. 1234.56 → "$1,235 CAD"
 */
function formatCAD(amount: number): string {
    return `$${Math.round(Math.abs(amount)).toLocaleString("en-CA")} CAD`;
}

/**
 * Formats a numeric value with its unit, falling back gracefully.
 * e.g. (4.99, "percent") → "4.99%"   (450, "CAD") → "$450 CAD"
 */
function formatValue(value: number, unit: string | null): string {
    if (unit === "percent") return `${value}%`;
    if (unit === "CAD") return formatCAD(value);
    if (unit !== null) return `${value} ${unit}`;
    return String(value);
}

// ---- Public API ----------------------------------------------------------------

/**
 * Builds a short, human-readable issue headline.
 *
 * @param clause    The extracted clause that triggered the issue
 * @param direction "FAVORABLE" | "UNFAVORABLE" | "NEUTRAL"
 */
export function buildIssueTitle(
    clause: ExtractedClause,
    direction: string,
): string {
    const readableLabel = clause.label
        .replace(/_/g, " ")
        .replace(/\b\w/g, (ch) => ch.toUpperCase());

    if (direction === "UNFAVORABLE") return `Above-Market ${readableLabel}`;
    if (direction === "FAVORABLE") return `Below-Market ${readableLabel} (In Your Favour)`;
    return `${readableLabel} — Review Recommended`;
}

/**
 * Builds a 2-3 sentence plain-language description of the issue.
 *
 * @param clause    The extracted clause
 * @param benchmark Benchmark comparison data for this clause
 */
export function buildIssueDescription(
    clause: ExtractedClause,
    benchmark: ClauseBenchmark,
): string {
    const contractFormatted = formatValue(benchmark.contractValue, benchmark.contractUnit);
    const benchmarkFormatted = formatValue(benchmark.benchmark.value, benchmark.benchmark.unit);
    const deltaFormatted = formatValue(Math.abs(benchmark.delta), benchmark.contractUnit);
    const source = benchmark.benchmark.sourceName;

    if (benchmark.direction === "UNFAVORABLE") {
        return (
            `Your contract's ${clause.label.replace(/_/g, " ")} is ${contractFormatted}, ` +
            `compared to the market benchmark of ${benchmarkFormatted} (${source}). ` +
            `This is ${deltaFormatted} above market, which may result in higher costs over the life of the contract.`
        );
    }

    if (benchmark.direction === "FAVORABLE") {
        return (
            `Your contract's ${clause.label.replace(/_/g, " ")} is ${contractFormatted}, ` +
            `which is ${deltaFormatted} below the market benchmark of ${benchmarkFormatted} (${source}). ` +
            `This term is in your favour.`
        );
    }

    return (
        `Your contract's ${clause.label.replace(/_/g, " ")} is ${contractFormatted}, ` +
        `in line with the market benchmark of ${benchmarkFormatted} (${source}).`
    );
}

/**
 * Assembles a complete AuditIssue from a clause, its benchmark comparison,
 * and a pre-computed severity level.
 *
 * The issueId is deterministically derived from the clauseId so the same
 * clause always maps to the same issue without a random UUID.
 */
export function buildAuditIssue(
    clause: ExtractedClause,
    benchmark: ClauseBenchmark,
    severity: SeverityLevel,
): AuditIssue {
    const direction = benchmark.direction;
    const title = buildIssueTitle(clause, direction);
    const description = buildIssueDescription(clause, benchmark);

    const detailedAnalysis =
        `${clause.plainLanguageSummary} ` +
        `The clause was extracted from page ${clause.source.pageNumber} of the document ` +
        `with ${Math.round(clause.extractionConfidence * 100)}% extraction confidence. ` +
        `Benchmark data sourced from ${benchmark.benchmark.sourceName} ` +
        `(as of ${benchmark.benchmark.asOfDate}). ` +
        (benchmark.benchmark.referenceUrl
            ? `Reference: ${benchmark.benchmark.referenceUrl}.`
            : "No public reference URL available.");

    // Deterministic issueId — same clause always produces the same issue key
    const issueId = `issue_${clause.clauseId}`;

    // Tags for filtering: always include category and severity; add directional tag
    const tags: string[] = [
        clause.category,
        severity.toLowerCase(),
        direction.toLowerCase(),
        clause.label,
    ];

    // estimatedLifetimeCost: use projectedCostImpact from benchmark for UNFAVORABLE issues
    const estimatedLifetimeCost =
        direction === "UNFAVORABLE" && benchmark.projectedCostImpact > 0
            ? Math.round(benchmark.projectedCostImpact)
            : null;

    return {
        issueId,
        severity,
        title,
        description,
        detailedAnalysis,
        relatedClauses: [clause],
        benchmarkComparison: benchmark,
        estimatedLifetimeCost,
        tags,
        confidence: clause.extractionConfidence,
    };
}
