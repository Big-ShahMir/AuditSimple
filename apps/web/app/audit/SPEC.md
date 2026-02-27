# Module: app/audit/[id]

## Purpose

This is the **primary user-facing page** of the entire application — the audit detail view. It is where the consumer sees the AI's analysis, explores the Reasoning Tree, verifies claims against the source document, and reaches the Human-in-the-Loop decision point. This page has three modes depending on audit status: a real-time progress view (during analysis), the full audit results view (when complete), and an error state (if the pipeline failed).

This page is the **demo page**. When judges evaluate the app, this is what they'll spend 90% of their time on. Every component must be polished, responsive, and self-explanatory.

## Interfaces (import from `packages/types`)

### Consumed (data this page renders)
- `ContractAudit` — the complete audit object, the primary data source for everything on this page
- `ExtractedClause` — rendered as leaves in the Reasoning Tree
- `AuditIssue` — rendered as flagged findings with severity badges
- `ClauseBenchmark` — rendered as visual comparison bars
- `CostOfLoyalty` — rendered as the hero metric card
- `SourceLocation` — used to draw citation overlays on the document
- `AuditStatus` — drives which mode the page renders (progress vs. results vs. error)
- `AuditWarning` — rendered as warning banners (e.g., stale benchmarks, unverified clauses)
- `SeverityLevel` — mapped to visual styles (badge colors, icons)
- `AuditStatusResponse` — consumed from the status polling endpoint
- `AuditResultResponse` — consumed from the results endpoint
- `ProgressEvent` — consumed from the SSE stream during analysis

### Produced
- No data types produced. This is a read-only presentation layer. The only user actions are: navigation (expand/collapse tree nodes, click citation links), PDF report download, and SSE connection management.

## Dependencies

### This page calls:
- `GET /api/audit/[id]` — fetches the `AuditResultResponse` (complete audit + document URL)
- `GET /api/audit/[id]/status` — polls `AuditStatusResponse` for progress percentage
- `GET /api/audit/[id]/stream` — SSE endpoint for real-time `ProgressEvent` stream during analysis
- `GET /api/audit/[id]/report` — triggers PDF report generation and download
- `pdfjs-dist` (client-side) — renders PDF pages in the Document Viewer

### Does NOT call:
- `lib/agents`, `lib/ingestion`, `lib/analysis`, `lib/citations`, `lib/benchmarks` — the page never imports backend modules directly. All data comes through API routes.

## Files to Create

### Page & Layout
- **`page.tsx`** — Next.js App Router page component. Server component that fetches initial audit data via `fetch()` to `/api/audit/[id]`. Renders the appropriate mode: `<ProgressView>` if `status !== COMPLETE && status !== FAILED`, `<AuditResultView>` if `status === COMPLETE`, `<ErrorView>` if `status === FAILED`. Uses `Suspense` with a skeleton loader for the initial data fetch.
- **`layout.tsx`** — Minimal layout wrapper. Sets page title to `"Audit: {fileName} — SHIELD"`. Provides the audit ID context to child components.
- **`loading.tsx`** — Skeleton loader shown during server component data fetching. Full-page skeleton matching the layout of the results view (card placeholders, tree skeleton, document viewer placeholder).

### Core Result Components
- **`components/AuditResultView.tsx`** — Top-level results container. Client component. Receives `ContractAudit` as prop. Manages layout: hero section (CostOfLoyaltyCard + RiskScoreGauge) at top, two-column layout below (Reasoning Tree on left, Document Viewer on right), Decision Interface at bottom. Manages the `selectedClause` state that coordinates between the tree and document viewer.
- **`components/CostOfLoyaltyCard.tsx`** — Hero metric card. Displays `costOfLoyalty.totalCost` as a large formatted number (e.g., "$14,200"). Shows the confidence range as a subtle bar or bracket below the number (low–mid–high). Contains an expandable `<AssumptionsDrawer>` that lists all assumptions. **Design: large, clean typography. No color that implies good/bad. Use a neutral palette — deep navy or charcoal on white.**
- **`components/ConfidenceRange.tsx`** — Visual representation of the low/mid/high cost range. A horizontal bar or bracket showing the spread. Pure presentational component. Props: `low: number`, `mid: number`, `high: number`.
- **`components/AssumptionsDrawer.tsx`** — Expandable/collapsible list of assumptions. Default: collapsed, showing count ("Based on 4 assumptions"). On expand: bullet list of assumption strings. Uses `<details>`/`<summary>` or a controlled accordion.
- **`components/RiskScoreGauge.tsx`** — Circular or semicircular gauge showing the 0-100 risk score. **No red/green color mapping.** Use a single-hue gradient (e.g., light to dark blue or amber) so the gauge doesn't imply "go/stop." Shows the numeric score in the center. Label: "Contract Risk Score" with a tooltip explaining the methodology.

