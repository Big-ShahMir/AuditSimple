import OpenAI from "openai";
import type { UpdaterState, SeedRow } from "../state";

const nvidia = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY ?? "",
    baseURL: "https://integrate.api.nvidia.com/v1",
});

const WS_PAGES: { url: string; categories: string[] }[] = [
    {
        url: "https://www.wealthsimple.com/en-ca/mortgage",
        categories: [
            "mortgage_fixed_1yr",
            "mortgage_fixed_2yr",
            "mortgage_fixed_3yr",
            "mortgage_fixed_5yr",
            "mortgage_variable",
        ],
    },
    {
        url: "https://www.wealthsimple.com/en-ca/save",
        categories: ["savings"],
    },
    {
        url: "https://www.wealthsimple.com/en-ca/gic",
        categories: ["gic_1yr", "gic_3yr", "gic_5yr"],
    },
    {
        url: "https://www.wealthsimple.com/en-ca/managed-investing",
        categories: ["managed_investing_mer"],
    },
];

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function stripTags(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
}

export async function scrapeWsNode(state: UpdaterState): Promise<Partial<UpdaterState>> {
    const wsRates: SeedRow[] = [];
    const errors: string[] = [];
    const today = new Date();

    for (const page of WS_PAGES) {
        try {
            const res = await fetch(page.url, {
                headers: { "User-Agent": USER_AGENT },
            });
            if (!res.ok) {
                errors.push(`WS scrape ${page.url}: HTTP ${res.status}`);
                continue;
            }
            const html = await res.text();
            const strippedHtml = stripTags(html);

            const response = await nvidia.chat.completions.create({
                model: "deepseek-ai/deepseek-v3.2",
                temperature: 0.0,
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "system",
                        content: `You are a financial data extractor. I will provide HTML text. Extract the current interest rates for the following categories: ${page.categories.join(", ")}. Return ONLY a JSON object mapping category names to the numeric float rate (e.g. { "savings": 1.25 }). If a rate is not explicitly stated in the text, return null for that category. Do not guess.`,
                    },
                    { role: "user", content: strippedHtml },
                ],
            });

            const rawContent = response.choices[0]?.message?.content ?? "";
            const cleanJson = rawContent.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
            const parsed: Record<string, number | null> = JSON.parse(cleanJson);

            for (const category of page.categories) {
                const extracted = parsed[category];
                if (extracted === null || extracted === undefined) continue;
                const value = Number(extracted);
                if (!isFinite(value)) continue;
                wsRates.push({
                    sourceName:   `Wealthsimple | ${category}`,
                    category,
                    value,
                    unit:         "percent",
                    asOfDate:     today,
                    referenceUrl: page.url,
                });
            }
        } catch (err) {
            errors.push(`WS scrape ${page.url}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    return { wsRates, errors };
}
