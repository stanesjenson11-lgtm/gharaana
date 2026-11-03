import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, CardHead } from "@/components/console/card";
import { Avatar } from "@/components/nav/avatar";
import { clientDetail } from "@/lib/clients";
import { STAGES } from "@/lib/crm";
import { phone } from "@/lib/format";
import { LISTING_STATUS, LISTING_STATUS_STYLE, type ListingStatus } from "@/lib/labels";
import { can, isStaffRole, ROLE_LABEL } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import { TICKET_STATUS, topicLabel } from "@/lib/support";
import { setUserBanned } from "../../actions";
import { NoteForm } from "./note-form";

// Neutral title: the static shell is served to everyone, and the page shouldn't advertise itself.
export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

export default function ClientPage({ params }: PageProps<"/admin/clients/[id]">) {
  return (
    <main className="pt-4 pb-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[22px] bg-surface" />}>
        <Client params={params} />
      </Suspense>
    </main>
  );
}

const day = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const stamp = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const stage = (s: string) => STAGES.find(([k]) => k === s)?.[1] ?? s;
const badge = "rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap";
const empty = "mt-4 rounded-2xl bg-canvas p-4 text-[14px] text-muted";
const row = "flex items-baseline justify-between gap-3 rounded-2xl px-3 py-2.5 hover:bg-canvas";

async function Client({ params }: Pick<PageProps<"/admin/clients/[id]">, "params">) {
  const me = await requireAdmin("users");
  const { id } = await params;
  const d = await clientDetail(id);
  if (!d) notFound();
  const { person, homes, requests, support, notes, activity, totals } = d;
  const staffAccount = isStaffRole(person.role);
  const myRole = me.role;
  const editHomes = can(myRole, "listings");
  const openTickets = support.filter((t) => t.status === "open").length;

  const figures = [
    [homes.length, "homes listed"],
    [requests.length, "visit or callback requests"],
    [openTickets, "support requests open"],
    [totals.numbersSeen, "owner numbers viewed"],
    [totals.savedHomes, "saved homes"],
    [totals.chats, "chats started"],
  ] as const;

  return (
    <>
      <Link href="/admin/clients" className="inline-flex h-10 items-center text-[15px] font-medium text-indigo hover:underline">
        All clients
      </Link>

      <header className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-4">
        <Avatar name={person.name} image={person.image} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[2rem] leading-[1.1] font-medium tracking-[-0.03em] md:text-[2.5rem]">
            {person.name || "No name"}
            {person.banned && <span className={`${badge} bg-danger/10 text-danger`}>Suspended</span>}
            {staffAccount && <span className={`${badge} bg-indigo/10 text-indigo`}>{ROLE_LABEL[person.role as keyof typeof ROLE_LABEL]}</span>}
          </h1>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-muted">
            {person.phone ? (
              <a href={`tel:${person.phone}`} className="tabular-nums hover:text-ink">
                {phone(person.phone)}
                {person.phoneVerified ? "" : " (not confirmed)"}
              </a>
            ) : (
              <span>No phone number yet</span>
            )}
            {!person.email.endsWith(".invalid") && <span>{person.email}</span>}
            <span>Joined {day(person.createdAt)}</span>
          </p>
        </div>
        <Link href={`/admin/docket?subject=client:${person.id}`} className="inline-flex h-11 items-center rounded-full border border-hairline px-5 font-semibold hover:border-muted">
          Add to docket
        </Link>
        {!staffAccount && me.id !== person.id && (
          <form action={setUserBanned.bind(null, person.id, !person.banned)}>
            <button className={`h-11 cursor-pointer rounded-full px-5 font-semibold ${person.banned ? "border border-hairline hover:border-muted" : "border border-danger text-danger hover:bg-danger/8"}`}>
              {person.banned ? "Lift suspension" : "Suspend"}
            </button>
          </form>
        )}
      </header>

      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {figures.map(([n, label]) => (
          <li key={label} className="rounded-[22px] bg-surface px-4 py-3.5">
            <span className="block text-[1.75rem] leading-none font-medium tracking-[-0.03em] tabular-nums">{n}</span>
            <span className="mt-1.5 block text-[13px] leading-snug text-muted">{label}</span>
          </li>
        ))}
      </ul>

      <div className="@container mt-4">
        <div className="grid grid-flow-row-dense gap-4 @3xl:grid-cols-2">
          <Card>
            <CardHead icon="home" title="Homes they listed" description={homes.length ? `${homes.length} in all` : undefined} />
            {homes.length === 0 ? (
              <p className={empty}>They haven&rsquo;t listed a home.</p>
            ) : (
              <ul className="mt-3">
                {homes.map((h) => (
                  <li key={h.id}>
                    <Link href={editHomes ? `/admin/listings/${h.id}` : `/homes/${h.id}`} className={row}>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{h.title}</span>
                        <span className="block text-[13px] text-muted">
                          {h.area} · listed {day(h.createdAt)}
                        </span>
                      </span>
                      <span className={`${badge} ${LISTING_STATUS_STYLE[h.status as ListingStatus]}`}>{LISTING_STATUS[h.status as ListingStatus]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead icon="leads" title="Visit and callback requests" description="Homes they asked about" href="/admin/leads" />
            {requests.length === 0 ? (
              <p className={empty}>No requests yet.</p>
            ) : (
              <ul className="mt-3">
                {requests.map((r) => (
                  <li key={r.id}>
                    <Link href="/admin/leads" className={row}>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{r.title}</span>
                        <span className="block text-[13px] text-muted">
                          {r.kind === "visit" ? "Visit" : "Callback"} · {stamp(r.createdAt)}
                        </span>
                      </span>
                      <span className={`${badge} bg-surface text-muted ring-1 ring-hairline`}>{stage(r.stage)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead icon="support" title="Support" description="What they wrote in about" href="/admin/support" />
            {support.length === 0 ? (
              <p className={empty}>No support requests.</p>
            ) : (
              <ul className="mt-3">
                {support.map((t) => (
                  <li key={t.id}>
                    <Link href={`/help/${t.id}`} className={row}>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{topicLabel(t.topic)}</span>
                        <span className="block text-[13px] text-muted">Last message {stamp(t.updatedAt)}</span>
                      </span>
                      <span className={`${badge} ${TICKET_STATUS[t.status][1]}`}>{TICKET_STATUS[t.status][0]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead icon="clock" title="Recent activity" description="What they did, and what the team did" />
            {activity.length === 0 ? (
              <p className={empty}>Nothing recorded yet.</p>
            ) : (
              <ul className="mt-3 text-[15px]">
                {activity.map((a, i) => (
                  <li key={i} className={row}>
                    <span className="block min-w-0 first-letter:uppercase">{a.text}</span>
                    <span className="shrink-0 text-[13px] text-muted tabular-nums">{stamp(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="@3xl:col-span-2">
            <CardHead icon="pages" title="Team notes" description="Private: clients and owners never see these" />
            <NoteForm clientId={person.id} />
            {notes.length > 0 && (
              <ul className="mt-5 space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-2xl bg-canvas p-4">
                    <p className="text-[15px] whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-2 text-[13px] text-muted">
                      {n.author || "A former team member"} · {stamp(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
