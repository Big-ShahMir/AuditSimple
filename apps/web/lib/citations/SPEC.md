# Module: citations

## Purpose

This module is the **verifiability layer** — the system's defense against hallucination. It takes extracted clauses and cross-references every one of them back to the source document text. The core question it answers: "Can we prove this claim exists in the original document?" If yes, it anchors a precise `SourceLocation` with bounding box coordinates. If no, it downgrades confidence and flags the clause as `UNVERIFIED`.

The module implements a three-tier verification cascade: exact match → fuzzy match → LLM re-extraction → UNVERIFIED flag. It also runs deterministic hallucination detection heuristics (phantom clauses, numeric drift, ghost pages, self-contradictions) and applies confidence gating to decide what reaches the final audit vs. what gets demoted to a warning.

**Design principle: If the AI can't prove it, the AI can't say it.**

## Interfaces (import from `packages/types`)

### Consumed
- `ExtractedClause` — the clauses to verify, each with a `source.verbatimText` and `source.pageNumber`
- `AgentState["pageTexts"]` — the full document text with word-level bounding boxes (produced by `lib/ingestion`)
- `SourceLocation` — the target structure each verified clause must produce
- `AuditIssue` — input to the confidence gate (issues are gated before final audit inclusion)
- `AuditWarning` — produced when verification fails or heuristics trigger
- `SeverityLevel` — used in confidence gating logic

### Produced
- Verified `ExtractedClause[]` — same shape as input but with anchored `SourceLocation` data (bounding boxes populated, `textHash` computed) and adjusted `extractionConfidence`
- Gated `AuditIssue[]` — issues that pass the confidence gate, plus demoted issues converted to `AuditWarning[]`

## Dependencies

### This module calls:
- `@anthropic-ai/sdk` — Claude Vision API for Tier 3 re-extraction (sending a page image back to the LLM with a targeted prompt when fuzzy matching fails)
- `crypto` (Node.js built-in) — SHA-256 hashing for `SourceLocation.textHash`
- No database calls. No external HTTP except the LLM fallback.

### Called by:
- `lib/agents/nodes/generate-citations.ts` — imports `verifyCitations()` as the primary entry point
- `lib/agents/nodes/synthesize.ts` — may import `gateConfidence()` to filter issues before summary generation

### Does NOT call:
- `lib/ingestion` — receives `pageTexts` as a parameter, does not trigger ingestion
- `lib/analysis` — no dependency on templates or validation rules
- `lib/benchmarks` — no dependency on market data

## Files to Create

- **`verify.ts`** — Primary entry point. Exports `verifyCitations(clauses: ExtractedClause[], pageTexts: PageText[]): Promise<VerificationResult>` where `VerificationResult` contains the verified clauses, a list of unverified clause IDs, and any warnings generated. Orchestrates the three-tier cascade for each clause: tries exact match, falls back to fuzzy match, falls back to LLM re-extraction, and finally flags as UNVERIFIED.
- **`exact-match.ts`** — Tier 1: Exact string matching. Exports `findExactMatch(verbatimText: string, pageTexts: PageText[]): MatchResult | null`. Searches for the verbatim text (after whitespace normalization) across all pages. Returns the page number, character offset range, and matched word positions for bounding box computation. Fast path — O(n) scan per clause.
- **`fuzzy-match.ts`** — Tier 2: Fuzzy string matching. Exports `findFuzzyMatch(verbatimText: string, pageTexts: PageText[], config: CitationMatchConfig): MatchResult | null`. Implements a sliding window over each page's text, computing Jaro-Winkler similarity at each window position. Returns the best match if it exceeds `minSimilarityThreshold` (0.85). Window size is `verbatimText.length ± 20%` to account for minor extraction differences.
- **`similarity.ts`** — String similarity algorithms. Exports `jaroWinklerSimilarity(a: string, b: string): number` and `levenshteinDistance(a: string, b: string): number`. Pure functions, no dependencies. These must be implemented from scratch (no npm dependency) — they're small algorithms and eliminating the dep keeps the bundle lean.
- **`reextract.ts`** — Tier 3: LLM re-extraction fallback. Exports `reextractFromPage(clause: ExtractedClause, pageImage: Buffer, pageText: string): Promise<MatchResult | null>`. Sends the specific page image to Claude Vision with a targeted prompt: "Find the exact text that corresponds to [clause label] with value [rawValue] on this page. Return the exact quote." If the LLM returns a match, run it through `findExactMatch` or `findFuzzyMatch` against that single page to anchor it.
- **`bounding-box.ts`** — Bounding box computation from word positions. Exports `computeBoundingBox(matchStart: number, matchEnd: number, wordPositions: WordPosition[]): SourceLocation["boundingBox"]`. Given a character offset range and the word-level bounding boxes from `pageTexts`, computes the enclosing bounding box that covers all matched words. Handles multi-line spans by computing the union rectangle.
- **`hallucination.ts`** — Deterministic hallucination detection heuristics. Exports `runHallucinationChecks(clauses: ExtractedClause[], pageTexts: PageText[]): HallucinationReport`. Implements five checks, each returning a list of flagged clause IDs and reasons:
  1. **Phantom Clause** — `verbatimText` has zero fuzzy matches anywhere in the document
  2. **Numeric Drift** — `numericValue` doesn't appear (within ±1%) in `verbatimText`
  3. **Ghost Page** — `source.pageNumber` exceeds the actual page count
  4. **Self-Contradiction** — two clauses with the same `label` have conflicting `numericValue`
  5. **Empty Verbatim** — `verbatimText` is empty or whitespace-only
