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

    // Redirect to the stored Vercel Blob URL for the original document.
    return NextResponse.redirect(record.documentUrl);
}