### Reasoning Tree Components
- **`components/ReasoningTree.tsx`** — The main analysis view. Receives `clauses: ExtractedClause[]` and `issues: AuditIssue[]`. Groups clauses by `category`, rendering each group as a `<CategoryNode>`. Manages expand/collapse state for all nodes. Dispatches `onClauseSelect(clause: ExtractedClause)` upward to `AuditResultView` to coordinate with the Document Viewer.
- **`components/CategoryNode.tsx`** — Expandable category group (e.g., "Interest Rate Terms", "Fees & Charges"). Shows the category name, count of clauses, and a severity summary badge (worst severity among its child issues). Default: collapsed for categories with only INFO-level issues, expanded for categories with MEDIUM+ issues. Children: `<ClauseLeaf>` components.
- **`components/ClauseLeaf.tsx`** — Individual clause display. Shows: label, rawValue, plainLanguageSummary. If an `AuditIssue` references this clause, shows the `<IssueFlag>`. If a `ClauseBenchmark` exists, shows the `<BenchmarkBar>`. Always shows a `<CitationLink>`. Clicking the clause highlights it and triggers `onClauseSelect`.
- **`components/BenchmarkBar.tsx`** — Horizontal bar visualization comparing the contract value to the benchmark value. Shows: "Your rate: 5.49%" on one side, "Market: 4.49% (Wealthsimple)" on the other, with the delta displayed between them. Uses a neutral bar with a marker showing where the contract value falls relative to the benchmark. If direction is UNFAVORABLE, the delta text uses a muted amber. If FAVORABLE, muted teal. **No red. No green.**
- **`components/IssueFlag.tsx`** — Severity badge + short description for a flagged issue. Badge styles by severity: INFO (gray), LOW (light blue), MEDIUM (amber), HIGH (orange), CRITICAL (dark red-brown). Shows `issue.title` and `issue.description` inline. Expandable to show `issue.detailedAnalysis`.
- **`components/CitationLink.tsx`** — Small clickable link icon/text (e.g., "📄 Page 12"). On click: calls `onClauseSelect` which triggers the Document Viewer to scroll to the cited page and draw the bounding box overlay. If the clause is UNVERIFIED, shows a small warning icon with tooltip "Citation could not be verified in source document."

### Document Viewer Components
- **`components/DocumentViewer.tsx`** — PDF viewer panel. Receives: `documentViewUrl: string` (pre-signed URL to the PDF) and `activeClause: ExtractedClause | null`. Uses `pdfjs-dist` to render PDF pages. When `activeClause` changes, scrolls to `activeClause.source.pageNumber` and renders a `<CitationOverlay>` at the bounding box coordinates. Supports zoom in/out and page navigation.
- **`components/PageRenderer.tsx`** — Renders a single PDF page to a `<canvas>` element using `pdfjs-dist`. Handles DPI scaling for crisp rendering. Exposes the canvas dimensions for overlay coordinate mapping.
- **`components/CitationOverlay.tsx`** — Draws a semi-transparent highlight rectangle over the cited text on the PDF page. Receives `boundingBox` (normalized 0-1 coordinates) and the canvas dimensions. Renders as an absolutely positioned `<div>` with a colored border and translucent background. If UNVERIFIED, uses a dashed border with a warning icon. Shows a tooltip on hover with `verbatimText` and the AI's `plainLanguageSummary`.

### Decision Interface Components
- **`components/DecisionInterface.tsx`** — The HITL handoff section at the bottom of the page. Contains: `<SummaryPanel>`, `<CostBreakdownTable>`, `<DecisionPrompt>`. Visually separated from the analysis section with clear hierarchy — this is the "conclusion" of the page.
- **`components/SummaryPanel.tsx`** — Renders `executiveSummary` as clean prose. Maximum 300 words of plain-language text. No bullet points — flowing paragraphs. Styled as a lightly bordered card with generous padding and readable line height.
- **`components/CostBreakdownTable.tsx`** — Itemized table of the `costOfLoyalty.breakdown` array. Columns: Category, Amount (CAD), Description. Footer row: Total. Clean table styling, no row striping that implies priority. Every row is neutral.
- **`components/DecisionPrompt.tsx`** — **The most important component in the app.** A centered, typographically distinct section that reads: **"Review Complete — The Decision Is Yours."** Below it: a single sentence explaining that the AI has presented the data but the choice belongs to the user. Two neutral buttons side by side: "Download Report (PDF)" and "Talk to an Advisor" (links to Wealthsimple advisory, or a placeholder URL). **NO "Switch Now" button. NO "Stay" button. NO recommendation. NO nudge.**

