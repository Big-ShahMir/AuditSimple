// apps/web/app/audit/[id]/lib/format.ts

export function formatCAD(amount: number | null | undefined): string {
    if (amount == null) return "$0 CAD";

    return new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: "CAD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount) + " CAD";
}

export function formatPercent(value: number | null | undefined): string {
    if (value == null) return "0%";

    return new Intl.NumberFormat("en-CA", {
        style: "percent",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value / 100);
}

export function formatDelta(delta: number | null | undefined, unit: string | null): string {
    if (delta == null) return "";

    const sign = delta > 0 ? "+" : "";

    if (unit?.toLowerCase() === "percent" || unit?.toLowerCase() === "percentage") {
        // Keep 2 decimal places for percentage points
        const formatted = new Intl.NumberFormat("en-CA", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(delta);
        return `${sign}${formatted} pp`;
    }

    if (unit?.toLowerCase() === "cad" || unit?.toLowerCase() === "$") {
        const formatted = new Intl.NumberFormat("en-CA", {
            style: "currency",
            currency: "CAD",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(Math.abs(delta));
        return `${delta > 0 ? "+" : "-"}${formatted}`;
    }

    return `${sign}${delta} ${unit || ""}`.trim();
}
