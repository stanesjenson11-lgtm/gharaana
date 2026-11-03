import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthenticatorSignIn } from "@/components/auth/authenticator-sign-in";
import { PhoneSignIn } from "@/components/auth/phone-sign-in";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isStaffRole } from "@/lib/roles";
import { user } from "@/lib/schema";
import { getSession, safeNext } from "@/lib/session";
import { DAY_COOKIE, dayUser } from "@/lib/staff-day";

export const metadata: Metadata = { title: "Sign in | Gharaana", robots: { index: false } };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <AuthShell>
      <Suspense>
        <SignIn searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function SignIn({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  await connection(); // who is signing in, and today's date, are decided per request, never prerendered
  const p = await searchParams;
  const next = safeNext(p.next);
  // Already signed in: /after-sign-in picks the door (console, where they were going, or confirming their number).
  if (await getSession()) redirect(`/after-sign-in?next=${encodeURIComponent(next)}`);

  // A team member who had today's text-message code in this browser needs only their authenticator, until the day ends.
  const { secret } = await auth.$context;
  const id = p.phone === "1" ? null : dayUser(secret, (await cookies()).get(DAY_COOKIE)?.value);
  const [person] = id
    ? await db.select({ name: user.name, phone: user.phoneNumber, role: user.role, banned: user.banned, on: user.twoFactorEnabled, verified: user.phoneNumberVerified }).from(user).where(eq(user.id, id))
    : [];
  const idle = p.idle === "1" ? "You were signed out after a few minutes without activity. Sign in to carry on." : undefined;
  if (person && person.phone && !person.banned && person.on && person.verified && isStaffRole(person.role)) {
    return <AuthenticatorSignIn name={person.name.trim().split(/\s+/)[0]} phone={`+91 ••••• ••${person.phone.slice(-3)}`} next={next} notice={idle} />;
  }
  return (
    <PhoneSignIn
      next={next}
      providers={{ google: !!process.env.GOOGLE_CLIENT_ID, apple: !!process.env.APPLE_CLIENT_ID }}
      failed={p.error === "1"}
      notice={idle ?? (p.team === "1" ? "Team accounts sign in with a mobile number and an authenticator code. A new day starts with a text message." : undefined)}
      dev={process.env.NODE_ENV === "development"}
    />
  );
}
