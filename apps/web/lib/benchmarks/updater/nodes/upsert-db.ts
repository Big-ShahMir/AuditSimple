import { prisma } from "@/lib/prisma";
import type { UpdaterState } from "../state";

export async function upsertDbNode(state: UpdaterState): Promise<Partial<UpdaterState>> {
    const allRates = [...state.bocRates, ...state.wsRates].filter(
        (row) => row.value !== null && row.value !== undefined && isFinite(row.value)
    );

    let upsertedCount = 0;

    for (const row of allRates) {
        await prisma.benchmarkRate.upsert({
            where: {
                sourceName_category_asOfDate: {
                    sourceName: row.sourceName,
                    category:   row.category,
                    asOfDate:   row.asOfDate,
                },
            },
            update: {
                value:        row.value,
                unit:         row.unit,
                referenceUrl: row.referenceUrl,
            },
            create: {
                sourceName:   row.sourceName,
                category:     row.category,
                value:        row.value,
                unit:         row.unit,
                asOfDate:     row.asOfDate,
                referenceUrl: row.referenceUrl,
            },
        });
        upsertedCount++;
    }

    return { upsertedCount };
}
