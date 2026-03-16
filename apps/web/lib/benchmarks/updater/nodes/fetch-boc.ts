import type { UpdaterState, SeedRow } from "../state";

const BOC_SERIES: { category: string; series: string }[] = [
    { category: "prime_rate",           series: "V80691311" },
    { category: "overnight_rate",       series: "V39079"    },
    { category: "mortgage_posted_1yr",  series: "V80691312" },
    { category: "mortgage_posted_3yr",  series: "V80691314" },
    { category: "mortgage_posted_5yr",  series: "V80691315" },
];

const BOC_BASE = "https://www.bankofcanada.ca/valet/observations";

export async function fetchBocNode(state: UpdaterState): Promise<Partial<UpdaterState>> {
    const bocRates: SeedRow[] = [];
    const errors: string[] = [];

    for (const { category, series } of BOC_SERIES) {
        try {
            const url = `${BOC_BASE}/${series}/json?recent=1`;
            const res = await fetch(url);
            if (!res.ok) {
                errors.push(`BOC ${series}: HTTP ${res.status}`);
                continue;
            }
            const json = await res.json();
            const obs = json.observations?.[0];
            if (!obs) {
                errors.push(`BOC ${series}: no observations in response`);
                continue;
            }
            const rawValue = obs[series]?.v;
            const value = parseFloat(rawValue);
            if (!isFinite(value)) {
                errors.push(`BOC ${series}: unparseable value "${rawValue}"`);
                continue;
            }
            bocRates.push({
                sourceName:   `Bank of Canada | ${category}`,
                category,
                value,
                unit:         "percent",
                asOfDate:     new Date(obs.d),
                referenceUrl: `https://www.bankofcanada.ca/rates/interest-rates/`,
            });
        } catch (err) {
            errors.push(`BOC ${series}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    return { bocRates, errors };
}