- **`confidence-gate.ts`** — Confidence gating and demotion. Exports `gateConfidence(clauses: ExtractedClause[], issues: AuditIssue[]): GateResult`. Applies the confidence thresholds: clauses below 0.6 are excluded from issue generation, issues below 0.7 are excluded from the final audit, unverified clauses get their confidence multiplied by 0.4, and issues that fall below 0.5 after all adjustments are demoted from `AuditIssue` to `AuditWarning`.
- **`config.ts`** — All configuration constants for the citation engine. Exports `CITATION_MATCH_CONFIG` and `CONFIDENCE_GATE_CONFIG` as frozen objects. Single place to tune thresholds without touching logic files.
- **`types.ts`** — Module-internal types not exported to `packages/types`. Defines `MatchResult`, `VerificationResult`, `HallucinationReport`, `GateResult`, `WordPosition`, `PageText` (re-aliased from `AgentState["pageTexts"][number]` for readability), and `CitationMatchConfig`.
- **`index.ts`** — Public barrel export. Exports only `verifyCitations`, `gateConfidence`, `runHallucinationChecks`, and the config objects. Internal files are not re-exported.

## Key Logic

### Three-Tier Verification Cascade
```typescript
async function verifySingleClause(
  clause: ExtractedClause,
  pageTexts: PageText[],
  config: CitationMatchConfig
): Promise<{ clause: ExtractedClause; verified: boolean; warning?: AuditWarning }> {

  // Tier 1: Exact match (fast, high confidence)
  const exact = findExactMatch(clause.source.verbatimText, pageTexts);
  if (exact) {
    return {
      clause: anchorClause(clause, exact, 1.0), // no confidence penalty
      verified: true,
    };
  }

  // Tier 2: Fuzzy match (handles OCR artifacts, minor LLM paraphrasing)
  const fuzzy = findFuzzyMatch(clause.source.verbatimText, pageTexts, config);
  if (fuzzy) {
    return {
      clause: anchorClause(clause, fuzzy, 0.9), // slight confidence reduction
      verified: true,
    };
  }

  // Tier 3: LLM re-extraction (expensive, last resort)
  const pageImage = await renderPageToImage(clause.source.pageNumber, pageTexts);
  const reextracted = await reextractFromPage(clause, pageImage, pageTexts[clause.source.pageNumber - 1]?.text ?? "");
  if (reextracted) {
    return {
      clause: anchorClause(clause, reextracted, 0.7), // notable confidence reduction
      verified: true,
    };
  }

  // UNVERIFIED: no match found anywhere
  return {
    clause: {
      ...clause,
      extractionConfidence: clause.extractionConfidence * 0.4, // severe penalty
    },
    verified: false,
    warning: {
      code: "L3_CITE_NO_MATCH",
      message: `Could not verify "${clause.label}" in source document`,
      recoverable: true,
      stage: "CITING" as any,
    },
  };
}
```

### Sliding Window Fuzzy Match
```typescript
function findFuzzyMatch(
  verbatimText: string,
  pageTexts: PageText[],
  config: CitationMatchConfig
): MatchResult | null {
  const needle = normalize(verbatimText, config);
  const windowMin = Math.floor(needle.length * 0.8);
  const windowMax = Math.ceil(needle.length * 1.2);

  let bestMatch: { page: number; start: number; end: number; score: number } | null = null;

  for (const page of pageTexts) {
    const haystack = normalize(page.text, config);

    for (let winSize = windowMin; winSize <= windowMax; winSize++) {
      for (let i = 0; i <= haystack.length - winSize; i++) {
        const window = haystack.slice(i, i + winSize);
        const score = jaroWinklerSimilarity(needle, window);

        if (score >= config.minSimilarityThreshold && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { page: page.pageNumber, start: i, end: i + winSize, score };
        }
      }
    }
  }

  if (!bestMatch) return null;

  return {
    pageNumber: bestMatch.page,
    charOffsetStart: bestMatch.start,
    charOffsetEnd: bestMatch.end,
    matchedText: pageTexts[bestMatch.page - 1].text.slice(bestMatch.start, bestMatch.end),
    similarity: bestMatch.score,
  };
}

function normalize(text: string, config: CitationMatchConfig): string {
  let t = text;
  if (config.normalizeWhitespace) t = t.replace(/\s+/g, " ").trim();
  if (config.caseInsensitive) t = t.toLowerCase();
  return t;
}
```

