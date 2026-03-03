import React from "react";
import { AuditIssue } from "@auditsimple/types";

export function RiskScoreGauge({ score, issues }: { score: number, issues: AuditIssue[] }) {
    // Clamp score between 0 and 100
    const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));

    // Calculate the stroke dasharray for a semicircular gauge
    const radius = 60;
    const circumference = radius * Math.PI; // Half circle
    const dashoffset = circumference - (normalizedScore / 100) * circumference;

    // Get the top 3 issues (they are already sorted by severity DESC)
    const topIssues = issues.slice(0, 3);

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col items-center select-none h-full justify-between">
            <div className="w-full flex flex-col items-center">
                <div className="flex justify-between items-center w-full mb-4">
                    <h2 className="text-sm font-medium text-slate-500 tracking-wide uppercase">
                        Contract Risk Score
                    </h2>

                    <div className="group relative">
                        <button className="text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300 rounded-full">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </button>
                        {/* Tooltip */}
                        <div className="absolute right-0 top-6 w-64 p-3 bg-slate-800 text-slate-50 text-xs rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-10 w-max max-w-xs">
                            The risk score (0-100) reflects the concentration of predatory clauses, unfavorable financial terms, and hidden fees. A higher score indicates terms that deviate significantly from consumer-favorable industry standards.
                        </div>
                    </div>
                </div>

                <div className="relative w-48 h-24 mb-2 flex justify-center overflow-hidden">
                    {/* Background track (semi-circle) */}
                    <svg
                        className="w-full h-full"
                        viewBox="0 0 140 70"
                        style={{ transform: "translateY(5px)" }}
                    >
                        <path
                            d="M 10 70 A 60 60 0 0 1 130 70"
                            fill="none"
                            stroke="#e2e8f0" // slate-200
                            strokeWidth="12"
                            strokeLinecap="round"
                        />
                        {/* Progress fill mapped to slate-500 → slate-800 (single hue progression) */}
                        <path
                            d="M 10 70 A 60 60 0 0 1 130 70"
                            fill="none"
                            stroke="url(#scoreGradient)"
                            strokeWidth="12"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={dashoffset}
                            className="transition-all duration-1000 ease-out"
                        />
                        <defs>
                            <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                {/* Using a single hue progression (blue/slate) from light to dark */}
                                <stop offset="0%" stopColor="#94a3b8" /> {/* slate-400 */}
                                <stop offset="100%" stopColor="#1e293b" /> {/* slate-800 */}
                            </linearGradient>
                        </defs>
                    </svg>

                    {/* Center Score Text */}
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 flex flex-col items-center">
                        <span className="font-serif text-5xl tracking-tight text-slate-800">
                            {normalizedScore}
                        </span>
                    </div>
                </div>

                <div className="flex justify-between w-full text-xs text-slate-400 px-6 font-medium mt-1 mb-6">
                    <span>0</span>
                    <span>100</span>
                </div>
            </div>

            {/* Risk Factor Breakdown */}
            {topIssues.length > 0 && (
                <div className="w-full mt-auto border-t border-slate-100 pt-5">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                        Top Risk Contributors
                    </h3>
                    <ul className="space-y-3">
                        {topIssues.map((issue) => (
                            <li key={issue.issueId} className="flex items-start gap-2 text-sm text-slate-700">
                                <span className={`flex-shrink-0 mt-0.5 w-2 h-2 rounded-full ${issue.severity === 'CRITICAL' || issue.severity === 'HIGH' ? 'bg-rose-500' :
                                    issue.severity === 'MEDIUM' ? 'bg-amber-500' :
                                        'bg-sky-500'
                                    }`} />
                                <span className="leading-snug">
                                    <span className="font-medium mr-1">{issue.title}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
