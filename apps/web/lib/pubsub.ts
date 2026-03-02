// ============================================================
// apps/web/lib/pubsub.ts
// ============================================================
// Global singleton EventEmitter for in-process pub/sub.
//
// Used as a Redis fallback: when REDIS_URL is not configured,
// emitProgress() emits here and the SSE stream route listens here,
// both running in the same Next.js server process.
//
// Stored on `global` so Next.js hot-module-replacement does not
// lose existing listeners or the event buffer between module re-evaluations.
//
// Also exports a bounded per-channel event history buffer so that
// SSE clients connecting after events were emitted can replay history
// and not miss pipeline steps.
// ============================================================

import { EventEmitter } from "events";

const MAX_BUFFER_PER_CHANNEL = 100;

const g = global as typeof globalThis & {
    __auditPubSub?: EventEmitter;
    __auditEventBuffer?: Map<string, string[]>;
};

if (!g.__auditPubSub) {
    g.__auditPubSub = new EventEmitter();
    g.__auditPubSub.setMaxListeners(200);
}

if (!g.__auditEventBuffer) {
    g.__auditEventBuffer = new Map();
}

export const pubSub: EventEmitter = g.__auditPubSub;

/** Append an event payload to the channel's history buffer. */
export function bufferEvent(channel: string, payload: string): void {
    const buf = g.__auditEventBuffer!;
    const history = buf.get(channel) ?? [];
    history.push(payload);
    if (history.length > MAX_BUFFER_PER_CHANNEL) history.shift();
    buf.set(channel, history);
}

/** Return all buffered event payloads for a channel (oldest first). */
export function getEventHistory(channel: string): string[] {
    return g.__auditEventBuffer?.get(channel) ?? [];
}

/** Remove the buffer for a channel once it is no longer needed. */
export function clearEventHistory(channel: string): void {
    g.__auditEventBuffer?.delete(channel);
}
