// ============================================================
// apps/web/scripts/test-minimax.ts
// ============================================================
// Quick compatibility tests for MiniMax M2.5 via NVIDIA NIM.
//
// Tests:
//   . JSON prefix test   — does MiniMax add reasoning text before JSON?
//                           (breaks classify node's JSON.parse)
//   2. Nullable type test — does MiniMax honour type: ["string", "null"]
//                           in tool schemas, or does it fabricate values?
//
// Run:
//   npx tsx scripts/test-minimax.ts
//
// Requires NVIDIA_API_KEY in apps/web/.env or as an env var.
// ============================================================

import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Load .env if NVIDIA_API_KEY not already set
// ---------------------------------------------------------------------------

if (!process.env.NVIDIA_API_KEY) {
    try {
        const envPath = path.join(__dirname, "../.env");
        const lines = fs.readFileSync(envPath, "utf-8").split("\n");
        for (const line of lines) {
            const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const val = match[2].trim().replace(/^"(.*)"$/, "$1");
                process.env[key] = val;
            }
        }
    } catch {
        // .env not found — rely on process.env
    }
}

const API_KEY = process.env.NVIDIA_API_KEY ?? "";
const MODEL = "minimaxai/minimax-m2.5";

if (!API_KEY || API_KEY === "nvapi-your-key-here") {
    console.error("❌  NVIDIA_API_KEY is not set. Add it to apps/web/.env and re-run.");
    process.exit(1);
}

const nvidia = new OpenAI({
    apiKey: API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1",
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pass(msg: string) { console.log(`  ✅  ${msg}`); }
function fail(msg: string) { console.log(`  ❌  ${msg}`); }
function info(msg: string) { console.log(`  ℹ️   ${msg}`); }
function header(msg: string) { console.log(`\n${"─".repeat(60)}\n${msg}\n${"─".repeat(60)}`); }

// Minimal fake mortgage document — enough for classification
const FAKE_MORTGAGE_DOC = `
RESIDENTIAL MORTGAGE AGREEMENT
Lender: ABC Bank
Borrower: [REDACTED]
Principal Amount: $450,000
Interest Rate: 5.25% per annum (fixed)
Amortization Period: 25 years
Term: 5 years
Monthly Payment: $2,742.00
Prepayment Privilege: 15% of original principal per year without penalty
Penalty for early termination: 3 months interest or IRD, whichever is greater
Property address: [REDACTED]
`.trim();

// Minimal fake document with NO mention of annual fees
const FAKE_CREDIT_CARD_DOC = `
CREDIT CARD AGREEMENT
Card type: Standard Rewards Visa
Purchase interest rate: 19.99%
Cash advance rate: 22.99%
Grace period: 21 days on purchases
Minimum payment: 2% of balance or $10, whichever is greater
`.trim();

// ---------------------------------------------------------------------------
// TEST 1 — JSON prefix
// Does MiniMax return raw JSON or does it wrap it in reasoning text?
// ---------------------------------------------------------------------------

async function testJsonPrefix() {
    header("TEST 1 — JSON prefix in classify response");

    const system = [
        "You are a financial document classifier.",
        "Return a JSON object with exactly two fields:",
        '  { "contractType": "MORTGAGE", "confidence": <0.0-1.0> }',
        "Return ONLY the JSON object. No markdown fences, no explanation, no extra fields.",
    ].join("\n");

    const user = [
        "Classify the following document:",
        "",
        "---BEGIN DOCUMENT---",
        FAKE_MORTGAGE_DOC,
        "---END DOCUMENT---",
    ].join("\n");

    // max_tokens 2000: MiniMax emits a <think>…</think> reasoning block that
    // consumes output tokens before the JSON answer; 200 was too low.
    // response_format json_object: tells the model to output only valid JSON,
    // which typically suppresses the reasoning preamble on NIM.
    const response = await nvidia.chat.completions.create({
        model: MODEL,
        max_tokens: 2000,
        temperature: 0.0,
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
    });

    const rawContent = (response.choices[0]?.message?.content ?? "").trim();
    console.log("\n  Raw response from model:");
    console.log("  " + rawContent.split("\n").join("\n  "));

    // Test A: direct JSON.parse
    try {
        const parsed = JSON.parse(rawContent);
        pass(`Direct JSON.parse succeeded → contractType: "${parsed.contractType}", confidence: ${parsed.confidence}`);
        info("classify.ts JSON.parse will work as-is — no fix needed.");
    } catch {
        fail("Direct JSON.parse failed — model returned text before/after JSON.");

        // Test B: regex extraction fallback
        const match = rawContent.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                const parsed = JSON.parse(match[0]);
                pass(`Regex extraction fallback succeeded → contractType: "${parsed.contractType}", confidence: ${parsed.confidence}`);
                info("classify.ts needs regex extraction fix to handle MiniMax's response format.");
            } catch {
                fail("Regex extraction also failed — response is not parseable as JSON at all.");
            }
        } else {
            fail("No JSON object found in response at all.");
        }
    }
}

