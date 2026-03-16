# Benchmark Updater Agent — Implementation Spec

This document provides complete context and instructions for implementing the `BenchmarkRate` updater agent in the SimplyAudit Next.js codebase.

## Objective

Build a 3-node LangGraph.js state machine that automatically fetches the latest market rates from the Bank of Canada (via JSON API) and Wealthsimple (via web scraping + LLM extraction), then upserts them into the PostgreSQL database using Prisma.

## Context & Constraints

1. **Location:** All new code must live in `apps/web/lib/benchmarks/updater/`. Do not modify existing files outside this directory (except for adding a barrel export in `apps/web/lib/benchmarks/index.ts`).
2. **Framework:** Use `@langchain/langgraph` for the state machine.
3. **Database:** Use the existing Prisma client (`import { prisma } from "@/lib/prisma"`).
4. **LLM:** The codebase uses **DeepSeek V3.2 via NVIDIA NIM**, accessed using the standard `openai` package. Do **not** use Anthropic/Claude.
5. **No PII:** This is public market data, so the Presidio sidecar is not used here.

## 1. State Definition (`state.ts`)

The LangGraph state object should look like this:

```typescript
import { Annotation } from "@langchain/langgraph";

export interface SeedRow {
    sourceName: string;
    category: string;
    value: number;
    unit: string;
    asOfDate: Date;
    referenceUrl: string | null;
}

export const UpdaterStateAnnotation = Annotation.Root({
    bocRates: Annotation<SeedRow[]>({ reducer: (x, y) => y, default: () => [] }),
    wsRates: Annotation<SeedRow[]>({ reducer: (x, y) => y, default: () => [] }),
    upsertedCount: Annotation<number>({ reducer: (x, y) => y, default: () => 0 }),
    errors: Annotation<string[]>({ reducer: (x, y) => x.concat(y), default: () => [] }),
});

export type UpdaterState = typeof UpdaterStateAnnotation.State;
```

## 2. Node: Fetch BOC (`nodes/fetch-boc.ts`)

**Behavior:** Pure HTTP `fetch()` against the Bank of Canada Valet JSON API. No LLM involved.
**Endpoint pattern:** `https://www.bankofcanada.ca/valet/observations/{seriesName}/json?recent=1`
**Return:** `Partial<UpdaterState>` updating `bocRates`.

### Required Series Mapping:

| Category | BOC Valet Series | Source Name | Extracted `value` |
|---|---|---|---|
| `prime_rate` | `V80691311` | `Bank of Canada \| prime_rate` | JSON `.v` parsed to float |
| `overnight_rate` | `V39079` | `Bank of Canada \| overnight_rate` | JSON `.v` parsed to float |
| `mortgage_posted_1yr` | `V80691312` | `Bank of Canada \| mortgage_posted_1yr` | JSON `.v` parsed to float |
| `mortgage_posted_3yr` | `V80691314` | `Bank of Canada \| mortgage_posted_3yr` | JSON `.v` parsed to float |
| `mortgage_posted_5yr` | `V80691315` | `Bank of Canada \| mortgage_posted_5yr` | JSON `.v` parsed to float |

<details>
<summary>Example BOC Valet JSON Response</summary>

```json
{
    "observations": [
        {
            "d": "2026-03-11",
            "V80691311": {
                "v": "4.45"
            }
        }
    ]
}
```
*Note: `asOfDate` should be parsed from the `"d"` key.*
</details>

## 3. Node: Scrape Wealthsimple (`nodes/scrape-ws.ts`)

**Behavior:** Fetch HTML, strip `<script>` and `<style>` tags via regex, send remaining text to DeepSeek to extract rates as structured JSON.
**Return:** `Partial<UpdaterState>` updating `wsRates`.

### Pages to Scrape & Required Extractions:

| URL | Target Categories | 
|---|---|
| `https://www.wealthsimple.com/en-ca/mortgage` | `mortgage_fixed_1yr`, `mortgage_fixed_2yr`, `mortgage_fixed_3yr`, `mortgage_fixed_5yr`, `mortgage_variable` |
| `https://www.wealthsimple.com/en-ca/save` | `savings` |
| `https://www.wealthsimple.com/en-ca/gic` | `gic_1yr`, `gic_3yr`, `gic_5yr` |
| `https://www.wealthsimple.com/en-ca/managed-investing` | `managed_investing_mer` |