### Progress View Components
- **`components/ProgressView.tsx`** — Shown while the pipeline is running. Connects to the SSE endpoint. Renders: a progress bar with percentage, the current stage name (e.g., "Extracting Clauses..."), and a live feed of `ProgressEvent` items. As `clause_found` events arrive, they appear in a growing list — showing the user that real work is happening. As `issue_flagged` events arrive, they appear with severity badges. Reconnects on SSE disconnect with exponential backoff (1s, 2s, 4s, max 10s).
- **`components/ProgressBar.tsx`** — Animated progress bar. Receives `progress: number` (0-100) and `stage: string`. Smooth CSS transition between progress values. Shows stage label below the bar.
- **`components/LiveFeed.tsx`** — Scrollable list of progress events as they arrive. Each event type renders differently: `clause_found` shows a checkmark + clause label, `issue_flagged` shows a severity badge + title, `error` shows a warning icon + message. Auto-scrolls to bottom as new events arrive.

### Error View
- **`components/ErrorView.tsx`** — Shown when `status === FAILED`. Displays the audit warnings/errors in a clear list. Shows a "Try Again" button that redirects to the upload page. Shows the `auditId` for support reference.

### Hooks & Utilities
- **`hooks/useAuditSSE.ts`** — Custom React hook that manages the SSE connection to `/api/audit/[id]/stream`. Returns `{ events: ProgressEvent[], progress: number, status: AuditStatus, isConnected: boolean }`. Handles reconnection with exponential backoff. Cleans up on unmount.
- **`hooks/useAuditData.ts`** — Custom React hook for fetching and polling audit data. On mount: fetches from `/api/audit/[id]`. If status is not COMPLETE/FAILED, polls `/api/audit/[id]/status` every 3 seconds as a fallback to SSE. Returns `{ audit: ContractAudit | null, isLoading: boolean, error: Error | null }`.
- **`hooks/useClauseSelection.ts`** — State management hook for the selected clause. Returns `{ selectedClause: ExtractedClause | null, selectClause: (clause: ExtractedClause) => void, clearSelection: () => void }`. Shared between ReasoningTree and DocumentViewer via prop drilling from AuditResultView.
- **`lib/severity-styles.ts`** — Maps `SeverityLevel` to CSS classes, icons, and labels. Single source of truth for visual severity representation. Exports `getSeverityStyle(level: SeverityLevel): { badgeClass: string, icon: string, label: string, borderColor: string }`.
- **`lib/format.ts`** — Number and currency formatting utilities. Exports `formatCAD(amount: number): string` (e.g., "$14,200"), `formatPercent(value: number): string` (e.g., "5.49%"), `formatDelta(delta: number, unit: string): string` (e.g., "+1.00 pp" or "+$450").

## Key Logic

### Page Mode Selection
```typescript
// page.tsx — server component
async function AuditPage({ params }: { params: { id: string } }) {
  const res = await fetch(`${API_BASE}/api/audit/${params.id}`);
  const data: AuditResultResponse | AuditStatusResponse = await res.json();

  if ("audit" in data && data.audit.status === "COMPLETE") {
    return <AuditResultView audit={data.audit} documentViewUrl={data.documentViewUrl} />;
  }
  if ("status" in data && data.status === "FAILED") {
    return <ErrorView auditId={params.id} warnings={data.warnings ?? []} />;
  }
  return <ProgressView auditId={params.id} />;
}
```

### Clause-to-Document Viewer Coordination
```typescript
// AuditResultView.tsx — manages selection state
function AuditResultView({ audit, documentViewUrl }: Props) {
  const { selectedClause, selectClause, clearSelection } = useClauseSelection();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left panel: analysis */}
      <div>
        <CostOfLoyaltyCard costOfLoyalty={audit.costOfLoyalty} />
        <RiskScoreGauge score={audit.riskScore} />
        <ReasoningTree
          clauses={audit.clauses}
          issues={audit.issues}
          onClauseSelect={selectClause}
          selectedClauseId={selectedClause?.clauseId ?? null}
        />
      </div>
      {/* Right panel: source document */}
      <div className="sticky top-4">
        <DocumentViewer
          documentUrl={documentViewUrl}
          activeClause={selectedClause}
        />
      </div>
      {/* Full width: decision interface */}
      <div className="col-span-full">
        <DecisionInterface audit={audit} />
      </div>
    </div>
  );
}
```

