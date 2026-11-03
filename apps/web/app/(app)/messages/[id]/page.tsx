import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChatThread } from "@/components/chat/chat-thread";
import { conversationFor, messagesAfter } from "@/lib/chat";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Messages | Gharaana", robots: { index: false } };

export default function ThreadPage({ params }: PageProps<"/messages/[id]">) {
  return (
    <main className="mx-auto flex h-[calc(100svh-4rem)] max-w-3xl flex-col px-4 sm:px-6">
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-xl bg-surface" />}>
        <Thread params={params} />
      </Suspense>
    </main>
  );
}

async function Thread({ params }: Pick<PageProps<"/messages/[id]">, "params">) {
  const { id: raw } = await params;
  const me = await requireUser(`/messages/${raw}`);
  const id = Number(raw);
  // Someone else's thread is a plain 404, the same as one that doesn't exist.
  const c = Number.isInteger(id) ? await conversationFor(id, me.id) : undefined;
  if (!c) notFound();
  const initial = (await messagesAfter(id, me.id)) ?? [];

  return (
    <>
      <header className="flex items-center gap-3 border-b border-hairline py-4">
        <Link href="/messages" aria-label="All messages" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-surface">
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
            <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg leading-tight font-semibold">{c.otherName || (c.side === "buyer" ? "The owner" : "A buyer")}</h1>
          <Link href={`/homes/${c.listingId}`} className="block truncate text-[14px] text-muted hover:text-ink hover:underline">
            {c.title}
          </Link>
        </div>
      </header>
      <ChatThread id={id} initial={initial} />
    </>
  );
}
