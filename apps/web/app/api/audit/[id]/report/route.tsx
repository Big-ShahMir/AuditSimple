// ============================================================
// apps/web/app/api/audit/[id]/report/route.ts
// ============================================================
// GET /api/audit/[id]/report
//
// MVP: redirects the caller to the original document URL stored in
// Vercel Blob. This gives the user access to the source document
// while the full formatted report feature is developed.
//
// TODO: Generate formatted PDF audit report post-MVP.
//   - Use a PDF generation library (e.g., @react-pdf/renderer or puppeteer)
//     to produce a styled AuditSimple report from the ContractAudit data.
//   - Include: executive summary, cost of loyalty, issues table,
//     clause-by-clause breakdown, benchmark comparisons, and citations.
//   - Stream the generated PDF directly or upload it to Blob and redirect.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: auditId } = await params;

    const record = await (prisma as any).audit.findUnique({
        where: { id: auditId },
        select: { documentUrl: true },
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

    // Dynamically generate the formatted PDF report
    try {
        const fullAudit = await (prisma as any).audit.findUnique({
            where: { id: auditId },
        });

        if (!fullAudit) {
            return NextResponse.json({ error: "Audit not found" }, { status: 404 });
        }

        // Parse JSON fields from the database
        const parsedAudit = {
            ...fullAudit,
            auditId: fullAudit.id,
            clauses: fullAudit.clauses ? JSON.parse(fullAudit.clauses) : [],
            issues: fullAudit.issues ? JSON.parse(fullAudit.issues) : [],
            costOfLoyalty: fullAudit.costOfLoyalty ? JSON.parse(fullAudit.costOfLoyalty) : null,
        };

        const { renderToStream } = await import("@react-pdf/renderer");
        const { AuditReportPDF } = await import("@/app/audit/[id]/components/AuditReportPDF");

        const stream = await renderToStream(<AuditReportPDF audit={parsedAudit as any} />);

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
                "Content-Disposition": `attachment; filename="auditsimple-report-${auditId}.pdf"`,
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
