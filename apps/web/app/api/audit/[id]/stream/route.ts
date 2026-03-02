// ============================================================
// apps/web/app/api/audit/[id]/stream/route.ts
// ============================================================
// GET /api/audit/[id]/stream
//
// Server-Sent Events endpoint. Streams ProgressEvent objects to the
// client as the analysis pipeline executes.
//
// Implementation:
//   - lib/agents/progress.ts publishes events to the Redis pub/sub
//     channel `audit:progress:{auditId}` as each pipeline node completes.
//   - On connect, this route first reads the latest cached snapshot from
//     the Redis key `audit:progress:{auditId}` (same string — the key and
//     the channel name are identical) so clients connecting mid-pipeline
//     immediately receive the current state.
//   - Subscribes to that pub/sub channel and forwards every message
//     as an SSE `data:` frame.
//   - Closes the stream when a terminal event is received
//     (type==="complete" or status_change with status COMPLETE or FAILED).
//   - Sends keep-alive pings every 20 s to prevent proxy timeouts.
//   - Cleans up the subscriber connection when the client disconnects
//     via request.signal abort.
// ============================================================

import { NextRequest } from "next/server";
import { Redis } from "ioredis";

const KEEP_ALIVE_MS = 20_000;

function isTerminalEvent(raw: string): boolean {
    try {
        const event = JSON.parse(raw) as { type: string; status?: string };
        return (
            event.type === "complete" ||
            (event.type === "status_change" &&
                (event.status === "COMPLETE" || event.status === "FAILED"))
        );
    } catch {
        return false;
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: auditId } = await params;
    const redisUrl = process.env.REDIS_URL;
    const channel = `audit:progress:${auditId}`;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            let closed = false;
            let subscriber: Redis | null = null;
            let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

            const send = (data: string) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch {
                    // Controller already closed; nothing to do.
                }
            };

            const close = () => {
                if (closed) return;
                closed = true;
                if (keepAliveTimer !== null) clearInterval(keepAliveTimer);
                subscriber?.disconnect();
                try {
                    controller.close();
                } catch {
                    // Already closed.
                }
            };

            // Abort handler — fires when the HTTP client disconnects.
            request.signal.addEventListener("abort", close);

            // Keep-alive pings so CDNs / load balancers do not kill idle SSE connections.
            keepAliveTimer = setInterval(() => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(": ping\n\n"));
                } catch {
                    close();
                }
            }, KEEP_ALIVE_MS);

            // ── No Redis configured ───────────────────────────────────────────
            if (!redisUrl) {
                send(
                    JSON.stringify({
                        type: "error",
                        warning: {
                            code: "REDIS_UNAVAILABLE",
                            message:
                                "Progress streaming is unavailable (REDIS_URL not configured).",
                            recoverable: false,
                            stage: "UPLOADING",
                        },
                    })
                );
                close();
                return;
            }

            try {
                // ── Read the latest cached snapshot (best-effort) ─────────────
                // Uses a short-lived regular client distinct from the subscriber
                // because ioredis does not allow mixing regular commands and
                // pub/sub on the same connection.
                const reader = new Redis(redisUrl);
                const cached = await reader.get(channel).finally(() => reader.disconnect());

                if (cached) {
                    send(cached);
                    // If the pipeline already finished before this client connected,
                    // there is nothing left to subscribe to.
                    if (isTerminalEvent(cached)) {
                        close();
                        return;
                    }
                }

                // ── Subscribe to the pub/sub channel ─────────────────────────
                subscriber = new Redis(redisUrl);

                subscriber.on("message", (_chan: string, message: string) => {
                    send(message);
                    if (isTerminalEvent(message)) close();
                });

                subscriber.on("error", () => close());

                await subscriber.subscribe(channel);
            } catch (err) {
                send(
                    JSON.stringify({
                        type: "error",
                        warning: {
                            code: "STREAM_SETUP_FAILED",
                            message:
                                err instanceof Error
                                    ? err.message
                                    : "Failed to establish event stream.",
                            recoverable: true,
                            stage: "UPLOADING",
                        },
                    })
                );
                close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}
