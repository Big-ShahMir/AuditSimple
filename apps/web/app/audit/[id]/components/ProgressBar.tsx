import React from "react";

interface ProgressBarProps {
    progress: number;
    stage: string;
}

export function ProgressBar({ progress, stage }: ProgressBarProps) {
    // Format stage text (e.g., "EXTRACT_CLAUSES" -> "Extracting Clauses...")
    // Real implementation might use a lookup map
    const displayStage = stage
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase()) + "...";

    return (
        <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
            <div className="flex justify-between w-full mb-2 px-1">
                <span className="text-sm font-medium text-slate-600 tracking-wide">{displayStage}</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">{Math.round(progress)}%</span>
            </div>

            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                    className="h-full bg-slate-800 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                />
            </div>
        </div>
    );
}
