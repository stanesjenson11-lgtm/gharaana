"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { anim, authCode, authError, authField, authLabel, authLead, authLink, authNotice, authPrimary, authTitle, authTitleText } from "./ui";

const PROBLEM: Record<string, string> = {
  WRONG_CODE: "That code doesn't match. Check the time on your phone and try again.",
  LOCKED: "Too many wrong codes. Try again in 15 minutes.",
};

/**
 * For a team member who already had today's text-message code in this browser: just the authenticator code.
 * The server checks everything again (lib/staff-day-plugin.ts); this only asks for it.
 */
export function AuthenticatorSignIn({ name, phone, next, notice }: { name: string; phone: string; next: string; notice?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const other = `/sign-in?phone=1&next=${encodeURIComponent(next)}`;

  const submit = (code: string) =>
    start(async () => {
      setError(null);
      const res = await fetch("/api/auth/staff-day/sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => null);
      if (res?.ok) {
        router.replace(`/after-sign-in?next=${encodeURIComponent(next)}`);
        router.refresh();
        return;
      }
      const message = (await res?.json().catch(() => null))?.message as string | undefined;
      if (message === "NO_DAY") return router.replace(other); // today's text message is no longer on record: start with a number
      setError(PROBLEM[message ?? ""] ?? (res?.status === 429 ? "Too many tries. Wait a few minutes and try again." : "We couldn't sign you in. Try again."));
    });

  return (
    <>
      <h1 className={`${anim(1)} ${authTitle}`}>
        <span className={authTitleText}>Welcome back{name ? `, ${name}` : ""}</span>
      </h1>
      <p className={`${anim(2)} ${authLead}`}>
        You confirmed <span className="tabular-nums">{phone}</span> by text message earlier today. Enter the code from your authenticator app to sign in.
      </p>
      {notice && <p className={`${anim(2)} ${authNotice}`}>{notice}</p>}
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(String(new FormData(e.currentTarget).get("code")));
        }}
      >
        <div className={anim(3)}>
          <label htmlFor="code" className={authLabel}>
            Authenticator Code
          </label>
          <div className={authField}>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              pattern="[0-9]{6}"
              maxLength={6}
              required
              placeholder="Enter the 6-digit code"
              aria-invalid={!!error}
              aria-describedby={error ? "day-error" : undefined}
              className={authCode}
            />
          </div>
          {error && (
            <p id="day-error" role="alert" className={authError}>
              {error}
            </p>
          )}
        </div>
        <button disabled={pending} className={`${anim(4)} ${authPrimary}`}>
          {pending ? "Checking…" : "Sign In"}
        </button>
      </form>
      <p className={`${anim(5)} text-center text-sm text-muted`}>
        Lost your phone?{" "}
        <Link href={other} className={authLink}>
          Use your number or a backup code
        </Link>
      </p>
    </>
  );
}
