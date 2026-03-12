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
// lib/agents/progress.ts: `audit:progress:{auditId}`
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "ioredis";
import { AuditStatus } from "@auditsimple/types";
import { prisma } from "@/lib/prisma";

// Rough wall-clock estimate for a full pipeline run.
// Used to back-calculate estimatedSecondsRemaining from progress %.
const ESTIMATED_TOTAL_SECONDS = 90;

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: auditId } = await params;

    // ─── 1. Load audit record with relations ──────────────────────────────────
    const auditRecord = await (prisma as any).audit.findUnique({
        where: { id: auditId },
        include: {
            clauses: true,
            issues: {
                include: { clauses: true },
            },
            piiRecord: true,
        },
    });

    if (!auditRecord) {
        return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    const audit = auditRecord as any;

    // ─── 2a. COMPLETE → full AuditResultResponse ──────────────────────────────
    if (audit.status === AuditStatus.COMPLETE) {
        // Map DB Clause rows → ExtractedClause interface shape
        const clauses = (audit.clauses ?? []).map((c: any) => ({
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

        // Map DB Issue rows → AuditIssue interface shape
        const issues = (audit.issues ?? []).map((issue: any) => ({
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
                    totalRedacted: audit.piiRecord?.totalRedacted ?? 0,
                    entityTypeCounts: audit.piiRecord?.entityCounts ?? {},
                },
                clauses,
                issues,
                costOfLoyalty: audit.costOfLoyalty ?? null,
                riskScore: audit.riskScore ?? null,
                executiveSummary: audit.executiveSummary ?? null,
                warnings: Array.isArray(audit.warnings) ? audit.warnings : [],
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
                const event = JSON.parse(cached) as {
                    type: string;
                    progress?: number;
                    message?: string;
                };

                if (event.type === "status_change") {
                    progress = event.progress ?? 0;
                    currentStage = event.message ?? currentStage;
                }
            }
        } catch {
            // Non-fatal — return default progress values if Redis is unavailable
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
