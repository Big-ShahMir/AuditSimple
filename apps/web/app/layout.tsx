import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "SHIELD — Financial Document Auditor",
    description: "Uncover the true cost of your financial products.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="bg-[#FAFAF9] text-slate-900 font-sans antialiased">
                {children}
            </body>
        </html>
    );
}
