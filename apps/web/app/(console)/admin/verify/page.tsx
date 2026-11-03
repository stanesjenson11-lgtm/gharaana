import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { anim, authLead, authTitle, authTitleText } from "@/components/auth/ui";
import { requireAdminRole } from "@/lib/session";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

export default function VerifyPage() {
  return (
    <AuthShell inset>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-surface" />}>
        <Verify />
      </Suspense>
    </AuthShell>
  );
}

async function Verify() {
  const { user } = await requireAdminRole();
  if (!user.twoFactorEnabled) redirect("/admin/security");
  return (
    <>
      <h1 className={`${anim(1)} ${authTitle}`}>
        <span className={authTitleText}>One more step</span>
      </h1>
      <p className={`${anim(2)} ${authLead}`}>
        Enter the 6-digit code from your authenticator app, or one of your backup codes. The console then stays open until the end of the day.
      </p>
      <VerifyForm />
    </>
  );
}