### Bounding Box Union Computation
```typescript
function computeBoundingBox(
  matchStart: number,
  matchEnd: number,
  wordPositions: WordPosition[]
): SourceLocation["boundingBox"] {
  // Find all words that overlap with [matchStart, matchEnd)
  const overlapping = wordPositions.filter(wp => {
    const wordEnd = wp.charOffset + wp.word.length;
    return wp.charOffset < matchEnd && wordEnd > matchStart;
  });

  if (overlapping.length === 0) {
    // Fallback: return full-page box (better than nothing)
    return { topLeftX: 0, topLeftY: 0, bottomRightX: 1, bottomRightY: 1 };
  }

  // Union rectangle of all overlapping word bounding boxes
  return {
    topLeftX: Math.min(...overlapping.map(w => w.boundingBox.topLeftX)),
    topLeftY: Math.min(...overlapping.map(w => w.boundingBox.topLeftY)),
    bottomRightX: Math.max(...overlapping.map(w => w.boundingBox.bottomRightX)),
    bottomRightY: Math.max(...overlapping.map(w => w.boundingBox.bottomRightY)),
  };
}
```

### Hallucination Check: Numeric Drift
```typescript
function checkNumericDrift(clause: ExtractedClause): boolean {
  if (clause.numericValue === null) return true; // no numeric claim, no drift possible

  // Extract all numbers from verbatimText
  const numbersInText = clause.source.verbatimText
    .match(/[\d,]+\.?\d*/g)
    ?.map(n => parseFloat(n.replace(/,/g, "")))
    .filter(n => !isNaN(n)) ?? [];

  // Check if any number in verbatimText is within ±1% of numericValue
  return numbersInText.some(n =>
    Math.abs(n - clause.numericValue!) / Math.abs(clause.numericValue!) <= 0.01
  );
}
// Returns true if consistent, false if drifted
```

### Confidence Gate Thresholds
```typescript
const CONFIDENCE_GATE_CONFIG = Object.freeze({
  clauseMinConfidence: 0.6,
  issueMinConfidence: 0.7,
  unverifiedPenalty: 0.4,
  warningThreshold: 0.5,
});
```

## Constraints

- **NEVER pass an unverified clause as if it were verified.** If all three tiers fail, the clause's `extractionConfidence` must be multiplied by `unverifiedPenalty` (0.4). There is no "skip verification" path.
- **NEVER modify `pageTexts`.** This module reads the positional data but does not alter it. The ingestion module owns that data.
- **The Tier 3 LLM re-extraction is the ONLY LLM call in this module.** Tier 1 and Tier 2 are fully deterministic. The hallucination checks and confidence gate are fully deterministic. If the LLM call fails or times out, treat the clause as UNVERIFIED — do not retry beyond the policy defined in `lib/agents/retry.ts`.
- **Implement Jaro-Winkler and Levenshtein from scratch in `similarity.ts`.** Do not add an npm dependency for this. They are ~30 lines each and keeping them in-module eliminates a supply chain risk for a security-sensitive application.
- **`textHash` must be computed on the MATCHED text from the source document**, not on the LLM's `verbatimText`. This ensures the hash anchors to what's actually in the document, enabling tamper detection.
- **The sliding window fuzzy match is O(n × m × w) where n=pages, m=page length, w=window sizes.** For documents up to 100 pages this is acceptable. Do NOT attempt to optimize with indexing for the MVP — correctness over speed. Add a `// TODO: optimize with n-gram index for large documents` comment.
- **The bounding box fallback (full-page box) must generate an `AuditWarning`** with code `L4_RENDER_CITATION_FAILED` so the frontend knows to show a page-level highlight instead of a precise text highlight.
- **`gateConfidence()` must be idempotent.** Running it twice on the same input produces the same output. It does not modify the input arrays — it returns new filtered arrays.
- **Do not import from `lib/agents`, `lib/ingestion`, `lib/analysis`, or `lib/benchmarks`.** This module is a self-contained verification engine that receives all inputs as function parameters.
