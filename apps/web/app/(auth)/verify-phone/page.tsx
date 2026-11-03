import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { IdleGuard } from "@/components/auth/idle-guard";
import { PhoneSignIn } from "@/components/auth/phone-sign-in";
import { getSession, safeNext } from "@/lib/session";

export const metadata: Metadata = { title: "Confirm your number | Gharaana", robots: { index: false } };

// The second step after Google or Apple: a 6-digit SMS code that attaches a mobile number to the account.
export default function VerifyPhonePage({ searchParams }: PageProps<"/verify-phone">) {
  return (
    <AuthShell>
      <Suspense>
        <VerifyPhone searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function VerifyPhone({ searchParams }: Pick<PageProps<"/verify-phone">, "searchParams">) {
  const next = safeNext((await searchParams).next);
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (session.user.phoneNumberVerified) redirect(next);
  // Signed in but not yet confirmed: the idle sign-out applies here too, as everywhere else someone is signed in.
  return (
    <>
      <IdleGuard />
      <PhoneSignIn link next={next} providers={{ google: false, apple: false }} dev={process.env.NODE_ENV === "development"} />
    </>
  );
}
