import React from "react";
import { ClauseBenchmark } from "@auditsimple/types";
import { formatDelta } from "../lib/format";

export function BenchmarkBar({ benchmark }: { benchmark: ClauseBenchmark }) {
    const { contractValue, benchmark: bDPoint, delta, direction, contractUnit } = benchmark;
    const marketValue = bDPoint.value;

    // Render a visual representation of delta
    const isFavorable = direction === "FAVORABLE";
    const isUnfavorable = direction === "UNFAVORABLE";

    // Style according to constraint: no red/green.
    // Favorable: muted teal
    // Unfavorable: muted amber
    const deltaColorClass = isFavorable
        ? "text-teal-700 bg-teal-50 border-teal-200"
        : isUnfavorable
            ? "text-amber-700 bg-amber-50 border-amber-200"
            : "text-slate-600 bg-slate-50 border-slate-200";

    return (
        <div className="my-3 flex flex-col pt-3 border-t border-slate-100">
            <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-slate-600 font-medium">Your rate: {contractValue.toString()} {contractUnit}</span>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium tracking-wide ${deltaColorClass}`}>
                    {formatDelta(delta, contractUnit)}
                </span>
                <span className="text-slate-500">Market: {marketValue.toString()} {contractUnit}</span>
            </div>

            {/* Simple comparison bar */}
            <div className="relative w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                {/* We can do a split bar or just a marker. Since it's a simple comparison,
            we'll just use a subtle highlight for the difference. */}
                {direction === "UNFAVORABLE" && (
                    <div className="h-full bg-amber-300 w-1/3 ml-auto rounded-full" />
                )}
                {direction === "FAVORABLE" && (
                    <div className="h-full bg-teal-300 w-1/3 rounded-full" />
                )}
            </div>
            <div className="text-[10px] text-right text-slate-400 mt-1 uppercase tracking-wider">
                Source: {bDPoint.sourceName}
            </div>
        </div>
    );
}
