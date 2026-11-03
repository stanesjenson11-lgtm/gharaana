"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { idlePhase, TOUCH_EVERY_MS, WARN_MS } from "@/lib/idle";
import { signOutAndReload } from "@/lib/sign-out";

const KEY = "dn_last_activity"; // shared by every open tab, so activity in one keeps all of them signed in
const CALL = { method: "POST", headers: { "x-requested-with": "dn", "content-type": "application/json" }, keepalive: true } as const;

const ACTIVITY = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

/**
 * Signs people out when they leave the page idle: after five quiet minutes a dialog asks whether to stay, and with no
 * answer for a minute they are signed out. Only the button keeps the session; scrolling or moving the mouse behind the
 * dialog doesn't. The server keeps its own count (lib/idle.ts), so this is the courtesy and not the only lock.
 * Shown only to signed-in people: whoever mounts it has already checked.
 */
export function IdleGuard() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const memory = useRef(0); // when storage is blocked, this tab counts alone
  const lastTouch = useRef(0);
  const ending = useRef(false);

  const read = () => {
    try {
      return Number(localStorage.getItem(KEY)) || memory.current;
    } catch {
      return memory.current;
    }
  };
  const write = (t: number) => {
    memory.current = t;
    try {
      localStorage.setItem(KEY, String(t));
    } catch {}
  };

  const end = useCallback(
    async (reason: "idle" | "user") => {
      if (ending.current) return;
      ending.current = true;
      const back = `${window.location.pathname}${window.location.search}`;
      await signOutAndReload(reason, reason === "idle" ? `/sign-in?idle=1&next=${encodeURIComponent(back)}` : "/");
    },
    [],
  );

  // "I'm here", to the server: at most once a minute while active, and always when they answer the warning.
  const touch = useCallback(
    async (force = false) => {
      const now = Date.now();
      if (!force && now - lastTouch.current < TOUCH_EVERY_MS) return true;
      lastTouch.current = now;
      const res = await fetch("/api/session/touch", CALL).catch(() => null);
      return res ? res.ok : true; // a network blip isn't a sign-out; the server's own count decides
    },
    [],
  );

  const stay = useCallback(async () => {
    write(Date.now());
    setSeconds(null);
    dialog.current?.close();
    if (!(await touch(true))) void end("idle"); // the server had already let go
  }, [touch, end]);

  useEffect(() => {
    write(Date.now()); // opening the page is activity
    let moved = 0;
    const active = () => {
      if (idlePhase(read(), Date.now()).phase === "warning") return; // during the warning only the button counts
      write(Date.now());
      void touch().then((ok) => {
        if (!ok) void end("idle");
      });
    };
    const pointer = () => {
      if (Date.now() - moved > 1000) {
        moved = Date.now();
        active();
      }
    };
    const tick = () => {
      const p = idlePhase(read(), Date.now());
      if (p.phase === "expired") return void end("idle");
      if (p.phase === "active") {
        setSeconds(null);
        if (dialog.current?.open) dialog.current.close(); // answered in another tab
        return;
      }
      setSeconds(p.secondsLeft);
      if (dialog.current && !dialog.current.open) dialog.current.showModal();
    };
    for (const e of ACTIVITY) window.addEventListener(e, active, { passive: true, capture: true });
    window.addEventListener("pointermove", pointer, { passive: true });
    document.addEventListener("visibilitychange", tick);
    const id = window.setInterval(tick, 1000);
    return () => {
      for (const e of ACTIVITY) window.removeEventListener(e, active, { capture: true });
      window.removeEventListener("pointermove", pointer);
      document.removeEventListener("visibilitychange", tick);
      window.clearInterval(id);
    };
  }, [touch, end]);

  const left = seconds ?? 0;
  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby="idle-title"
      aria-describedby="idle-text"
      onCancel={(e) => {
        e.preventDefault(); // Escape is an answer: they are here
        void stay();
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-[22px] border border-hairline bg-canvas p-6 text-ink backdrop:bg-ink/40"
    >
      <h2 id="idle-title" className="text-[1.25rem] leading-tight font-semibold">
        Still there?
      </h2>
      <p id="idle-text" className="mt-2 text-muted">
        There has been no activity for a few minutes. For your safety you&rsquo;ll be signed out in <span className="font-semibold text-ink tabular-nums">{left}</span> {left === 1 ? "second" : "seconds"}.
      </p>
      <div aria-hidden="true" className="mt-4 h-2 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-indigo" style={{ width: `${Math.min(100, (left * 1000 * 100) / WARN_MS)}%` }} />
      </div>
      {/* Spoken once as it opens and at 30 and 10 seconds, not every second. */}
      <p className="sr-only" aria-live="assertive">
        {left > 0 && (left === 60 || left === 30 || left === 10) ? `You will be signed out in ${left} seconds. Choose stay signed in to continue.` : ""}
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button autoFocus onClick={() => void stay()} className="h-11 cursor-pointer rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep">
          Stay signed in
        </button>
        <button onClick={() => void end("user")} className="h-11 cursor-pointer rounded-full border border-hairline px-6 font-semibold hover:border-muted">
          Sign out now
        </button>
      </div>
    </dialog>
  );
}
