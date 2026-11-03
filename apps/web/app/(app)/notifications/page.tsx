import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RefreshOnMount } from "@/components/refresh-on-mount";
import { latestNotifications, markAllRead } from "@/lib/notify";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Alerts | Gharaana", robots: { index: false } };

const stamp = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function NotificationsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Alerts />
      </Suspense>
    </main>
  );
}

async function Alerts() {
  const me = await requireUser("/notifications");
  const list = await latestNotifications(me.id);
  // Seeing the list reads it; the bell in the header catches up via the refresh below.
  if (list.some((n) => !n.readAt)) await markAllRead(me.id);

  return (
    <>
      <RefreshOnMount />
      <h1 className="text-[2rem] leading-tight font-semibold">Alerts</h1>
      {list.length === 0 ? (
        <p className="mt-4 border-t border-hairline pt-6 text-muted">
          Nothing yet. You&rsquo;ll hear here when an owner answers you, when someone asks about your home, and when a new home matches a saved search.
        </p>
      ) : (
        <ul className="mt-6">
          {list.map((n) => (
            <li key={n.id} className="border-t border-hairline">
              <Link href={n.href} className="-mx-3 flex items-start gap-3 rounded-lg px-3 py-4 hover:bg-surface">
                <span aria-hidden="true" className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-indigo"}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block ${n.readAt ? "" : "font-semibold"}`}>
                    {n.text}
                    {!n.readAt && <span className="sr-only"> (new)</span>}
                  </span>
                  <span className="text-[13px] text-muted">{stamp(n.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
