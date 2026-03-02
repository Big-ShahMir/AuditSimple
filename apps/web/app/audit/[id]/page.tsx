import React, { Suspense } from "react";
import { AuditResultResponse, AuditStatusResponse } from "@auditsimple/types";
import { AuditResultView } from "./components/AuditResultView";
import { ErrorView } from "./components/ErrorView";
import { ProgressView } from "./components/ProgressView";
import AuditLoading from "./loading";

// Revalidate or disable caching for this page so it's always fresh
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function AuditPageContent({ id }: { id: string }) {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

    try {
        const res = await fetch(`${API_BASE}/api/audit/${id}`);

        if (!res.ok) {
            if (res.status === 404) {
                throw new Error("Audit not found.");
            }
            throw new Error("Failed to load audit data.");
        }

        const data: AuditResultResponse | AuditStatusResponse = await res.json();

        if ("audit" in data && data.audit.status === "COMPLETE") {
            return <AuditResultView audit={data.audit} documentViewUrl={data.documentViewUrl} />;
        }

        if (("audit" in data && data.audit.status === "FAILED") || ("status" in data && data.status === "FAILED")) {
            // Warnings might be passed differently depending on whether we get a full Audit object
            // or just a status response
            const warnings = "audit" in data && "warnings" in data.audit ? data.audit.warnings : [];
            return <ErrorView auditId={id} warnings={warnings ?? []} />;
        }

        return <ProgressView auditId={id} />;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "An unknown error occurred.";
        return (
            <ErrorView
                auditId={id}
                warnings={[{ code: "FETCH_ERROR", message, recoverable: false, stage: "ANALYZING" as any }]}
            />
        );
    }
}

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <Suspense fallback={<AuditLoading />}>
            <AuditPageContent id={id} />
        </Suspense>
    );
}
