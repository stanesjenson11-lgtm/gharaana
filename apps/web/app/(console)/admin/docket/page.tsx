import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardHead, Figure } from "@/components/console/card";
import { BarChart } from "@/components/console/charts";
import { Avatar } from "@/components/nav/avatar";
import { assignees, finishedPerDay, listItems, PAGE_SIZE, resolveSubjects, scopeCounts, subjectKey, summary, workload, type Viewer } from "@/lib/docket";
import { dueBucket, dueText, isScope, isSubjectKind, PRIORITY_LABEL, PRIORITY_STYLE, scopesFor, STATUS_LABEL, STATUS_STYLE, SUBJECT_LABEL, SUBJECT_SECTION, type Bucket, type Scope } from "@/lib/docket-meta";
import { can, ROLE_LABEL, type StaffRole } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import { AddForm } from "./add-form";
import { claimAction, statusAction } from "./actions";

// Neutral title: the static shell is served to everyone, and the page shouldn't advertise itself.
export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

export default function DocketPage({ searchParams }: PageProps<"/admin/docket">) {
  return (
    <main className="pt-4 pb-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[22px] bg-surface" />}>
        <Docket searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const href = (scope: Scope, q: string, page = 1) => {
  const p = new URLSearchParams();
  if (scope !== "mine") p.set("scope", scope);
  if (q) p.set("q", q);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return `/admin/docket${s ? `?${s}` : ""}`;
};

const DUE_TONE: Record<Bucket, string> = { overdue: "font-semibold text-danger", today: "font-semibold text-indigo", soon: "text-ink", later: "text-muted", none: "text-muted" };
const badge = "rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap";

function Tick({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

async function Docket({ searchParams }: Pick<PageProps<"/admin/docket">, "searchParams">) {
  const me = await requireAdmin("docket");
  const role = me.role as StaffRole;
  const v: Viewer = { id: me.id, role, name: me.name };
  const sp = await searchParams;
  const allowed = scopesFor(role);
  const scope: Scope = isScope(sp.scope) && allowed.some(([s]) => s === sp.scope) ? sp.scope : "mine";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const page = Number(typeof sp.page === "string" ? sp.page : 1) || 1;

  // Coming from a client, home, request or ticket: "Add to docket" there opens this page with that thing filled in.
  const want = typeof sp.subject === "string" ? sp.subject : "";
  const at = want.indexOf(":");
  const ref = at > 0 && isSubjectKind(want.slice(0, at)) && can(role, SUBJECT_SECTION[want.slice(0, at) as keyof typeof SUBJECT_SECTION]) ? { kind: want.slice(0, at) as keyof typeof SUBJECT_SECTION, id: want.slice(at + 1) } : null;

  const now = new Date();
  const [list, counts, who, mine, subjects, team, finished] = await Promise.all([
    listItems(v, { scope, q, page }),
    scopeCounts(v),
    assignees(v),
    summary(v, now),
    ref ? resolveSubjects([ref]) : null,
    role === "admin" ? workload(now) : null,
    role === "admin" ? finishedPerDay(14) : null,
  ]);
  const subject = ref && subjects?.get(subjectKey(ref)) ? { value: `${ref.kind}:${ref.id}`, label: `${SUBJECT_LABEL[ref.kind]}: ${subjects.get(subjectKey(ref))!.label}` } : null;
  const from = list.total === 0 ? 0 : (list.page - 1) * PAGE_SIZE + 1;
  const canTake = (r: { assigneeRole: string | null }) => !!r.assigneeRole && (role === "admin" || r.assigneeRole === role);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="text-[2rem] leading-[1.1] font-medium tracking-[-0.03em] md:text-[2.75rem]">Docket</h1>
          <p className="mt-1 max-w-[60ch] text-muted">Work the team hands to each other. Every item has an owner, a due date and a next step, and can point at the client, home, request or ticket it is about.</p>
        </div>
        <form role="search" action="/admin/docket" className="flex gap-2">
          {scope !== "mine" && <input type="hidden" name="scope" value={scope} />}
          <label htmlFor="dk-q" className="sr-only">
            Search the docket by title
          </label>
          <input id="dk-q" name="q" type="search" defaultValue={q} placeholder="Search by title" className="h-11 w-56 rounded-full bg-surface px-5 text-[15px] focus-visible:outline-2 focus-visible:outline-indigo" />
          <button className="h-11 cursor-pointer rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep">Search</button>
        </form>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <Figure value={mine.open} label="open for you" />
        </Card>
        <Card>
          <Figure value={mine.today} label="due today" />
        </Card>
        <Card>
          <Figure value={mine.overdue} label="late" />
        </Card>
      </div>

      <Card className="mt-4">
        <CardHead icon="docket" title="Add to the docket" description="Give it to yourself, a teammate, or a team's pool for whoever gets there first." />
        <div className="mt-4">
          <AddForm people={who.people} pools={who.pools} meId={me.id} subject={subject} />
        </div>
      </Card>

      <nav aria-label="Filter the docket" className="mt-6 flex flex-wrap gap-2">
        {allowed.map(([key, label]) => (
          <Link
            key={key}
            href={href(key, q)}
            aria-current={scope === key ? "page" : undefined}
            className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[15px] font-medium ${scope === key ? "bg-ink text-canvas" : "bg-surface text-muted hover:text-ink"}`}
          >
            {label}
            <span className="tabular-nums opacity-70">{counts[key]}</span>
          </Link>
        ))}
      </nav>

      <section className="mt-5 rounded-[22px] bg-surface p-2" aria-label="Items">
        {list.items.length === 0 ? (
          <p className="px-4 py-12 text-center text-muted">{q ? "Nothing matches that." : scope === "mine" ? "Nothing on your list. Add something above, or look in Up for grabs." : scope === "pool" ? "Nothing is waiting in a pool." : "Nothing here yet."}</p>
        ) : (
          <ul>
            {list.items.map((i) => {
              const open = i.status !== "done" && i.status !== "dropped";
              const bucket = open ? dueBucket(i.dueAt, now) : "none";
              return (
                <li key={i.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-canvas">
                  {open ? (
                    <form action={statusAction.bind(null, i.id, "done")}>
                      <button aria-label={`Mark done: ${i.title}`} className="group grid h-8 w-8 cursor-pointer place-items-center rounded-full border-2 border-hairline text-transparent hover:border-verified hover:text-verified">
                        <Tick />
                      </button>
                    </form>
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-verified text-canvas" role="img" aria-label={STATUS_LABEL[i.status]}>
                      <Tick />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/docket/${i.id}`} className={`block truncate font-medium ${open ? "" : "text-muted line-through"}`}>
                      {i.title}
                    </Link>
                    <p className="truncate text-[14px] text-muted">
                      {i.subject ? i.subject.label : "Nothing attached"}
                      {i.repeat !== "none" && " · repeats"}
                      <span className="md:hidden"> · {i.assigneeName ? i.assigneeName.split(" ")[0] : `${ROLE_LABEL[i.assigneeRole as StaffRole] ?? "Pool"} pool`}</span>
                    </p>
                  </div>
                  <div className="hidden w-40 items-center gap-2 md:flex">
                    {i.assigneeName ? (
                      <>
                        <Avatar name={i.assigneeName} image={i.assigneeImage} />
                        <span className="truncate text-[14px]">{i.assigneeName}</span>
                      </>
                    ) : (
                      <span className="truncate text-[14px] text-muted">{ROLE_LABEL[i.assigneeRole as StaffRole] ?? "Nobody"} pool</span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                    {(i.priority === "high" || i.priority === "urgent") && open && <span className={`${badge} ${PRIORITY_STYLE[i.priority]}`}>{PRIORITY_LABEL[i.priority]}</span>}
                    {(i.status === "doing" || i.status === "waiting") && <span className={`${badge} ${STATUS_STYLE[i.status]}`}>{STATUS_LABEL[i.status]}</span>}
                    {open && <span className={`text-[14px] whitespace-nowrap ${DUE_TONE[bucket]}`}>{dueText(i.dueAt, now)}</span>}
                    {open && canTake(i) && (
                      <form action={claimAction.bind(null, i.id)}>
                        <button className="h-9 cursor-pointer rounded-full border border-hairline bg-canvas px-4 text-[14px] font-semibold hover:border-muted">Take it</button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {list.total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[14px] text-muted">
          <p className="tabular-nums">
            {from}–{Math.min(list.page * PAGE_SIZE, list.total)} of {list.total}
          </p>
          <div className="flex gap-2">
            {list.page > 1 && (
              <Link href={href(scope, q, list.page - 1)} className="inline-flex h-10 items-center rounded-full border border-hairline px-5 font-semibold text-ink hover:border-muted">
                Previous
              </Link>
            )}
            {list.page < list.pages && (
              <Link href={href(scope, q, list.page + 1)} className="inline-flex h-10 items-center rounded-full border border-hairline px-5 font-semibold text-ink hover:border-muted">
                Next
              </Link>
            )}
          </div>
        </div>
      )}

      {team && finished && (
        <div className="@container mt-8">
          <div className="grid gap-4 @4xl:grid-cols-[3fr_2fr]">
            <Card>
              <CardHead icon="users" title="Team load" description="Open work, what is late, and how the last 30 days went. Meant for spotting who is stretched, not for ranking." />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-[15px]">
                  <caption className="sr-only">Each team member&rsquo;s open and finished items</caption>
                  <thead>
                    <tr className="text-[13px] text-muted">
                      <th scope="col" className="px-2 py-2 font-medium">
                        Person
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Open
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Late
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Done this week
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        On time
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Hours to finish
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.people.map((p) => (
                      <tr key={p.id} className="border-t border-hairline">
                        <td className="px-2 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <Avatar name={p.name} image={p.image} />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{p.name}</span>
                              <span className="block text-[13px] text-muted">{ROLE_LABEL[p.role]}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{p.open}</td>
                        <td className={`px-2 py-2.5 text-right tabular-nums ${p.overdue ? "font-semibold text-danger" : "text-muted"}`}>{p.overdue}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{p.doneWeek}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{p.onTimePct === null ? "–" : `${p.onTimePct}%`}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{p.hours === null ? "–" : p.hours}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {team.pools.length > 0 && (
                <p className="mt-3 text-[14px] text-muted">
                  Waiting in pools: {team.pools.map((p) => `${p.n} for ${ROLE_LABEL[p.role]}`).join(", ")}.
                </p>
              )}
            </Card>
            <Card>
              <CardHead icon="chart" title="Finished per day" description="Items marked done, last 14 days" />
              <BarChart data={finished} caption="Items finished per day over the last 14 days" line />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
