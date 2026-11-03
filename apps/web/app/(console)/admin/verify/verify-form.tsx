"use client";

import { useActionState } from "react";
import { anim, authError, authField, authInput, authLabel, authPrimary } from "@/components/auth/ui";
import { verifyMfa } from "../mfa-actions";

export function VerifyForm() {
  const [error, action, pending] = useActionState(verifyMfa, null);
  return (
    <form action={action} className="space-y-5">
      <div className={anim(3)}>
        <label htmlFor="code" className={authLabel}>
          Authenticator or Backup Code
        </label>
        <div className={authField}>
          <input
            id="code"
            name="code"
            autoComplete="one-time-code"
            inputMode="text"
            autoFocus
            required
            placeholder="Enter your code"
            aria-invalid={!!error}
            aria-describedby={error ? "mfa-error" : undefined}
            className={`${authInput} text-base tracking-[0.2em] tabular-nums placeholder:tracking-normal`}
          />
        </div>
        {error && (
          <p id="mfa-error" role="alert" className={authError}>
            {error}
          </p>
        )}
      </div>
      <button disabled={pending} className={`${anim(4)} ${authPrimary}`}>
        {pending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
