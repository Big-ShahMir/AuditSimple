import React from "react";
import { ContractAudit } from "@auditsimple/types";
import { SummaryPanel } from "./SummaryPanel";
import { CostBreakdownTable } from "./CostBreakdownTable";
import { DecisionPrompt } from "./DecisionPrompt";

export function DecisionInterface({ audit }: { audit: ContractAudit }) {
    return (
        <div className="mt-16 pt-16 border-t border-slate-200">
            <div className="flex flex-col gap-8 max-w-5xl mx-auto">
                <SummaryPanel executiveSummary={audit.executiveSummary} />

                {audit.costOfLoyalty.breakdown.length > 0 && (
                    <CostBreakdownTable
                        breakdown={audit.costOfLoyalty.breakdown}
                        totalCost={audit.costOfLoyalty.totalCost}
                    />
                )}

                <DecisionPrompt auditId={audit.auditId} />
            </div>
        </div>
    );
}
