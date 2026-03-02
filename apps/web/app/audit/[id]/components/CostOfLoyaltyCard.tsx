import React from "react";
import { CostOfLoyalty } from "@auditsimple/types";
import { formatCAD } from "../lib/format";
import { ConfidenceRange } from "./ConfidenceRange";
import { AssumptionsDrawer } from "./AssumptionsDrawer";

export function CostOfLoyaltyCard({ costOfLoyalty }: { costOfLoyalty: CostOfLoyalty }) {
    if (!costOfLoyalty) return null;

    return (
        <div className="bg-white border text-center border-slate-200 rounded-xl p-8 shadow-sm flex flex-col items-center">
            <h2 className="text-sm font-medium text-slate-500 tracking-wide uppercase mb-2">
                Estimated Cost of Loyalty
            </h2>

            <p className="text-sm text-slate-500 mb-6 max-w-sm">
                The projected excess cost of remaining in this contract over its lifetime compared to fair-market benchmarks.
            </p>

            <div className="font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight text-slate-900 mb-2">
                {formatCAD(costOfLoyalty.totalCost)}
            </div>

            <div className="w-full max-w-md mx-auto">
                <ConfidenceRange
                    low={costOfLoyalty.confidenceRange.low}
                    mid={costOfLoyalty.confidenceRange.mid}
                    high={costOfLoyalty.confidenceRange.high}
                />

                <AssumptionsDrawer assumptions={costOfLoyalty.assumptions} />
            </div>
        </div>
    );
}
