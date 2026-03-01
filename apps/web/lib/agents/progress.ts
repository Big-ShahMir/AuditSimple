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

import type { AgentState } from "@auditsimple/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProgressEvent {
    /** The audit this event belongs to */
    auditId: string;
    /** Current node name */
    node: string;
    /** Pipeline completion percentage (0–100) */
    percent: number;
    /** Human-readable status message */
    message: string;
    /** ISO 8601 timestamp */
    timestamp: string;
}

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
export function emitProgress(state: AgentState, event: Partial<ProgressEvent>): void {
    const auditId = state.audit?.auditId;
    if (!auditId) return;

    const node = event.node ?? state.currentNode;
    const percent = event.percent ?? NODE_PROGRESS[node] ?? 0;
    const message = event.message ?? NODE_MESSAGES[node] ?? "Processing…";

    const progressEvent: ProgressEvent = {
        auditId,
        node,
        percent,
        message,
        timestamp: new Date().toISOString(),
    };

    const payload = JSON.stringify(progressEvent);
    const key = `audit:progress:${auditId}`;

    // Fire-and-forget — errors are silently swallowed
    void getRedisClient().then((redis) => {
        if (!redis) return;
        return Promise.all([
            redis.set(key, payload, { ex: 3600 }),
            redis.publish(key, payload),
        ]);
    });
}
