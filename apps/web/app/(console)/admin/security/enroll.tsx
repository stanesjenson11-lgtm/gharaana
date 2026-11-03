"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { encode } from "uqr";
import { anim, authCode, authError, authField, authLabel, authLink, authPrimary } from "@/components/auth/ui";
import { confirmEnrollment, startEnrollment } from "../mfa-actions";

type Started = { uri: string; codes: string[] };

/** The authenticator link as a QR code, drawn here in the browser: the key never goes to a QR service. Always dark on white, so every scanner reads it. */
function Qr({ value }: { value: string }) {
  const { data, size } = encode(value, { ecc: "M" });
  const path = data.flatMap((row, y) => row.flatMap((on, x) => (on ? [`M${x} ${y}h1v1h-1z`] : []))).join("");
  const margin = 4; // the quiet zone scanners need around a code
  return (
    <svg viewBox={`${-margin} ${-margin} ${size + 2 * margin} ${size + 2 * margin}`} role="img" aria-label="QR code to scan with your authenticator app" shapeRendering="crispEdges" className="mx-auto mt-3 h-56 w-56 rounded-2xl border border-hairline bg-white">
      <path d={path} fill="#000" />
    </svg>
  );
}

export function Enroll() {
  const router = useRouter();
  const [started, setStarted] = useState<Started | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!started)
    return (
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const s = await startEnrollment();
            if (s) setStarted(s);
          })
        }
        className={`${anim(3)} ${authPrimary}`}
      >
        {pending ? "Starting…" : "Start"}
      </button>
    );

  const key = new URL(started.uri).searchParams.get("secret");
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const code = String(new FormData(e.currentTarget).get("code"));
        start(async () => {
          const result = await confirmEnrollment(code);
          if (result !== "ok") return setError(result ?? null);
          router.replace("/admin");
          router.refresh();
        });
      }}
    >
      <div className={anim(1)}>
        <p className="text-sm font-medium text-ink">1. Scan this with your authenticator app</p>
        <p className="mt-1 text-sm text-muted">Open Google Authenticator, Microsoft Authenticator, Authy or 1Password on your phone, add an account, and point the camera here.</p>
        <Qr value={started.uri} />
        <p className="mt-3 text-sm text-muted">
          Can&rsquo;t scan? On this phone,{" "}
          <a href={started.uri} className={authLink}>
            open this link
          </a>
          , or add a time-based account by hand with this key:
        </p>
        <p className="mt-2 rounded-2xl border border-hairline bg-ink/5 p-4 font-mono text-sm break-all select-all">{key}</p>
      </div>

      <div className={anim(2)}>
        <p className="text-sm font-medium text-ink">2. Keep these backup codes somewhere safe</p>
        <p className="mt-1 text-sm text-muted">Each works once if you lose your phone. They are not shown again.</p>
        <ul className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-hairline bg-ink/5 p-4 font-mono text-sm select-all">
          {started.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>

      <div className={anim(3)}>
        <label htmlFor="code" className={authLabel}>
          3. Enter the 6-digit code it shows
        </label>
        <div className={authField}>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="Enter the 6-digit code"
            aria-invalid={!!error}
            aria-describedby={error ? "enroll-error" : undefined}
            className={authCode}
          />
        </div>
        {error && (
          <p id="enroll-error" role="alert" className={authError}>
            {error}
          </p>
        )}
      </div>

      <button disabled={pending} className={`${anim(4)} ${authPrimary}`}>
        {pending ? "Checking…" : "Turn on"}
      </button>
    </form>
  );
}
