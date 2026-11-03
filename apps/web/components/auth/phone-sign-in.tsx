"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { signOutAndReload } from "@/lib/sign-out";
import { Turnstile } from "./turnstile";
import { anim, authCode, authError, authField, authInput, authLabel, authLead, authLink, authNotice, authOutline, authPrimary, authTitle, authTitleText } from "./ui";

type AuthError = { code?: string; status?: number; message?: string };

function explain(e: AuthError) {
  // 429 is the per-connection limit in lib/auth.ts, so it isn't about the number typed.
  if (e.code === "INVALID_OTP") return "That code doesn't match. Check the message and try again.";
  if (e.code === "INVALID_EMAIL") return "Enter a valid email address.";
  if (e.code === "OTP_EXPIRED") return "That code has expired. Send a new one.";
  if (e.code === "TOO_MANY_ATTEMPTS") return "Too many wrong codes. Send a new one.";
  if (e.code === "INVALID_PHONE_NUMBER") return "Enter a 10-digit Indian mobile number.";
  if (e.code === "PHONE_NUMBER_EXIST") return "That number already has a Gharaana account. Sign in with it, or use another number.";
  if (e.code === "BOT_DETECTED" || e.status === 403) return "Security verification failed. Please try again.";
  return e.message || "Something went wrong. Try again.";
}

// The design's Google mark.
const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-5 w-5" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
  </svg>
);
const KeyMark = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="15" r="4" />
    <path d="m10.85 12.15 8.65-8.65M17 6l2.5 2.5M14.5 8.5l2 2" />
  </svg>
);
const AppleMark = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
    <path d="M16.37 12.63c-.03-2.4 1.96-3.56 2.05-3.62-1.12-1.63-2.86-1.86-3.48-1.88-1.48-.15-2.89.87-3.64.87-.75 0-1.91-.85-3.14-.83-1.62.02-3.11.94-3.94 2.39-1.68 2.92-.43 7.24 1.21 9.6.8 1.16 1.76 2.45 3.01 2.4 1.21-.05 1.67-.78 3.13-.78 1.46 0 1.87.78 3.15.75 1.3-.02 2.12-1.17 2.91-2.34.92-1.34 1.3-2.64 1.32-2.7-.03-.01-2.53-.97-2.58-3.86ZM14 5.5c.66-.8 1.11-1.92.99-3.03-.95.04-2.1.64-2.78 1.43-.61.7-1.14 1.84-1 2.93 1.06.08 2.14-.54 2.79-1.33Z" />
  </svg>
);

/**
 * Sign in, sign up, or (link) confirm the mobile number of someone who signed in with Google or Apple. All three end in
 * the same 6-digit SMS code: creating an account is signing in for the first time, so "sign up" only changes the words.
 */
