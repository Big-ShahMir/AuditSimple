// ============================================================
// apps/web/app/api/audit/[id]/report/route.tsx
// ============================================================
// GET /api/audit/[id]/report
//
// Generates a downloadable PDF audit report using @react-pdf/renderer.
// Loads the full audit with related clauses and issues from the DB,
// maps them to the ContractAudit interface, and streams the PDF.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: auditId } = await params;

    // ─── 1. Load record with relations ───────────────────────────────────────
    const record = await (prisma as any).audit.findUnique({
        where: { id: auditId },
        include: {
            clauses: true,
            issues: {
                include: { clauses: true },
            },
            piiRecord: true,
        },
    });

    if (!record) {
        return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    if (!record.documentUrl) {
        return NextResponse.json(
            {
                error:
                    "Report is not yet available. The document may still be processing.",
            },
            { status: 202 }
        );
    }

    // ─── 2. Map DB rows → ContractAudit interface shape ──────────────────────
    const clauses = (record.clauses ?? []).map((c: any) => ({
        clauseId: c.id,
        label: c.label,
        category: c.category,
        rawValue: c.rawValue,
        numericValue: c.numericValue ?? null,
        unit: c.unit ?? null,
        plainLanguageSummary: c.plainLanguageSummary,
        source: c.sourceLocation,
        extractionConfidence: c.extractionConfidence,
        verified: c.verified,
    }));

    const issues = (record.issues ?? []).map((issue: any) => ({
        issueId: issue.id,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        detailedAnalysis: issue.detailedAnalysis,
        relatedClauses: (issue.clauses ?? []).map((c: any) => ({
            clauseId: c.id,
            label: c.label,
            category: c.category,
            rawValue: c.rawValue,
            numericValue: c.numericValue ?? null,
            unit: c.unit ?? null,
            plainLanguageSummary: c.plainLanguageSummary,
            source: c.sourceLocation,
            extractionConfidence: c.extractionConfidence,
            verified: c.verified,
        })),
        benchmarkComparison: issue.benchmarkData ?? null,
        estimatedLifetimeCost: issue.estimatedCost ?? null,
        tags: issue.tags ?? [],
        confidence: issue.confidence,
    }));

    const parsedAudit = {
        auditId: record.id,
        status: record.status,
        createdAt: (record.createdAt as Date).toISOString(),
        updatedAt: (record.updatedAt as Date).toISOString(),
        completedAt: record.completedAt
            ? (record.completedAt as Date).toISOString()
            : null,
        contractType: record.contractType ?? null,
        originalFileName: record.originalFileName,
        documentHash: record.documentHash,
        piiSummary: {
            totalRedacted: record.piiRecord?.totalRedacted ?? 0,
            entityTypeCounts: record.piiRecord?.entityCounts ?? {},
        },
        clauses,
        issues,
        costOfLoyalty: record.costOfLoyalty ?? null,
        riskScore: record.riskScore ?? null,
        executiveSummary: record.executiveSummary ?? null,
        warnings: Array.isArray(record.warnings) ? record.warnings : [],
    };

    // ─── 3. Generate + stream PDF ─────────────────────────────────────────────
    try {
        const { renderToStream } = await import("@react-pdf/renderer");
        const { AuditReportPDF } = await import(
            "@/app/audit/[id]/components/AuditReportPDF"
        );

        const stream = await renderToStream(
            <AuditReportPDF audit={parsedAudit as any} />
        );

        // Convert Node.js Readable stream to Web ReadableStream
        const webStream = new ReadableStream({
            start(controller) {
                stream.on("data", (chunk: any) => controller.enqueue(chunk));
                stream.on("end", () => controller.close());
                stream.on("error", (err: any) => controller.error(err));
            },
        });

        return new NextResponse(webStream, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="simplyaudit-report-${auditId}.pdf"`,
            },
        });
    } catch (error: any) {
        console.error("Failed to generate PDF report:");
        console.error(error.stack || error.message || error);
        return NextResponse.json(
            { error: "Failed to generate report PDF", details: error.message },
            { status: 500 }
        );
    }
}
