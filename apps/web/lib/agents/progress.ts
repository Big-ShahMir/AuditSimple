// ============================================================
// apps/web/lib/agents/progress.ts
// ============================================================
// Progress emission utility.
//
// Exports:
//   emitProgress(state, event) — writes a ProgressEvent to Redis for SSE pickup
//   ProgressEvent              — event type definition
//   NODE_PROGRESS              — pipeline-stage → percent mapping
// ============================================================

import type { AgentState, ProgressEvent } from "@auditsimple/types";
import { AuditStatus } from "@auditsimple/types";
import { pubSub, bufferEvent } from "@/lib/pubsub";

// ---------------------------------------------------------------------------
// Progress percentage map (per SPEC)
// ---------------------------------------------------------------------------

export const NODE_PROGRESS: Record<string, number> = {
    classify: 15,
    extract_clauses: 40,
    validate_clauses: 50,
    benchmark: 65,
    calculate_cost: 75,
    generate_citations: 85,
    synthesize: 95,
    complete: 100,
    failed: 100,
};

// ---------------------------------------------------------------------------
// Node → human-readable message
// ---------------------------------------------------------------------------

const NODE_MESSAGES: Record<string, string> = {
    classify: "Identifying contract type…",
    extract_clauses: "Extracting key clauses…",
    validate_clauses: "Validating extracted clauses…",
    benchmark: "Comparing against market benchmarks…",
    calculate_cost: "Calculating cost of loyalty…",
    generate_citations: "Verifying source citations…",
    synthesize: "Generating executive summary…",
    complete: "Analysis complete.",
    failed: "Analysis failed.",
};

// ---------------------------------------------------------------------------
// Redis client (lazy singleton)
// ---------------------------------------------------------------------------

// We use a dynamic import to avoid hard-failing when Redis is unavailable
// in environments that do not need SSE (e.g. test / mock pipelines).
let redisClientPromise: Promise<{
    set: (key: string, value: string, opts?: { ex?: number }) => Promise<void>;
    publish: (channel: string, message: string) => Promise<void>;
} | null> | null = null;

function getRedisClient() {
    if (redisClientPromise) return redisClientPromise;

    redisClientPromise = (async () => {
        try {
            // Dynamic import — gracefully absent in test environments
            const { Redis } = await import("ioredis");
            const url = process.env.REDIS_URL;
            if (!url) return null;
            const client = new Redis(url);
            return {
                set: async (key: string, value: string, opts?: { ex?: number }) => {
                    if (opts?.ex) {
                        await client.set(key, value, "EX", opts.ex);
                    } else {
                        await client.set(key, value);
                    }
                },
                publish: async (channel: string, message: string) => {
                    await client.publish(channel, message);
                },
            };
        } catch {
            // Redis unavailable — progress events are no-ops
            return null;
        }
    })();

    return redisClientPromise;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Emits a progress event for the current pipeline node.
 *
 * Writes to Redis using two keys:
 *   - `audit:progress:{auditId}` — the latest event snapshot (TTL 1h)
 *   - Publishes on channel `audit:progress:{auditId}` for the SSE route to relay
 *
 * Gracefully no-ops if:
 *   - REDIS_URL is not set
 *   - Redis is unavailable
 *   - auditId is not yet set in state.audit
 *
 * This function is fire-and-forget — never awaited by the node itself so it
 * does not add to pipeline latency.
 */
export function emitProgress(
    state: AgentState,
    event: { node?: string; percent?: number; message?: string; status?: AuditStatus }
): void {
    const auditId = state.audit?.auditId;
    if (!auditId) return;

    const node = event.node ?? state.currentNode;
    const percent = event.percent ?? NODE_PROGRESS[node] ?? 0;
    const message = event.message ?? NODE_MESSAGES[node] ?? "Processing…";

    const progressEvent: ProgressEvent = {
        type: "status_change",
        status: event.status ?? state.audit?.status ?? AuditStatus.CLASSIFYING,
        progress: percent,
        message,
    };

    const payload = JSON.stringify(progressEvent);
    const key = `audit:progress:${auditId}`;

    // Buffer locally so late-connecting SSE clients can replay history
    bufferEvent(key, payload);

    // Always emit locally (in-process fallback for when Redis is absent)
    pubSub.emit(key, payload);

    // Also write to Redis if configured — fire-and-forget
    void getRedisClient().then((redis) => {
        if (!redis) return;
        return Promise.all([
            redis.set(key, payload, { ex: 3600 }),
            redis.publish(key, payload),
        ]);
    });
}

/**
 * Emits an arbitrary ProgressEvent (clause_found, issue_flagged, etc.)
 * to the in-process pubSub and optionally to Redis.
 *
 * Unlike emitProgress(), does NOT update the snapshot key in Redis — only
 * publishes to the pub/sub channel so real-time listeners receive it.
 */
export function emitRichEvent(auditId: string, event: ProgressEvent): void {
    if (!auditId) return;
    const payload = JSON.stringify(event);
    const key = `audit:progress:${auditId}`;

    // Buffer locally so late-connecting SSE clients can replay history
    bufferEvent(key, payload);

    // Always emit locally
    pubSub.emit(key, payload);

    // Also publish to Redis if configured — fire-and-forget
    void getRedisClient().then((redis) => {
        if (!redis) return;
        redis.publish(key, payload);
    });
}
