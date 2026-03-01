import React from "react";
import { formatCAD } from "../lib/format";

export function ConfidenceRange({
    low,
    mid,
    high,
}: {
    low: number;
    mid: number;
    high: number;
}) {
    return (
        <div className="w-full mt-4 flex flex-col items-center">
            <div className="flex justify-between w-full text-xs text-slate-500 mb-1">
                <span>{formatCAD(low)}</span>
                <span>{formatCAD(mid)} (Expected)</span>
                <span>{formatCAD(high)}</span>
            </div>

            {/* Visual bracket/bar representing the spread */}
            <div className="relative w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                {/* A subtle highlight representing the core range */}
                <div
                    className="absolute top-0 h-full bg-slate-400 rounded-full"
                    style={{ width: '40%', left: '30%' }}
                />
                {/* The mid point marker */}
                <div
                    className="absolute top-0 h-full w-1 bg-slate-700 z-10"
                    style={{ left: '50%', transform: 'translateX(-50%)' }}
                />
            </div>
            <p className="text-[10px] text-slate-400 mt-2 uppercase tracking-wider">
                90% Confidence Interval
            </p>
        </div>
    );
}
