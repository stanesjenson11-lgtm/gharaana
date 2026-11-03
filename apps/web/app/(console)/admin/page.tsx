import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardHead, Delta, Figure } from "@/components/console/card";
import { ICONS } from "@/components/nav/icons";
import { BarChart, Donut, ProgressList, type Slice } from "@/components/console/charts";
import { pctChange } from "@/lib/chart";
import { STAGES } from "@/lib/crm";
import {
  attention,
  clientsPerWeek,
  clientStats,
  leadsByWeekday,
  leadStats,
  listingsByStatus,
  listingsPerDay,
  recentActivity,
  reviewStats,
  ticketStats,
} from "@/lib/dashboard";
import { summary as docketSummary } from "@/lib/docket";
import { daysAgo } from "@/lib/format";
import { can, isStaffRole, ROLE_LABEL, type Section } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import { topicLabel } from "@/lib/support";

// Neutral title: the static shell is served to everyone, and the page shouldn't advertise itself.
export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

export default function DashboardPage() {
  return (
    <main className="pt-4 pb-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[22px] bg-surface" />}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

const STATUS: Record<string, { label: string; className: string }> = {
  pending_review: { label: "Waiting for review", className: "fill-streetlight" },
  active: { label: "Live", className: "fill-verified" },
  rented: { label: "Sold or rented", className: "fill-indigo" },
  expired: { label: "Expired", className: "fill-muted/40" },
  rejected: { label: "Rejected", className: "fill-danger" },
};

const stamp = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const since = (d: Date) => daysAgo(Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 864e5)));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function Dashboard() {
  const me = await requireAdmin("overview");
  const role = isStaffRole(me.role) ? me.role : "sales";
  const has = (s: Section) => can(role, s);
  const none = Promise.resolve(null);

  const [review, byStatus, perDay, clients, perWeek, leadS, weekday, tix, attn, activity, docket] = await Promise.all([
    has("queue") ? reviewStats() : none,
    has("queue") ? listingsByStatus() : none,
    has("queue") ? listingsPerDay(14) : none,
    has("users") ? clientStats() : none,
    has("users") ? clientsPerWeek(8) : none,
    has("leads") ? leadStats() : none,
    has("leads") ? leadsByWeekday() : none,
    has("support") ? ticketStats() : none,
    attention(),
    has("staff") ? recentActivity(8) : none,
    docketSummary({ id: me.id, role, name: me.name }),
  ]);

  const firstName = me.name.trim().split(/\s+/)[0];
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
  const ticket = (s: string) => tix?.byStatus.find((x) => x.status === s)?.n ?? 0;
  const stageN = (s: string) => leadS?.byStage.find((x) => x.stage === s)?.n ?? 0;
  const leadTotal = leadS?.byStage.reduce((a, x) => a + x.n, 0) ?? 0;

  // Things that need a person today, only for the sections this role can open.
  const groups: { title: string; total: number; items: { href: string; text: string; note: string }[] }[] = [
    ...(has("queue")
      ? [
          {
            title: `${plural(attn.pending.total, "listing has", "listings have")} waited over 2 days`,
            total: attn.pending.total,
            items: attn.pending.rows.map((r) => ({ href: `/admin/queue#h-${r.id}`, text: r.title, note: `${r.area} · sent ${since(r.since)}` })),
          },
          {
            title: `${plural(attn.unvisited.total, "live home", "live homes")} not visited by our team`,
            total: attn.unvisited.total,
            items: attn.unvisited.rows.map((r) => ({ href: "/admin/queue", text: r.title, note: `${r.area} · confirmed ${since(r.since)}` })),
          },
        ]
      : []),
    ...(has("support")
      ? [
          {
            title: `${plural(attn.waiting.total, "request is", "requests are")} waiting for a reply`,
            total: attn.waiting.total,
            items: attn.waiting.rows.map((r) => ({ href: `/help/${r.id}`, text: `${r.who || "A client"}: ${topicLabel(r.topic)}`, note: `last message ${since(r.since)}` })),
          },
        ]
      : []),
    ...(has("leads")
      ? [
          {
            title: `${plural(attn.newLeads.total, "request has", "requests have")} had no follow-up for a day`,
            total: attn.newLeads.total,
            items: attn.newLeads.rows.map((r) => ({ href: "/admin/leads", text: `${r.who || "A client"} · ${r.title}`, note: `${r.kind === "visit" ? "Visit" : "Callback"} asked ${since(r.since)}` })),
          },
        ]
      : []),
  ].filter((g) => g.total > 0);
  const needs = groups.reduce((a, g) => a + g.total, 0);

  const actions = ([["queue", "/admin/queue", "Review queue"], ["leads", "/admin/leads", "Sales leads"], ["support", "/admin/support", "Support"], ["users", "/admin/clients", "Clients"]] as const).filter(([s]) => has(s)).slice(0, 3);

  const liveShare = review && review.live ? Math.round((review.visited * 100) / review.live) : 0;

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="text-[14px] text-muted">
            {today} · {ROLE_LABEL[role]}
          </p>
          <h1 className="mt-1 text-[2rem] leading-[1.1] font-medium tracking-[-0.03em] md:text-[2.75rem]">
            Welcome back{firstName && ", "}
            {firstName && <span className="text-muted">{firstName}</span>}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions.map(([, href, label]) => (
            <Link key={href} href={href} className="inline-flex h-11 items-center rounded-full border border-hairline px-5 font-semibold hover:border-muted">
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="@container">
        <div className="grid grid-flow-row-dense gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
          {review && (
            <section className="rounded-[22px] bg-indigo p-5 text-canvas">
              <CardHeadOnIndigo title="Review queue" description="Listings waiting for a person" href="/admin/queue" />
              <p className="mt-6 flex flex-wrap items-baseline gap-x-3">
                <span className="text-[3.25rem] leading-none font-medium tracking-[-0.03em] tabular-nums">{review.pending}</span>
                <span className="text-[15px] opacity-85">{review.pending === 1 ? "listing waiting" : "listings waiting"}</span>
              </p>
              <p className="mt-2 min-h-6 text-[14px] opacity-85">
                {review.oldestPendingDays === null ? "Nothing is waiting. New listings land here." : `The oldest has waited ${daysAgo(review.oldestPendingDays).replace(" ago", "")}.`}
              </p>
              <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] font-medium tracking-wide opacity-90">
                <span>{review.approvedWeek} APPROVED THIS WEEK</span>
                <span>{review.rejectedWeek} REJECTED</span>
              </p>
            </section>
          )}

          <Card>
            <CardHead icon="docket" title="Your docket" description="Work handed to you" href="/admin/docket" />
            <div className="mt-5">
              <Figure value={docket.open} label={docket.open === 1 ? "item open" : "items open"} />
              <p className="mt-4 text-[14px] text-muted">
                <span className={`font-medium tabular-nums ${docket.overdue ? "text-danger" : "text-ink"}`}>{docket.overdue}</span> late
                {" · "}
                <span className="font-medium text-ink tabular-nums">{docket.today}</span> due today
                {" · "}
                <span className="font-medium text-ink tabular-nums">{docket.pool}</span> up for grabs
              </p>
            </div>
          </Card>

          {review && (
            <Card>
              <CardHead icon="home" title="Live homes" description="Approved and visible to clients" href={has("listings") ? "/admin/listings" : "/admin/queue"} />
              <div className="mt-5">
                <Figure value={review.live} label={review.live === 1 ? "home live" : "homes live"} />
                <p className="mt-4 text-[14px]">
                  <span className="font-medium tabular-nums">{liveShare}%</span> <span className="text-muted">visited by our team ({review.visited} of {review.live})</span>
                </p>
                <div aria-hidden="true" className="mt-1.5 h-2 rounded-full bg-canvas">
                  <div className="h-full rounded-full bg-verified" style={{ width: `${liveShare}%` }} />
                </div>
                <p className="mt-3 text-[14px] text-muted">
                  <span className="font-medium text-ink tabular-nums">{review.expiring}</span> expire within a week unless the owner confirms
                </p>
              </div>
            </Card>
          )}

          {clients && (
            <Card>
              <CardHead icon="users" title="Clients" description="People with an account" href="/admin/clients" />
              <div className="mt-5">
                <Figure value={clients.total} label={clients.total === 1 ? "client" : "clients"}>
                  <Delta pct={pctChange(clients.before, clients.week)} />
                </Figure>
                <p className="mt-4 text-[14px] text-muted">
                  <span className="font-medium text-ink tabular-nums">{clients.week}</span> joined in the last 7 days
                  {clients.banned > 0 && (
                    <>
                      {" · "}
                      <span className="font-medium text-danger tabular-nums">{clients.banned}</span> suspended
                    </>
                  )}
                </p>
              </div>
            </Card>
          )}

          {tix && (
            <Card>
              <CardHead icon="support" title="Support" description="Requests from clients" href="/admin/support" />
              <div className="mt-5">
                <Figure value={ticket("open")} label={ticket("open") === 1 ? "waiting for us" : "waiting for us"} />
                <p className="mt-4 text-[14px] text-muted">
                  <span className="font-medium text-ink tabular-nums">{ticket("answered")}</span> answered, <span className="font-medium text-ink tabular-nums">{ticket("closed")}</span> closed
                  {tix.oldestOpenDays !== null && <> · oldest open {daysAgo(tix.oldestOpenDays).replace(" ago", "")}</>}
                </p>
              </div>
            </Card>
          )}

          {leadS && (
            <Card>
              <CardHead icon="leads" title="Sales requests" description="Callbacks and visits asked for" href="/admin/leads" />
              <div className="mt-5">
                <Figure value={leadS.week} label="this week">
                  <Delta pct={pctChange(leadS.before, leadS.week)} />
                </Figure>
                <p className="mt-4 text-[14px] text-muted">
                  <span className="font-medium text-ink tabular-nums">{stageN("new")}</span> new, <span className="font-medium text-ink tabular-nums">{stageN("won")}</span> sold, {leadTotal} in all
                </p>
              </div>
            </Card>
          )}

          {perDay && (
            <Card className="@3xl:col-span-2">
              <CardHead icon="chart" title="New listings" description="Per day for the last two weeks, with the running total" href="/admin/queue" />
              <BarChart data={perDay} line lineLabel="Total" caption="New listings per day over the last 14 days" />
            </Card>
          )}

          {byStatus && (
            <Card>
              <CardHead icon="home" title="Listings by status" description="Every listing, as it stands" />
              <Donut
                caption="Listings by status"
                centre={byStatus.reduce((a, x) => a + x.n, 0)}
                centreLabel="listings"
                slices={Object.entries(STATUS).map(([key, s]): Slice => ({ label: s.label, className: s.className, value: byStatus.find((x) => x.status === key)?.n ?? 0 }))}
              />
            </Card>
          )}

          {leadS && (
            <Card>
              <CardHead icon="leads" title="Requests by stage" description="Where each sale has got to" href="/admin/leads" />
              <ProgressList caption="Sales requests by stage" rows={STAGES.map(([key, label]) => ({ label, value: stageN(key) }))} />
            </Card>
          )}

          {weekday && (
            <Card>
              <CardHead icon="clock" title="Busiest days" description="Requests by weekday, last 90 days" />
              <BarChart data={weekday} caption="Callback and visit requests by weekday over the last 90 days" />
            </Card>
          )}

          {perWeek && (
            <Card>
              <CardHead icon="users" title="New clients" description="Per week for the last eight weeks" href="/admin/clients" />
              <BarChart data={perWeek} line lineLabel="Total" caption="New clients per week over the last eight weeks" />
            </Card>
          )}

          {tix && (
            <Card>
              <CardHead icon="support" title="Open requests by topic" description="What people are asking about" href="/admin/support" />
              <ProgressList caption="Open support requests by topic" rows={tix.byTopic.map((t) => ({ label: topicLabel(t.topic), value: t.n }))} />
              {tix.byTopic.length === 0 && <p className="mt-4 text-[14px] text-muted">No open requests. Everyone has an answer.</p>}
            </Card>
          )}

          <Card className="@3xl:col-span-2 @6xl:col-span-1">
            <CardHead icon="clock" title="Needs attention" description="Where someone should look today" />
            <p className="mt-5 flex items-baseline gap-2.5">
              <span className="text-[3rem] leading-none font-medium tracking-[-0.03em] tabular-nums">{needs}</span>
              <span className="text-[15px] text-muted">{needs === 1 ? "thing" : "things"} to follow up</span>
            </p>
            {groups.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-canvas p-4 text-[14px] text-muted">Nothing is overdue. You&rsquo;re all caught up.</p>
            ) : (
              <ul className="mt-4 text-[15px]">
                {groups.map((g) => (
                  <li key={g.title}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-3 py-2.5 hover:bg-canvas">
                        <span>{g.title}</span>
                        <ICONS.chevron className="h-4 w-4 shrink-0 text-muted group-open:rotate-90" />
                      </summary>
                      <ul className="space-y-1 px-3 pb-3 text-[14px]">
                        {g.items.map((i) => (
                          <li key={i.href + i.text}>
                            <Link href={i.href} className="font-medium hover:underline">
                              {i.text}
                            </Link>
                            <span className="text-muted"> · {i.note}</span>
                          </li>
                        ))}
                        {g.total > g.items.length && <li className="text-muted">and {g.total - g.items.length} more</li>}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {activity && (
            <Card className="@3xl:col-span-2">
              <CardHead icon="security" title="Recent staff activity" description="The latest actions in the console" />
              {activity.length === 0 ? (
                <p className="mt-4 text-[14px] text-muted">Nothing yet.</p>
              ) : (
                <ul className="mt-4 text-[15px]">
                  {activity.map((a, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-4 rounded-2xl px-3 py-2 hover:bg-canvas">
                      <span className="min-w-0">
                        <span className="font-medium">{a.who}</span> <span className="text-muted">{a.text}</span>
                      </span>
                      <span className="shrink-0 text-[13px] text-muted tabular-nums">{stamp(a.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/** The Review queue card is the one filled card, so its header is drawn for white-on-indigo. */
function CardHeadOnIndigo({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <header className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-[1.0625rem] leading-tight font-semibold">{title}</h2>
        <p className="text-[14px] opacity-80">{description}</p>
      </div>
      <Link href={href} aria-label={`Open ${title}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas text-indigo hover:bg-moonlight">
        <ICONS.arrow className="h-[18px] w-[18px]" />
      </Link>
    </header>
  );
}
