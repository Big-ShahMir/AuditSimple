import React from "react";

export default function AuditLoading() {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-pulse">
            {/* Metric Cards Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 xl:gap-12 mb-8">
                <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="h-48 bg-slate-200 rounded-xl" />
                        <div className="h-48 bg-slate-200 rounded-xl" />
                    </div>
                    <div className="h-[400px] bg-slate-200 rounded-xl mt-4" />
                </div>

                {/* Document Viewer Skeleton */}
                <div className="hidden lg:block h-[calc(100vh-48px)] bg-slate-200 rounded-xl" />
            </div>

            {/* Decision Interface Skeleton */}
            <div className="mt-16 pt-16 border-t border-slate-200 max-w-5xl mx-auto">
                <div className="h-40 bg-slate-200 rounded-xl mb-8" />
                <div className="h-64 bg-slate-200 rounded-xl" />
            </div>
        </div>
    );
}
