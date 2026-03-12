"use client";

import React, { useState, FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const { error: resetError } = await authClient.forgetPassword({
            email,
            redirectTo: "/sign-in",
        });

        if (resetError) {
            setError(resetError.message ?? "Something went wrong. Please try again.");
            setLoading(false);
        } else {
            setSent(true);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4">
            {/* Brand */}
            <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-slate-400 mb-6">
                    <span className="w-8 h-px bg-slate-300" />
                    SimplyAudit
                    <span className="w-8 h-px bg-slate-300" />
                </div>
                <h1 className="text-3xl sm:text-4xl font-serif text-slate-900 tracking-tight mb-2">
                    Reset your password
                </h1>
                <p className="text-slate-500 text-sm max-w-xs mx-auto">
                    Enter the email address associated with your account and we&apos;ll send you a reset link.
                </p>
            </div>

            {/* Card */}
            <div className="w-full max-w-sm">
                {sent ? (
                    /* Success state */
                    <div className="text-center">
                        <div className="w-14 h-14 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-5">
                            <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <p className="text-sm text-slate-700 font-medium mb-1">Check your inbox</p>
                        <p className="text-xs text-slate-400 mb-6">
                            If an account exists for <strong className="font-medium text-slate-500">{email}</strong>, you&apos;ll receive a password reset link shortly.
                        </p>
                        <Link
                            href="/sign-in"
                            className="inline-block px-4 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-xl hover:bg-slate-900 transition-colors"
                        >
                            Back to sign in
                        </Link>
                    </div>
                ) : (
                    /* Form state */
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="email" className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@company.com"
                                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition-shadow"
                            />
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5 text-xs text-rose-700">
                                <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full px-4 py-2.5 bg-slate-800 text-white text-sm font-medium rounded-xl hover:bg-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Sending…
                                </span>
                            ) : (
                                "Send reset link"
                            )}
                        </button>

                        {/* Back link */}
                        <p className="text-center text-xs text-slate-400 mt-4">
                            <Link href="/sign-in" className="text-slate-600 font-medium hover:text-slate-800 transition-colors">
                                ← Back to sign in
                            </Link>
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}