export function PhoneSignIn({
  next,
  providers,
  dev,
  link = false,
  failed = false,
  notice,
  sms = true,
}: {
  next: string;
  providers: { google: boolean; apple: boolean };
  dev: boolean;
  link?: boolean;
  failed?: boolean;
  notice?: string;
  /** Text-message codes are set up (lib/sms.ts). Without them, signing in is by email code. */
  sms?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  // Confirming a mobile number (link) is always by text message; signing in can be by email or text message.
  const [method, setMethod] = useState<"email" | "phone">(link || sms ? "phone" : "email");
  const byEmail = method === "email";
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [check, setCheck] = useState(0); // a Turnstile token works once; a new key remounts the widget for a fresh one
  const [error, setError] = useState<string | null>(failed ? "We couldn't sign you in with that account. Try again, or use your mobile number." : null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, start] = useTransition();
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const e164 = `+91${phone}`;

  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // A passkey (Face ID, fingerprint, device PIN) signs in an account that added one under Account. /after-sign-in then
  // decides the door exactly as for a text-message sign-in.
  const goPasskey = async () => {
    setError(null);
    setSigningIn("passkey");
    const { error } = await authClient.signIn.passkey();
    if (error) {
      setSigningIn(null);
      // Closing the browser's passkey sheet is a choice, not an error.
      if (("code" in error && error.code === "AUTH_CANCELLED") || /cancel|abort|not allowed/i.test(error.message ?? "")) return;
      // 403 is the account itself (suspended, lib/auth.ts), so say what the server said
      return setError(error.status === 403 && error.message ? error.message : "That passkey didn't work here. Sign in with a code, then add a passkey under Account.");
    }
    router.replace(`/after-sign-in?next=${encodeURIComponent(next)}`);
  };

  const goSocial = (provider: "google" | "apple") => {
    setError(null);
    // The button is always shown, as in the design; until the client's Google keys are set it says so instead of failing.
    if (!providers[provider]) return setError(`${provider === "google" ? "Google" : "Apple"} sign-in isn't switched on yet. Use ${sms ? "your mobile number" : "an email code"} for now.`);
    setSigningIn(provider);
    // /after-sign-in sends team members to the console and asks everyone else for their mobile number if it's missing.
    authClient.signIn.social({
      provider,
      callbackURL: `/after-sign-in?next=${encodeURIComponent(next)}`,
      errorCallbackURL: `/sign-in?error=1&next=${encodeURIComponent(next)}`,
    });
  };

  const send = () =>
    start(async () => {
      setError(null);
      const fetchOptions = { headers: turnstileToken ? { "x-turnstile-token": turnstileToken } : {} };
      const { error } = byEmail
        ? await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in", fetchOptions })
        : await authClient.phoneNumber.sendOtp({ phoneNumber: e164, fetchOptions });
      setTurnstileToken(null);
      setCheck((n) => n + 1);
      if (error) return setError(explain(error));
      setStep("code");
      setCooldown(30);
    });

  const verify = (code: string) =>
    start(async () => {
      setError(null);
      const { error } = byEmail
        ? await authClient.signIn.emailOtp({ email: email.trim(), otp: code })
        : await authClient.phoneNumber.verify({ phoneNumber: e164, code, ...(link && { updatePhoneNumber: true }) });
      if (error) return setError(explain(error));
      // Who just signed in decides the page: /after-sign-in redirects to the console or to where they were going.
      router.replace(`/after-sign-in?next=${encodeURIComponent(next)}`);
      router.refresh();
    });

  const signOut = () =>
    start(async () => {
      await signOutAndReload("user");
    });

  const turnstile = <Turnstile key={check} onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />;
  const errorLine = error && (
    <p id="auth-error" role="alert" className={authError}>
      {error}
    </p>
  );

  if (step === "code") {
    return (
      <>
        <h1 key="code-title" className={`${anim(1)} ${authTitle}`}>
          <span className={authTitleText}>Enter the code</span>
        </h1>
        <p className={`${anim(2)} ${authLead} tabular-nums`}>
          We sent a 6-digit code to{" "}
          <span className="whitespace-nowrap">{byEmail ? email.trim() : `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`}</span>
          .{" "}
          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setError(null);
            }}
            className={authLink}
          >
            {byEmail ? "Change email" : "Change number"}
          </button>
        </p>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            verify(String(new FormData(e.currentTarget).get("code")));
          }}
        >
          <div className={anim(3)}>
            <label htmlFor="code" className={authLabel}>
              6-digit code
            </label>
            <div className={authField}>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder={byEmail ? "Enter the code from the email" : "Enter the code from the SMS"}
                aria-invalid={!!error}
                aria-describedby={error ? "auth-error" : undefined}
                onChange={(e) => e.target.value.length === 6 && !pending && verify(e.target.value)}
                className={authCode}
              />
            </div>
            {errorLine}
          </div>

          <div className={`${anim(4)} flex items-center justify-between text-sm`}>
            <span className="text-ink/90">Didn&rsquo;t get it?</span>
            <button type="button" disabled={cooldown > 0 || pending || !turnstileToken} onClick={send} className={`${authLink} disabled:cursor-default disabled:text-muted disabled:no-underline`}>
              {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
            </button>
          </div>

          <button type="submit" disabled={pending} className={`${anim(5)} ${authPrimary}`}>
            {pending ? "Checking…" : link ? "Confirm" : mode === "sign-up" ? "Create account" : "Sign In"}
          </button>
        </form>
        {turnstile}
        {dev && <p className={`${anim(6)} text-center text-xs text-muted`}>Development: the code is printed in the terminal running the dev server.</p>}
      </>
    );
  }

  const title = link ? "Confirm your number" : mode === "sign-up" ? "Create account" : "Welcome";
  return (
    <>
      <h1 key={title} className={`${anim(1)} ${authTitle}`}>
        <span className={authTitleText}>{title}</span>
      </h1>
      <p className={`${anim(2)} ${authLead}`}>
        {link
          ? "A confirmed mobile number is required to use Gharaana. We'll text you a 6-digit code."
          : mode === "sign-up"
            ? byEmail
              ? "Join with your email. We'll send you a 6-digit code, and that's all it takes."
              : "Join with your mobile number. We'll text you a 6-digit code, and that's all it takes."
            : "Access your account and continue your journey with us"}
      </p>
      {notice && <p className={`${anim(2)} ${authNotice}`}>{notice}</p>}

      {!link && (
        // How the code arrives. Text messages show as off until MSG91 is set up (lib/sms.ts).
        <div role="radiogroup" aria-label="Get your code by" className={`${anim(3)} grid grid-cols-2 gap-1 rounded-full bg-ink/5 p-1 text-sm font-medium`}>
          {(["email", "phone"] as const).map((m) => {
            const off = m === "phone" && !sms;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                disabled={off}
                onClick={() => { setMethod(m); setError(null); }}
                className={`h-9 cursor-pointer rounded-full transition ${method === m ? "bg-canvas text-ink shadow-sm" : "text-muted"} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {m === "email" ? "Email" : off ? "Mobile (off for now)" : "Mobile"}
              </button>
            );
          })}
        </div>
      )}

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {byEmail ? (
          <div className={anim(3)}>
            <label htmlFor="email" className={authLabel}>
              Email
            </label>
            <div className={authField}>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                maxLength={254}
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? "auth-error" : undefined}
                className={`${authInput} px-4`}
              />
            </div>
            {errorLine}
          </div>
        ) : (
        <div className={anim(3)}>
          <label htmlFor="phone" className={authLabel}>
            Mobile Number
          </label>
          <div className={`${authField} flex items-center`}>
            <span className="pl-4 text-sm text-muted tabular-nums">+91</span>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              autoFocus
              required
              pattern="[6-9][0-9]{9}"
              maxLength={10}
              title="A 10-digit Indian mobile number"
              placeholder="Enter your mobile number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              aria-invalid={!!error}
              aria-describedby={error ? "auth-error" : undefined}
              className={`${authInput} pl-2 tabular-nums`}
            />
          </div>
          {errorLine}
        </div>
        )}
        {turnstile}
        <button type="submit" disabled={pending || !turnstileToken} className={`${anim(4)} ${authPrimary}`}>
          {pending ? "Sending…" : "Send code"}
        </button>
      </form>

      {!link && (
        <>
          <div className={`${anim(5)} relative flex items-center justify-center`}>
            <span className="w-full border-t border-hairline" />
            <span className="absolute bg-canvas px-4 text-sm text-muted">Or continue with</span>
          </div>
          <button type="button" disabled={!!signingIn} onClick={() => goSocial("google")} className={`${anim(6)} ${authOutline}`}>
            <GoogleIcon />
            {signingIn === "google" ? "Opening Google…" : "Continue with Google"}
          </button>
          {providers.apple && (
            <button type="button" disabled={!!signingIn} onClick={() => goSocial("apple")} className={`${anim(7)} ${authOutline}`}>
              <AppleMark />
              {signingIn === "apple" ? "Opening Apple…" : "Continue with Apple"}
            </button>
          )}
          {mode === "sign-in" && (
            <button type="button" disabled={!!signingIn} onClick={goPasskey} className={`${anim(7)} ${authOutline}`}>
              <KeyMark />
              {signingIn === "passkey" ? "Waiting for your passkey…" : "Sign in with a passkey"}
            </button>
          )}
        </>
      )}

      {link ? (
        <p className={`${anim(8)} text-center text-sm text-muted`}>
          Not you?{" "}
          <button type="button" onClick={signOut} disabled={pending} className={authLink}>
            Sign out
          </button>
        </p>
      ) : (
        <p className={`${anim(8)} text-center text-sm text-muted`}>
          {mode === "sign-in" ? "New to Gharaana? " : "Already have an account? "}
          <button type="button" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")} className={authLink}>
            {mode === "sign-in" ? "Create Account" : "Sign In"}
          </button>
        </p>
      )}
    </>
  );
}
