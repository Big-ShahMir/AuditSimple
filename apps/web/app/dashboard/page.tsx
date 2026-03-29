"use client";

import React, { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const ACCEPTED_EXT = ".pdf, .png, .jpg, .jpeg, .webp";

type UploadState = "idle" | "uploading" | "error";

export default function DashboardPage() {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [state, setState] = useState<UploadState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);

    const upload = useCallback(async (file: File) => {
        if (!ACCEPTED_TYPES.includes(file.type)) {
            setError(`Unsupported file type: ${file.type}. Please upload a PDF, PNG, JPEG, or WebP.`);
            setState("error");
            return;
        }

        setState("uploading");
        setError(null);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/upload", { method: "POST", body: formData });
            const json = await res.json();

            if (!res.ok) {
                setError(json.error ?? "Upload failed. Please try again.");
                setState("error");
                return;
            }

            router.push(`/audit/${json.auditId}`);
        } catch {
            setError("Network error. Please check your connection and try again.");
            setState("error");
        }
    }, [router]);

    const handleFiles = useCallback((files: FileList | null) => {
        if (!files || files.length === 0) return;
        const file = files[0];                              // capture before reset — FileList is live
        if (inputRef.current) inputRef.current.value = ""; // resetting empties the live FileList
        upload(file);
    }, [upload]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
    }, [handleFiles]);

    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
    const onDragLeave = () => setDragging(false);

    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center px-4">
            {/* Back to reports */}
            <div className="absolute top-8 left-8">
                <Link
                    href="/reports"
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors group"
                >
                    <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to My Reports
                </Link>
            </div>

            {/* Header */}
            <div className="text-center mb-12">
                <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-slate-400 mb-6">
                    <span className="w-8 h-px bg-slate-300" />
                    SimplyAudit
                    <span className="w-8 h-px bg-slate-300" />
                </div>
                <h1 className="text-4xl sm:text-5xl font-serif text-slate-900 tracking-tight mb-4">
                    Know the True Cost
                </h1>
                <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
                    Upload your financial contract. SimplyAudit analyzes every clause, benchmarks
                    against market rates, and calculates your exact Cost of Loyalty — so you
                    can decide with full information.
                </p>
            </div>

            {/* Upload Area */}
            <div
                className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer select-none
                    ${dragging
                        ? "border-slate-500 bg-slate-50"
                        : "border-slate-300 hover:border-slate-400 hover:bg-slate-50/60"
                    }
                    ${state === "uploading" ? "pointer-events-none opacity-60" : ""}
                `}
                onClick={() => state !== "uploading" && inputRef.current?.click()}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
            >
                <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    accept={ACCEPTED_EXT}
                    onChange={(e) => handleFiles(e.target.files)}
                />

                {state === "uploading" ? (
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-10 h-10 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                        <p className="text-slate-600 font-medium">Uploading document…</p>
                        <p className="text-sm text-slate-400">Analysis will begin automatically</p>
                    </div>
                ) : (
                    <>
                        <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-5">
                            <svg className="w-7 h-7 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                    d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <p className="text-slate-700 font-medium mb-1">
                            Drop your document here
                        </p>
                        <p className="text-sm text-slate-400 mb-5">
                            or click to browse — PDF, PNG, JPEG, WebP
                        </p>
                        <span className="inline-block px-4 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors">
                            Choose File
                        </span>
                    </>
                )}
            </div>

            {/* Error */}
            {state === "error" && error && (
                <div className="mt-4 w-full max-w-lg bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 text-sm text-rose-700 flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {error}
                </div>
            )}

            {/* Footer note */}
            <p className="mt-8 text-xs text-slate-400 max-w-sm text-center">
                All personal information is automatically redacted before analysis. Your document is never stored in plain text.
            </p>
        </div>
    );
}
