import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { anim, authLead, authTitle, authTitleText } from "@/components/auth/ui";
import { requireAdminRole } from "@/lib/session";
import { Enroll } from "./enroll";

export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

export default function SecurityPage() {
  return (
    <Suspense fallback={<div className="mt-10 h-64 animate-pulse rounded-2xl bg-surface" />}>
      <Security />
    </Suspense>
  );
}

async function Security() {
  const { user } = await requireAdminRole();
  return user.twoFactorEnabled ? (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
      <h1 className="text-[2rem] leading-tight font-semibold">Security</h1>
      <p className="mt-1 text-muted">
        Your authenticator app is on. If you lose the phone and your backup codes, someone with server access resets it with <code>pnpm reset-admin-2fa</code>.
      </p>
    </main>
  ) : (
    // Part of signing in for the first time, so it looks like the sign-in screens.
    <AuthShell inset>
      <h1 className={`${anim(1)} ${authTitle}`}>
        <span className={authTitleText}>Set up your authenticator</span>
      </h1>
      <p className={`${anim(2)} ${authLead}`}>Team accounts need a code from an authenticator app on top of the text message. It takes a minute, once.</p>
      <Enroll />
    </AuthShell>
  );
}