> **IMPORTANT HEADER:** Wealthsimple blocks standard `fetch()`. You MUST pass a generic browser `User-Agent` header, e.g., `"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"`.

### LLM Implementation details:

Must use the existing OpenAI client pointing to NVIDIA NIM:

```typescript
import OpenAI from "openai";
const nvidia = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY ?? "",
    baseURL: "https://integrate.api.nvidia.com/v1",
});

// ... inside the LLM call ...
const response = await nvidia.chat.completions.create({
    model: "deepseek-ai/deepseek-v3.2",
    temperature: 0.0,
    response_format: { type: "json_object" },
    messages: [
        { 
            role: "system", 
            content: `You are a financial data extractor. I will provide HTML text. Extract the current interest rates for the following categories: [list categories]. Return ONLY a JSON object mapping category names to the numeric float rate (e.g. { "savings": 1.25 }). If a rate is not explicitly stated in the text, return null for that category. Do not guess.` 
        },
        { role: "user", content: strippedHtml }
    ]
});

// CRITICAL: DeepSeek V3.2 occasionally prepends <think>...</think> blocks even in json_object mode.
// You MUST strip these before calling JSON.parse()
const rawContent = response.choices[0]?.message?.content || "";
const cleanJson = rawContent.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
const parsed = JSON.parse(cleanJson);
```

For Wealthsimple `SeedRow` entries:
- `sourceName`: `"Wealthsimple | " + category`
- `unit`: `"percent"`
- `asOfDate`: `new Date()` (today)
- `referenceUrl`: The page URL scraped

## 4. Node: Upsert DB (`nodes/upsert-db.ts`)

**Behavior:** Takes all rates from state and upserts them into PostgreSQL using Prisma.

```typescript
import { prisma } from "@/lib/prisma";

// Example Prisma call for each valid row:
await prisma.benchmarkRate.upsert({
    where: {
        sourceName_category_asOfDate: {
            sourceName: row.sourceName,
            category: row.category,
            asOfDate: row.asOfDate,
        },
    },
    update: {
        value: row.value,
        unit: row.unit,
        referenceUrl: row.referenceUrl,
    },
    create: {
        sourceName: row.sourceName,
        category: row.category,
        value: row.value,
        unit: row.unit,
        asOfDate: row.asOfDate,
        referenceUrl: row.referenceUrl,
    },
});
```
**Return:** `Partial<UpdaterState>` updating `upsertedCount`.

## 5. Graph Definition (`graph.ts`)

```typescript
import { StateGraph, START, END } from "@langchain/langgraph";
import { UpdaterStateAnnotation } from "./state";
// import nodes...

const graph = new StateGraph(UpdaterStateAnnotation)
    .addNode("fetch_boc", fetchBocNode)
    .addNode("scrape_ws", scrapeWsNode)
    .addNode("upsert_db", upsertDbNode)
    .addEdge(START, "fetch_boc")
    .addEdge("fetch_boc", "scrape_ws") // Run sequentially for simplicity
    .addEdge("scrape_ws", "upsert_db")
    .addEdge("upsert_db", END)
    .compile();

export async function runBenchmarkUpdate() {
    return await graph.invoke({ bocRates: [], wsRates: [], upsertedCount: 0, errors: [] });
}
```

## 6. Runner Script (`scripts/update-benchmarks.ts`)

Create a standalone executable script:

```typescript
import "dotenv/config";
import { runBenchmarkUpdate } from "../lib/benchmarks/updater/graph";

async function main() {
    console.log("Starting benchmark update pipeline...");
    const result = await runBenchmarkUpdate();
    console.log(`Pipeline complete. Upserted ${result.upsertedCount} rates.`);
    if (result.errors?.length > 0) {
        console.error("Errors encountered:", result.errors);
        process.exit(1);
    }
    process.exit(0);
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
```

## Final Steps

1. Implement all 6 files as specified above.
2. Edit `apps/web/lib/benchmarks/index.ts` to add: `export { runBenchmarkUpdate } from "./updater/graph";`
3. Run `npx tsx apps/web/scripts/update-benchmarks.ts` to test it end-to-end.
