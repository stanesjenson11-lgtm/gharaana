import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { phone } from "@/lib/format";
import { listings } from "@/lib/schema";
import { getMember } from "@/lib/session";
import { isTopic, TICKET_STATUS as STATUS, ticketsOf, topicLabel } from "@/lib/support";
import { TicketForm } from "./forms";

export const metadata: Metadata = { title: "Help and support | Gharaana", description: "Call us, or write to our team about your account, a listing, or a broker posing as an owner." };

export default function HelpPage({ searchParams }: PageProps<"/help">) {
  const support = process.env.SUPPORT_PHONE;
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6">
      <h1 className="text-[2rem] leading-tight font-semibold">Help and support</h1>
      {support && (
        <p className="mt-3 text-lg">
          Call us on{" "}
          <a href={`tel:${support}`} className="font-semibold text-indigo tabular-nums hover:underline">
            {phone(support)}
          </a>
          , or write to us below.
        </p>
      )}
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-xl bg-surface" />}>
        <Help searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Help({ searchParams }: Pick<PageProps<"/help">, "searchParams">) {
  const { topic, listing: listingId } = await searchParams;
  const session = await getMember();
  const next = `/help${topic || listingId ? `?${new URLSearchParams({ ...(isTopic(topic) && { topic }), ...(typeof listingId === "string" && { listing: listingId }) })}` : ""}`;
  if (!session)
    return (
      <p className="mt-8 border-t border-hairline pt-6 text-muted">
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="font-semibold text-indigo hover:underline">
          Sign in
        </Link>{" "}
        to write to our team, so we can reply to you here.
      </p>
    );
  const [listing] = typeof listingId === "string" ? await db.select({ id: listings.id, title: listings.title }).from(listings).where(eq(listings.id, listingId.slice(0, 200))) : [];
  const mine = await ticketsOf(session.user.id);

  return (
    <>
      <section aria-labelledby="write" className="mt-8 border-t border-hairline pt-6">
        <h2 id="write" className="text-xl font-semibold">
          Write to our team
        </h2>
        <p className="mt-1 text-muted">We usually reply within a working day. You&rsquo;ll see the answer here.</p>
        <TicketForm topic={isTopic(topic) ? topic : undefined} listing={listing} />
      </section>

      {mine.length > 0 && (
        <section aria-labelledby="mine" className="mt-12">
          <h2 id="mine" className="text-xl font-semibold">
            Your requests
          </h2>
          <ul className="mt-4">
            {mine.map((t) => (
              <li key={t.id} className="border-t border-hairline">
                <Link href={`/help/${t.id}`} className="-mx-3 flex items-center justify-between gap-4 rounded-lg px-3 py-3 hover:bg-surface">
                  <span className="font-medium">{topicLabel(t.topic)}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ${STATUS[t.status][1]}`}>{STATUS[t.status][0]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
