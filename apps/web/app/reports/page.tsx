export const dynamic = "force-dynamic";

import React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "./SignOutButton";

export default async function ReportsPage() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) redirect("/sign-in");

    const audits = await prisma.audit.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            originalFileName: true,
            contractType: true,
            riskScore: true,
            status: true,
            createdAt: true,
            completedAt: true,
        },
    });

    return (
        <div className="min-h-screen bg-[#FAFAF9] px-4 py-12">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-start justify-between mb-10">
                    <div>
                        <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-slate-400 mb-4">
                            <span className="w-8 h-px bg-slate-300" />
                            SimplyAudit
                            <span className="w-8 h-px bg-slate-300" />
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-serif text-slate-900 tracking-tight mb-2">
                            Your Reports
                        </h1>
                        <p className="text-slate-500 text-sm">
                            All your analyzed documents in one place.
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-4 mt-2 shrink-0">
                        <SignOutButton />
                        <Link
                            href="/dashboard"
                            className="px-5 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-xl hover:bg-slate-900 transition-colors"
                        >
                            Upload New Document
                        </Link>
                    </div>
                </div>

                {/* Content */}
                {audits.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {audits.map((audit) => (
                            <AuditCard key={audit.id} audit={audit} />
                        ))}
                    </div>
                ) : (
                    <EmptyState />
                )}
            </div>
        </div>
    );
}

type AuditSummary = {
    id: string;
    originalFileName: string;
    contractType: string | null;
    riskScore: number | null;
    status: string;
    createdAt: Date;
    completedAt: Date | null;
};

function AuditCard({ audit }: { audit: AuditSummary }) {
    const statusColors: Record<string, string> = {
        COMPLETE: "bg-teal-50 text-teal-700 border border-teal-200",
        FAILED: "bg-rose-50 text-rose-700 border border-rose-200",
    };
    const statusClass = statusColors[audit.status] ?? "bg-amber-50 text-amber-700 border border-amber-200";
    const statusLabel = audit.status === "COMPLETE" ? "Complete"
        : audit.status === "FAILED" ? "Failed"
        : "In Progress";

    let riskClass = "";
    let riskLabel = "";
    if (audit.riskScore !== null) {
        if (audit.riskScore >= 70) {
            riskClass = "bg-rose-100 text-rose-700";
            riskLabel = `Risk ${audit.riskScore}`;
        } else if (audit.riskScore >= 40) {
            riskClass = "bg-amber-100 text-amber-700";
            riskLabel = `Risk ${audit.riskScore}`;
        } else {
            riskClass = "bg-teal-100 text-teal-700";
            riskLabel = `Risk ${audit.riskScore}`;
        }
    }

    const date = new Date(audit.createdAt).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });

    return (
        <Link
            href={`/audit/${audit.id}`}
            className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow block"
        >
            <div className="flex flex-col gap-3">
                <p
                    className="font-medium text-slate-900 text-sm truncate"
                    title={audit.originalFileName}
                >
                    {audit.originalFileName}
                </p>

                {audit.contractType && (
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                        {audit.contractType.replace(/_/g, " ")}
                    </p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass}`}>
                        {statusLabel}
                    </span>
                    {riskLabel && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskClass}`}>
                            {riskLabel}
                        </span>
                    )}
                </div>

                <p className="text-xs text-slate-400">{date}</p>
            </div>
        </Link>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
            <svg className="w-12 h-12 text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
            </svg>
            <h2 className="text-xl font-serif text-slate-900 mb-2">No audits yet</h2>
            <p className="text-slate-500 text-sm mb-6">Upload your first document to get started.</p>
            <Link
                href="/dashboard"
                className="px-5 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-xl hover:bg-slate-900 transition-colors"
            >
                Upload Document
            </Link>
        </div>
    );
}
