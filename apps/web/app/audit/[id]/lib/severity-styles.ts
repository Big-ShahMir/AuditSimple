import { SeverityLevel } from "@auditsimple/types";

export interface SeverityStyle {
    badgeClass: string;
    icon: string;
    label: string;
    borderColor: string;
}

const SEVERITY_STYLES: Record<SeverityLevel, SeverityStyle> = {
    [SeverityLevel.INFO]: { badgeClass: "bg-slate-100 text-slate-800", icon: "ℹ️", label: "Info", borderColor: "border-slate-300" },
    [SeverityLevel.LOW]: { badgeClass: "bg-sky-50 text-sky-800", icon: "📋", label: "Low", borderColor: "border-sky-300" },
    [SeverityLevel.MEDIUM]: { badgeClass: "bg-amber-50 text-amber-800", icon: "⚠️", label: "Medium", borderColor: "border-amber-300" },
    [SeverityLevel.HIGH]: { badgeClass: "bg-orange-50 text-orange-800", icon: "🔶", label: "High", borderColor: "border-orange-400" },
    [SeverityLevel.CRITICAL]: { badgeClass: "bg-rose-50 text-rose-900", icon: "🔴", label: "Critical", borderColor: "border-rose-500" },
};

export function getSeverityStyle(level: SeverityLevel): SeverityStyle {
    return SEVERITY_STYLES[level] || SEVERITY_STYLES[SeverityLevel.INFO];
}
