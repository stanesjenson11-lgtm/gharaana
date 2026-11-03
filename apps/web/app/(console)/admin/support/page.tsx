import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { daysAgo, phone } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { supportQueue, topicLabel } from "@/lib/support";

export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

const TABS = [
  ["open", "Waiting for us"],
  ["answered", "Waiting for them"],
  ["closed", "Closed"],
] as const;

const ago = (d: Date) => daysAgo(Math.floor((Date.now() - d.getTime()) / 86_400_000));

export default function SupportQueuePage({ searchParams }: PageProps<"/admin/support">) {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Queue({ searchParams }: Pick<PageProps<"/admin/support">, "searchParams">) {
  await requireAdmin("support");
  const raw = (await searchParams).status;
  const status = TABS.find(([v]) => v === raw)?.[0] ?? "open";
  const tickets = await supportQueue(status);

  return (
    <>
      <h1 className="text-[2rem] leading-tight font-semibold">Support</h1>
      <nav aria-label="Status" className="mt-5 flex flex-wrap gap-2 text-[14px] font-medium">
        {TABS.map(([v, l]) => (
          <Link
            key={v}
            href={`/admin/support?status=${v}`}
            aria-current={v === status ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 ${v === status ? "border-ink bg-surface" : "border-hairline text-muted hover:text-ink"}`}
          >
            {l}
          </Link>
        ))}
      </nav>
      {tickets.length === 0 ? (
        <p className="mt-8 border-t border-hairline pt-6 text-muted">Nothing here.</p>
      ) : (
        <ul className="mt-6">
          {tickets.map((t) => (
            <li key={t.id} className="border-t border-hairline">
              <Link href={`/help/${t.id}`} className="-mx-3 block rounded-lg px-3 py-4 hover:bg-surface">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={`font-medium ${t.topic === "report" ? "text-danger" : ""}`}>{topicLabel(t.topic)}</span>
                  <span className="text-[13px] text-muted">{ago(t.updatedAt)}</span>
                </span>
                <span className="block text-[14px] text-muted tabular-nums">
                  {t.name || "No name"}, {t.phone ? phone(t.phone) : "no phone"}
                  {t.listingTitle && ` · ${t.listingTitle}`}
                </span>
                <span className="mt-1 block truncate text-[15px]">{t.first}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
