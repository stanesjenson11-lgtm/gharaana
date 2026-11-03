import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { phone } from "@/lib/format";
import { requireUser, staffGate } from "@/lib/session";
import { TICKET_STATUS as STATUS, ticketThread, topicLabel } from "@/lib/support";
import { closeTicketAction } from "../actions";
import { ReplyForm } from "../forms";

export const metadata: Metadata = { title: "Support request | Gharaana", robots: { index: false } };

const stamp = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default function TicketPage({ params }: PageProps<"/help/[id]">) {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Ticket params={params} />
      </Suspense>
    </main>
  );
}

async function Ticket({ params }: Pick<PageProps<"/help/[id]">, "params">) {
  const { id: raw } = await params;
  const me = await requireUser(`/help/${raw}`);
  const staff = (await staffGate("support")).gate === "ok"; // support staff past their authenticator; anyone else sees only their own
  const id = Number(raw);
  const t = Number.isInteger(id) ? await ticketThread(id, { id: me.id, staff }) : undefined;
  if (!t) notFound();

  return (
    <>
      <Link href={staff && t.userId !== me.id ? "/admin/support" : "/help"} className="text-[15px] text-indigo hover:underline">
        {staff && t.userId !== me.id ? "All support requests" : "Help and support"}
      </Link>
      <header className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.75rem] leading-tight font-semibold">{topicLabel(t.topic)}</h1>
        <span className={`rounded px-1.5 py-0.5 text-[13px] font-semibold ${STATUS[t.status][1]}`}>{STATUS[t.status][0]}</span>
      </header>
      {t.listingId && (
        <p className="mt-1 text-muted">
          About{" "}
          <Link href={`/homes/${t.listingId}`} className="text-indigo hover:underline">
            {t.listingTitle}
          </Link>
        </p>
      )}
      {staff && t.userId !== me.id && (
        <p className="mt-1 text-muted tabular-nums">
          From {t.personName || "No name"}, {t.personPhone ? phone(t.personPhone) : "no phone"}
          {" · "}
          <Link href={`/admin/docket?subject=ticket:${t.id}`} className="font-semibold text-indigo hover:underline">
            Add to docket
          </Link>
        </p>
      )}

      <ol className="mt-6 grid gap-3">
        {t.messages.map((m) => (
          <li key={m.id} className={`rounded-xl p-4 ${m.fromStaff ? "bg-surface" : "border border-hairline"}`}>
            <p className="text-[13px] font-semibold text-muted">
              {m.fromStaff ? "Gharaana team" : staff && t.userId !== me.id ? t.personName || "Them" : "You"} · {stamp(m.createdAt)}
            </p>
            <p className="mt-1 break-words whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>

      <ReplyForm id={t.id} staff={staff && t.userId !== me.id} />
      {staff && t.status !== "closed" && (
        <form action={closeTicketAction.bind(null, t.id)} className="mt-3">
          <button className="h-10 cursor-pointer rounded-full border border-hairline px-5 font-semibold hover:border-muted">Close this request</button>
        </form>
      )}
    </>
  );
}
