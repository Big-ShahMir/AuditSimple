import { useState, useEffect } from "react";
import { ContractAudit } from "@auditsimple/types";

export function useAuditData(auditId: string) {
    const [audit, setAudit] = useState<ContractAudit | null>(null);
    const [documentViewUrl, setDocumentViewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let isMounted = true;
        let pollInterval: NodeJS.Timeout;

        const fetchData = async () => {
            try {
                const res = await fetch(`/api/audit/${auditId}`);
                if (!res.ok) throw new Error("Failed to fetch audit data");
                const data = await res.json();

                if (!isMounted) return;

                if ("audit" in data && data.audit.status === "COMPLETE") {
                    setAudit(data.audit);
                    setDocumentViewUrl(data.documentViewUrl);
                    setIsLoading(false);
                    clearInterval(pollInterval);
                } else if ("status" in data && data.status === "FAILED") {
                    setIsLoading(false);
                    clearInterval(pollInterval);
                    // Handled mostly by server component redirecting to ErrorView,
                    // but if we poll client-side, we should handle error state.
                    setError(new Error(data.warnings?.[0]?.message || "Audit failed"));
                } else {
                    // It's still processing. Though we use SSE primarily during processing,
                    // we can poll /api/audit/[id]/status as a fallback.
                    setIsLoading(false);
                }
            } catch (err) {
                if (isMounted) {
                    setError(err instanceof Error ? err : new Error("Unknown error"));
                    setIsLoading(false);
                }
            }
        };

        const pollStatus = async () => {
            try {
                const res = await fetch(`/api/audit/${auditId}/status`);
                if (!res.ok) return;
                const data = await res.json();

                if (!isMounted) return;

                if (data.status === "COMPLETE" || data.status === "FAILED") {
                    // Re-fetch full data once complete or failed
                    fetchData();
                }
            } catch {
                // Ignore polling errors silently to not disrupt UI
            }
        };

        fetchData();
        pollInterval = setInterval(pollStatus, 3000);

        return () => {
            isMounted = false;
            clearInterval(pollInterval);
        };
    }, [auditId]);

    return { audit, documentViewUrl, isLoading, error };
}
