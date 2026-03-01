import React, { useState } from "react";

export function AssumptionsDrawer({ assumptions }: { assumptions: string[] }) {
    const [isOpen, setIsOpen] = useState(false);

    if (!assumptions || assumptions.length === 0) return null;

    return (
        <div className="mt-6 border border-slate-200 rounded-md overflow-hidden bg-white">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-4 py-3 text-sm text-left flex justify-between items-center bg-slate-50 hover:bg-slate-100 transition-colors text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300"
                aria-expanded={isOpen}
            >
                <span>Based on {assumptions.length} assumptions</span>
                <svg
                    className={`w-4 h-4 text-slate-400 transform transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="px-4 py-3 bg-white border-t border-slate-100">
                    <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                        {assumptions.map((assumption, idx) => (
                            <li key={idx} className="leading-relaxed">
                                {assumption}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
