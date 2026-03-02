// ============================================================
// apps/web/app/api/audit/[id]/route.ts
// ============================================================
// GET /api/audit/[id]
//
// Returns one of two response shapes depending on audit status:
//
//   COMPLETE  → AuditResultResponse  { audit: ContractAudit, documentViewUrl }
//   otherwise → AuditStatusResponse  { auditId, status, progress, currentStage,
//                                       estimatedSecondsRemaining }
//
// Progress is sourced from the Redis snapshot key written by
// lib/agents/progress.ts: `audit:progress:{auditId}`.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "ioredis";
import { AuditStatus } from "@auditsimple/types";
import { prisma } from "@/lib/prisma";

// Rough wall-clock estimate for a full pipeline run.
// Used to back-calculate estimatedSecondsRemaining from progress %.
const ESTIMATED_TOTAL_SECONDS = 90;

function tryParseJson<T>(raw: string | null | undefined, fallback: T): T {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: auditId } = await params;

    // ─── 1. Load audit record ─────────────────────────────────────────────────
    const auditRecord = await (prisma as any).audit.findUnique({
        where: { id: auditId },
    });

    if (!auditRecord) {
        return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    const audit = auditRecord as any;

    // ─── 2a. COMPLETE → full AuditResultResponse ──────────────────────────────
    if (audit.status === AuditStatus.COMPLETE) {
        return NextResponse.json({
            audit: {
                auditId: audit.id,
                status: audit.status,
                createdAt: (audit.createdAt as Date).toISOString(),
                updatedAt: (audit.updatedAt as Date).toISOString(),
                completedAt: audit.completedAt
                    ? (audit.completedAt as Date).toISOString()
                    : null,
                contractType: audit.contractType ?? null,
                originalFileName: audit.originalFileName,
                documentHash: audit.documentHash,
                piiSummary: {
                    totalRedacted: audit.totalPiiRedacted ?? 0,
                    entityTypeCounts: tryParseJson(audit.entityTypeCounts, {}),
                },
                clauses: tryParseJson(audit.clauses, []),
                issues: tryParseJson(audit.issues, []),
                costOfLoyalty: tryParseJson(audit.costOfLoyalty, null),
                riskScore: audit.riskScore ?? null,
                executiveSummary: audit.executiveSummary ?? null,
                warnings: tryParseJson(audit.warnings, []),
            },
            // documentUrl is the Vercel Blob URL stored during ingestion
            documentViewUrl: audit.documentUrl ?? null,
        });
    }

    // ─── 2b. In-progress or FAILED → AuditStatusResponse ─────────────────────
    let progress = 0;
    let currentStage = "Processing…";

    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
        const redis = new Redis(redisUrl);
        try {
            const cached = await redis.get(`audit:progress:${auditId}`);
            if (cached) {
                const event = tryParseJson<{
                    type: string;
                    progress?: number;
                    message?: string;
                }>(cached, { type: "unknown" });

                if (event.type === "status_change") {
                    progress = event.progress ?? 0;
                    currentStage = event.message ?? currentStage;
                }
            }
        } finally {
            redis.disconnect();
        }
    }

    const estimatedSecondsRemaining =
        progress >= 100
            ? 0
            : Math.round(ESTIMATED_TOTAL_SECONDS * (1 - progress / 100));

    return NextResponse.json({
        auditId: audit.id,
        status: audit.status,
        progress,
        currentStage,
        estimatedSecondsRemaining,
    });
}
