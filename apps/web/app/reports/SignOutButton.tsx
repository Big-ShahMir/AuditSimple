"use client";

import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
    const router = useRouter();
    return (
        <button
            onClick={async () => {
                await signOut();
                router.push("/sign-in");
            }}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
        >
            Sign out
        </button>
    );
}