### SSE Hook Pattern
```typescript
// hooks/useAuditSSE.ts
function useAuditSSE(auditId: string) {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [status, setStatus] = useState<AuditStatus>("UPLOADING");
  const retryRef = useRef(0);

  useEffect(() => {
    let es: EventSource | null = null;

    function connect() {
      es = new EventSource(`/api/audit/${auditId}/stream`);

      es.onmessage = (event) => {
        const data: ProgressEvent = JSON.parse(event.data);
        setEvents(prev => [...prev, data]);
        if (data.type === "status_change") setStatus(data.status);
        if (data.type === "complete") es?.close();
        retryRef.current = 0; // reset backoff on success
      };

      es.onerror = () => {
        es?.close();
        const delay = Math.min(1000 * Math.pow(2, retryRef.current), 10000);
        retryRef.current += 1;
        setTimeout(connect, delay);
      };
    }

    connect();
    return () => es?.close();
  }, [auditId]);

  const progress = events
    .filter(e => e.type === "status_change")
    .at(-1)?.progress ?? 0;

  return { events, progress, status, isConnected: true };
}
```

### Severity Style Map
```typescript
const SEVERITY_STYLES: Record<SeverityLevel, SeverityStyle> = {
  INFO:     { badgeClass: "bg-slate-100 text-slate-600",   icon: "ℹ️",  label: "Info",     borderColor: "border-slate-300" },
  LOW:      { badgeClass: "bg-sky-50 text-sky-700",        icon: "📋",  label: "Low",      borderColor: "border-sky-300" },
  MEDIUM:   { badgeClass: "bg-amber-50 text-amber-700",    icon: "⚠️",  label: "Medium",   borderColor: "border-amber-300" },
  HIGH:     { badgeClass: "bg-orange-50 text-orange-700",   icon: "🔶",  label: "High",     borderColor: "border-orange-400" },
  CRITICAL: { badgeClass: "bg-rose-50 text-rose-800",       icon: "🔴",  label: "Critical", borderColor: "border-rose-500" },
};
```

## Constraints

- **NO green/red decision buttons.** No color-coding that implies "go" or "stop" on the Decision Interface. This is the One Decision rule. The buttons are neutral — "Download Report" and "Talk to an Advisor." Nothing else.
- **NO "Recommended Action" anywhere on the page.** The AI does not recommend. The AI illuminates. If any component text starts to sound advisory ("We suggest...", "You should..."), it violates the design principle.
- **The Risk Score gauge must NOT use a red-yellow-green gradient.** Use a single-hue progression (e.g., light blue → dark blue, or light amber → dark amber). The score is informational, not directional.
- **The Document Viewer is sticky on scroll** (right panel) so the user can browse the Reasoning Tree while always seeing the source document. On mobile: the viewer collapses to a toggleable drawer.
- **Citation overlays must work with normalized 0-1 coordinates.** The `SourceLocation.boundingBox` values are percentages, not pixels. The overlay component must multiply by the actual rendered canvas dimensions.
- **SSE reconnection must use exponential backoff** with a 10-second cap. The hook must clean up the EventSource on unmount to prevent memory leaks.
- **All currency formatting uses CAD.** No dollar sign ambiguity — format as "$14,200 CAD" or use the `formatCAD` utility consistently.
- **The page must be fully functional with mock data.** Use the mock from `lib/agents/mock.ts` during development. The page should render correctly with realistic fake data before the backend pipeline is complete.
- **No direct imports from `lib/` backend modules.** All data comes through `/api/` routes. This is a Next.js App Router page — server components fetch via HTTP, client components use hooks that call the API.
- **Warnings from `AuditWarning[]` must be rendered visibly** — not hidden in a console or footer. Use a banner at the top of the results view for CRITICAL warnings (e.g., "Some benchmark data may be outdated") and inline badges for clause-level warnings (e.g., "Citation unverified").
- **Accessible defaults.** All interactive elements must be keyboard-navigable. Severity badges must not rely solely on color — always include a text label or icon. Contrast ratios must meet WCAG AA.
- **Progressive reveal during analysis.** The ProgressView must show clauses and issues as they stream in — not a blank spinner for 60 seconds. This is critical for perceived performance and user trust.
