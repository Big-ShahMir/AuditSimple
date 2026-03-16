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
