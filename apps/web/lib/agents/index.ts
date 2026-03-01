// ============================================================
// apps/web/lib/agents/index.ts
// ============================================================
// Public API for the agents module.
//
// External code (app/api/analyze/route.ts) imports exclusively from here.
// ============================================================

export { runAuditPipeline } from "./graph";
export { runMockPipeline } from "./mock";
