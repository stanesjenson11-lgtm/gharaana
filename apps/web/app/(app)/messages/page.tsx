import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { inbox } from "@/lib/chat";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Messages | Gharaana", robots: { index: false } };

const IST = "Asia/Kolkata";
const when = (d: Date) =>
  d.toLocaleDateString("en-CA", { timeZone: IST }) === new Date().toLocaleDateString("en-CA", { timeZone: IST })
    ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: IST })
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: IST });

export default function MessagesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Inbox />
      </Suspense>
    </main>
  );
}

async function Inbox() {
  const me = await requireUser("/messages");
  const threads = await inbox(me.id);

  return (
    <>
      <h1 className="text-[2rem] leading-tight font-semibold">Messages</h1>
      {threads.length === 0 ? (
        <p className="mt-4 border-t border-hairline pt-6 text-muted">
          No conversations yet. Use &ldquo;Chat with the owner&rdquo; on any home to ask a question.
        </p>
      ) : (
        <ul className="mt-6">
          {threads.map((c) => (
            <li key={c.id} className="border-t border-hairline">
              <Link href={`/messages/${c.id}`} className="-mx-3 flex items-start gap-4 rounded-lg px-3 py-4 hover:bg-surface">
                <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo/10 font-semibold text-indigo">
                  {(c.otherName || "?")[0].toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={`truncate ${c.unread ? "font-semibold" : "font-medium"}`}>{c.otherName || (c.mineIsBuyer ? "The owner" : "A buyer")}</span>
                    <span className="shrink-0 text-[13px] text-muted">{when(c.lastMessageAt)}</span>
                  </span>
                  <span className="block truncate text-[14px] text-muted">
                    {c.mineIsBuyer ? "About " : "Asking about "}
                    {c.title}
                  </span>
                  <span className={`block truncate text-[15px] ${c.unread ? "text-ink" : "text-muted"}`}>{c.last ?? "No messages yet"}</span>
                </span>
                {c.unread > 0 && (
                  <span className="mt-1 rounded-full bg-indigo px-2 py-0.5 text-[12px] font-semibold text-canvas tabular-nums">
                    {c.unread}
                    <span className="sr-only"> unread</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