// ---------------------------------------------------------------------------
// TEST 2 — Nullable tool schema
// Does MiniMax return null for a missing clause, or does it fabricate a value?
// Tests both type: ["string", "null"] and anyOf formats.
// ---------------------------------------------------------------------------

async function testNullableToolSchema() {
    header(`TEST 2 — Nullable type in tool schema (missing clause)`);
    info(`Document has NO annual fee — model should return rawValue = null`);

    const system = [
        "You are a financial clause extractor.",
        "For EACH clause type, call the corresponding tool with the extracted data.",
        "If a clause is not present in the document, call the tool with rawValue = null.",
        "NEVER fabricate clause text. If you are unsure, set rawValue to null.",
    ].join("\n");

    const user = [
        "Extract all specified clauses from the following document:",
        "",
        "---BEGIN DOCUMENT---",
        FAKE_CREDIT_CARD_DOC,
        "---END DOCUMENT---",
    ].join("\n");

    // Sub-test A: type array format  ["string", "null"]
    console.log("\n  Sub-test A: type: [\"string\", \"null\"]  (current format in prompts.ts)");
    await runToolCallTest(system, user, {
        type: "object",
        properties: {
            rawValue: {
                type: ["string", "null"],
                description: "The annual fee amount (e.g. \"$120\"). Return null if not found.",
            },
        },
        required: ["rawValue"],
    });

    // Sub-test B: anyOf format
    console.log("\n  Sub-test B: anyOf: [{ type: \"string\" }, { type: \"null\" }]  (alternative format)");
    await runToolCallTest(system, user, {
        type: "object",
        properties: {
            rawValue: {
                anyOf: [{ type: "string" }, { type: "null" }],
                description: "The annual fee amount (e.g. \"$120\"). Return null if not found.",
            },
        },
        required: ["rawValue"],
    });
}

async function runToolCallTest(system: string, user: string, parameters: Record<string, unknown>) {
    const tools: OpenAI.Chat.ChatCompletionTool[] = [
        {
            type: "function",
            function: {
                name: "extract_annual_fee",
                description: "Extract the annual fee clause.",
                parameters,
            },
        },
    ];

    const response = await nvidia.chat.completions.create({
        model: MODEL,
        max_tokens: 300,
        temperature: 0.0,
        messages: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
        tools,
        tool_choice: "required",
    });

    const toolCalls = response.choices[0]?.message?.tool_calls ?? [];

    if (toolCalls.length === 0) {
        fail("Model made no tool calls at all (tool_choice: required was ignored).");
        return;
    }

    const toolCall = toolCalls[0];
    if (toolCall.type !== "function") {
        fail(`Unexpected tool call type: ${toolCall.type}`);
        return;
    }
    const args = JSON.parse(toolCall.function.arguments);
    const rawValue = args.rawValue;

    console.log(`     Model returned rawValue: ${JSON.stringify(rawValue)}`);

    if (rawValue === null) {
        pass("Model returned null — nullable type is honoured. No schema fix needed.");
    } else {
        fail(`Model returned "${rawValue}" instead of null — it fabricated a value.`);
        info("Consider switching to the anyOf format or adding stronger prompt instructions.");
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log(`\nMiniMax M2.5 compatibility test`);
    console.log(`Model : ${MODEL}`);
    console.log(`API   : https://integrate.api.nvidia.com/v1`);

    try {
        await testJsonPrefix();
        await testNullableToolSchema();
    } catch (err) {
        console.error("\n💥  Unexpected error:", err);
        process.exit(1);
    }

    console.log("\n" + "─".repeat(60));
    console.log("Done. Address any ❌ items before enabling the real pipeline.");
}

main();
