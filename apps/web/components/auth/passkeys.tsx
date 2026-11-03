"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { authClient } from "@/lib/auth-client";

type Key = { id: string; name?: string | null; createdAt?: string | Date | null; backedUp?: boolean };

const noop = () => () => {};
const primary = "h-9 cursor-pointer rounded-full bg-indigo px-4 text-[14px] font-semibold text-canvas hover:bg-indigo-deep disabled:cursor-default disabled:opacity-60";
const secondary = "h-9 cursor-pointer rounded-full border border-hairline px-4 text-[14px] font-semibold hover:border-muted disabled:cursor-default disabled:opacity-60";

/** A label for the passkey from the device it was made on, e.g. "Android phone" (the browser's sheet can rename it). */
function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}

const added = (d: Key["createdAt"]) =>
  d ? `Added ${new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "";

/**
 * Passkeys on this account: sign in with Face ID, a fingerprint or the device PIN instead of a text-message code.
 * Adding one needs a fresh sign-in (better-auth checks), so someone using a forgotten, open session can't add theirs.
 */
export function Passkeys() {
  const supported = useSyncExternalStore(noop, () => typeof window.PublicKeyCredential === "function", () => true);
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = () => authClient.passkey.listUserPasskeys().then(({ data }) => setKeys((data ?? []) as Key[]));
  useEffect(() => { load(); }, []);

  const add = () => start(async () => {
    setNote(null);
    const { error } = await authClient.passkey.addPasskey({ name: deviceName() });
    if (error) {
      if (/cancel|abort|not allowed/i.test(error.message ?? "")) return; // closing the browser's sheet is a choice
      setNote(error.status === 403
        ? "For your safety, adding a passkey needs a recent sign-in. Sign out, sign in again, then add it."
        : error.message || "That didn't work. Try again.");
      return;
    }
    await load();
    setNote("Passkey added. Next time, choose “Sign in with a passkey”.");
  });

  const remove = (id: string) => start(async () => {
    setNote(null);
    const { error } = await authClient.passkey.deletePasskey({ id });
    if (error) return setNote(error.message || "That didn't work. Try again.");
    await load();
  });

  return (
    <section aria-labelledby="passkeys" className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="passkeys" className="text-xl font-semibold">Passkeys</h2>
        {supported && <button type="button" onClick={add} disabled={pending} className={primary}>{pending ? "Working…" : "Add a passkey"}</button>}
      </div>
      <p className="mt-1 text-[14px] text-muted">
        {supported
          ? "Sign in with Face ID, your fingerprint or your device PIN instead of a text-message code. A passkey stays on your device and can't be phished."
          : "This browser can't use passkeys. Try a recent Chrome, Safari, Edge or Firefox."}
      </p>
      {note && <p role="status" className="mt-3 text-[14px]">{note}</p>}
      {keys && keys.length > 0 && (
        <ul className="mt-4">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline py-3">
              <span>
                <span className="font-medium">{k.name || "Passkey"}</span>
                <span className="ml-2 text-[14px] text-muted">{[added(k.createdAt), k.backedUp ? "synced" : ""].filter(Boolean).join(", ")}</span>
              </span>
              <button type="button" onClick={() => remove(k.id)} disabled={pending} className={secondary} aria-label={`Remove ${k.name || "passkey"}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
