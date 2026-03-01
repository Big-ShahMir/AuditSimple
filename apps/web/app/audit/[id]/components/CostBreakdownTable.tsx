import React from "react";
import { CostOfLoyalty } from "@auditsimple/types";
import { formatCAD } from "../lib/format";

export function CostBreakdownTable({ breakdown, totalCost }: { breakdown: CostOfLoyalty["breakdown"]; totalCost: number }) {
    if (!breakdown || breakdown.length === 0) return null;

    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                        <th scope="col" className="px-6 py-4 font-medium uppercase tracking-wider">Category</th>
                        <th scope="col" className="px-6 py-4 font-medium uppercase tracking-wider text-right">Amount (CAD)</th>
                        <th scope="col" className="px-6 py-4 font-medium uppercase tracking-wider">Description</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {breakdown.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-medium text-slate-800 align-top max-w-[200px] truncate">
                                {item.category}
                            </td>
                            <td className="px-6 py-4 align-top text-right text-slate-700 whitespace-nowrap">
                                {formatCAD(item.amount)}
                            </td>
                            <td className="px-6 py-4 align-top text-slate-500">
                                {item.description}
                            </td>
                        </tr>
                    ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                        <th scope="row" className="px-6 py-4 font-bold text-slate-800 uppercase tracking-wider">
                            Total Estimated Excess Cost
                        </th>
                        <td className="px-6 py-4 font-bold text-slate-800 text-right whitespace-nowrap">
                            {formatCAD(totalCost)}
                        </td>
                        <td className="px-6 py-4"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}
