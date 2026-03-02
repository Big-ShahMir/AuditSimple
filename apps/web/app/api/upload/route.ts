// ============================================================
// apps/web/app/api/upload/route.ts
// ============================================================
// POST /api/upload
//
// Accepts multipart form data containing a PDF or image file.
// Delegates the full ingestion pipeline (validation, text extraction,
// PII scrubbing) to lib/ingestion, then fires the analysis pipeline
// asynchronously and returns the auditId immediately.
//
// Pipeline lifecycle:
//   1. validateAndIngest() — synchronous from the route's perspective
//   2. Response returned to client with auditId + CLASSIFYING status
//   3. runAuditPipeline() — fire-and-forget; progress events are written
//      to Redis by lib/agents/progress.ts as each node completes
//   4. Prisma Audit record updated to COMPLETE or FAILED on pipeline end
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { validateAndIngest } from "@/lib/ingestion";
//import { runAuditPipeline } from "@/lib/agents";
import { runMockPipeline } from "@/lib/agents";
import { AuditStatus } from "@auditsimple/types";
import type { AgentState } from "@auditsimple/types";
import { prisma } from "@/lib/prisma";

const ALLOWED_MIMES = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
]);

export async function POST(request: NextRequest) {
    // ─── 1. Parse multipart form data ────────────────────────────────────────
    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json(
            { error: "Invalid multipart form data" },
            { status: 400 }
        );
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
        return NextResponse.json(
            { error: "A file field named 'file' is required" },
            { status: 400 }
        );
    }

    if (!ALLOWED_MIMES.has(file.type)) {
        return NextResponse.json(
            { error: `Unsupported file type: ${file.type}. Accepted: PDF, PNG, JPEG, WebP.` },
            { status: 415 }
        );
    }

    // ─── 2. Convert File → base64 for UploadRequest ──────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const fileContent = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type as
        | "application/pdf"
        | "image/png"
        | "image/jpeg"
        | "image/webp";

    // ─── 3. Run ingestion (validate → extract → scrub PII → persist) ─────────
    // validateAndIngest creates the Audit record in Prisma and returns an
    // AgentState with scrubbledDocumentText ready for the analysis pipeline.
    let auditId: string;
    let state: AgentState;

    try {
        const result = await validateAndIngest({
            fileContent,
            mimeType,
            fileName: file.name,
        });
        auditId = result.auditId;
        state = result.state;
    } catch (err) {
        const code =
            (err as { code?: string }).code ?? "INGESTION_FAILED";
        const message =
            err instanceof Error ? err.message : "Ingestion failed";
        const httpStatus =
            code === "L1_PII_SERVICE_UNAVAILABLE"
                ? 503
                : code === "VALIDATION_FAILED"
                    ? 422
                    : 500;
        return NextResponse.json({ error: message, code }, { status: httpStatus });
    }

    // ─── 4. Fire-and-forget: run the analysis pipeline ───────────────────────
    // runAuditPipeline executes the full LangGraph state machine.
    // Progress events are written to Redis by lib/agents/progress.ts
    // as each node completes — the SSE stream route reads those events.
    //void runAuditPipeline(state)
    void runMockPipeline(auditId)
        .then(async (finalState) => {
            const isComplete =
                finalState.audit?.status === AuditStatus.COMPLETE;
            const now = new Date();

            const updateData: Record<string, unknown> = {
                status: isComplete ? AuditStatus.COMPLETE : AuditStatus.FAILED,
                completedAt: now,
                updatedAt: now,
                warnings: JSON.stringify(finalState.errors ?? []),
            };

            if (isComplete && finalState.audit) {
                const { audit } = finalState;
                Object.assign(updateData, {
                    contractType: audit.contractType ?? null,
                    riskScore: audit.riskScore ?? null,
                    executiveSummary: audit.executiveSummary ?? null,
                    clauses: JSON.stringify(audit.clauses ?? []),
                    issues: JSON.stringify(audit.issues ?? []),
                    costOfLoyalty: JSON.stringify(audit.costOfLoyalty ?? null),
                });
            }

            await (prisma as any).audit.update({
                where: { id: auditId },
                data: updateData,
            });
        })
        .catch(async (err) => {
            console.error(`[upload] Pipeline error for audit ${auditId}:`, err);
            await (prisma as any).audit
                .update({
                    where: { id: auditId },
                    data: { status: AuditStatus.FAILED },
                })
                .catch(() => undefined); // ignore secondary failure
        });

    // ─── 5. Return immediately — pipeline runs in the background ─────────────
    return NextResponse.json({
        auditId,
        status: AuditStatus.CLASSIFYING,
        message:
            "Document uploaded successfully. Analysis pipeline has started.",
    });
}
