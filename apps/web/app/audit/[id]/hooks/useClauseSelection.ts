import { useState, useCallback } from "react";
import { ExtractedClause } from "@auditsimple/types";

export function useClauseSelection() {
    const [selectedClause, setSelectedClause] = useState<ExtractedClause | null>(null);

    const selectClause = useCallback((clause: ExtractedClause) => {
        setSelectedClause((prev) =>
            prev?.clauseId === clause.clauseId ? null : clause
        );
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedClause(null);
    }, []);

    return { selectedClause, selectClause, clearSelection };
}
