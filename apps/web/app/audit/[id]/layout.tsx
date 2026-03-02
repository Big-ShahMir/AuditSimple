import React from "react";
import { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    // We don't have the original filename here without a fetch, 
    // so we'll use a generic title for now or "SHIELD Audit"
    return {
        title: `Audit - SHIELD`,
        description: `Contract analysis results.`,
    };
}

export default function AuditLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-[#FAFAF9] text-slate-900 font-sans selection:bg-slate-200">
            {/* 
        This is a localized layout for the audit page.
        Most global layouts like headers/nav exist higher up, but we wrap
        the page content here.
      */}
            <main className="w-full">
                {children}
            </main>
        </div>
    );
}
