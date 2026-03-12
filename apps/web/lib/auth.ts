import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { Resend } from "resend";
import { prisma } from "./prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),

    emailAndPassword: {
        enabled: true,
        sendResetPassword: async ({ user, url }) => {
            await resend.emails.send({
                from: "SimplyAudit <onboarding@resend.dev>",
                to: user.email,
                subject: "Reset your password — SimplyAudit",
                html: `
                    <p>Hi ${user.name ?? "there"},</p>
                    <p>You requested a password reset. Click the link below to choose a new password:</p>
                    <p><a href="${url}" style="color: #0F172A; font-weight: 600;">Reset Password</a></p>
                    <p style="color: #94a3b8; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
                `,
            });
        },
    },

    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
    },

    plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
