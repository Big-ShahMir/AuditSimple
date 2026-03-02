import { useState, useEffect, useRef } from "react";
import { ProgressEvent, AuditStatus } from "@auditsimple/types";

export function useAuditSSE(auditId: string) {
    const [events, setEvents] = useState<ProgressEvent[]>([]);
    const [status, setStatus] = useState<AuditStatus>("UPLOADING" as AuditStatus);
    const [isConnected, setIsConnected] = useState(false);
    const [hasConnected, setHasConnected] = useState(false);
    const retryRef = useRef(0);

    useEffect(() => {
        let es: EventSource | null = null;
        let timeoutId: NodeJS.Timeout;
        let isMounted = true;

        function connect() {
            if (!isMounted) return;

            es = new EventSource(`/api/audit/${auditId}/stream`);

            es.onopen = () => {
                if (isMounted) {
                    setHasConnected(true);
                    setIsConnected(true);
                }
            };

            es.onmessage = (event) => {
                if (!isMounted) return;
                try {
                    const data: ProgressEvent = JSON.parse(event.data);
                    setEvents((prev) => [...prev, data]);

                    if (data.type === "status_change") {
                        setStatus(data.status);
                        if (data.status === AuditStatus.FAILED || data.status === AuditStatus.COMPLETE) {
                            es?.close();
                            setIsConnected(false);
                        }
                    }
                    if (data.type === "complete") {
                        es?.close();
                        setIsConnected(false);
                    }
                    // reset backoff on success
                    retryRef.current = 0;
                } catch (e) {
                    console.error("Failed to parse SSE message", e);
                }
            };

            es.onerror = () => {
                if (!isMounted) return;
                es?.close();
                setIsConnected(false);

                // Exponential backoff: 1s, 2s, 4s, ..., capped at 10s
                const delay = Math.min(1000 * Math.pow(2, retryRef.current), 10000);
                retryRef.current += 1;

                timeoutId = setTimeout(connect, delay);
            };
        }

        connect();

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
            es?.close();
        };
    }, [auditId]);

    const progress = events
        .filter((e) => e.type === "status_change")
        .map((e) => e as { type: "status_change", status: AuditStatus, progress: number })
        .at(-1)?.progress ?? 0;

    return { events, progress, status, isConnected, hasConnected };
}
