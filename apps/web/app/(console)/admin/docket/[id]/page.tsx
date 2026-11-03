import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, CardHead } from "@/components/console/card";
import { Avatar } from "@/components/nav/avatar";
import { assignees, itemDetail, type Viewer } from "@/lib/docket";
import { dueBucket, dueInputs, dueText, NOTE_LABEL, PRIORITY_LABEL, PRIORITY_STYLE, REPEAT_LABEL, STATUS_LABEL, STATUS_STYLE, SUBJECT_LABEL, type DocketStatus } from "@/lib/docket-meta";
import { ROLE_LABEL, type StaffRole } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import { claimAction, deleteAction, reassignAction, snoozeAction, statusAction } from "../actions";
import { AssigneeSelect } from "../add-form";
import { ItemForm, NoteForm } from "./item-form";

// Neutral title: the static shell is served to everyone, and the page shouldn't advertise itself.
export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

export default function ItemPage({ params }: PageProps<"/admin/docket/[id]">) {
  return (
    <main className="pt-4 pb-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[22px] bg-surface" />}>
        <Item params={params} />
      </Suspense>
    </main>
  );
}

const stamp = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const badge = "rounded-full px-2.5 py-1 text-[13px] font-semibold whitespace-nowrap";
const button = "h-10 cursor-pointer rounded-full border border-hairline bg-canvas px-4 text-[15px] font-semibold hover:border-muted";

// What can be done next from where an item stands.
const NEXT: Record<DocketStatus, [DocketStatus, string][]> = {
  open: [["doing", "Start"], ["waiting", "Waiting on someone"], ["done", "Mark done"], ["dropped", "Drop it"]],
  doing: [["waiting", "Waiting on someone"], ["done", "Mark done"], ["dropped", "Drop it"]],
  waiting: [["doing", "Start again"], ["done", "Mark done"], ["dropped", "Drop it"]],
  done: [["open", "Reopen"]],
  dropped: [["open", "Reopen"]],
};

async function Item({ params }: Pick<PageProps<"/admin/docket/[id]">, "params">) {
  const me = await requireAdmin("docket");
  const role = me.role as StaffRole;
  const v: Viewer = { id: me.id, role, name: me.name };
  const { id: raw } = await params;
  const id = Number(raw);
  const d = await itemDetail(v, id);
  if (!d) notFound();
  const who = await assignees(v);
  const now = new Date();
  const open = d.status !== "done" && d.status !== "dropped";
  const bucket = open ? dueBucket(d.dueAt, now) : "none";
  const inPool = !!d.assigneeRole;
  const canTake = inPool && open && (role === "admin" || d.assigneeRole === role);
  const owner = d.assigneeId ? `u:${d.assigneeId}` : d.assigneeRole ? `r:${d.assigneeRole}` : undefined;
  const { date, time } = dueInputs(d.dueAt);

  return (
    <>
      <Link href="/admin/docket" className="inline-flex h-10 items-center text-[15px] font-medium text-indigo hover:underline">
        Docket
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-[1.75rem] leading-[1.1] font-medium tracking-[-0.03em] md:text-[2.25rem]">{d.title}</h1>
        <span className={`${badge} ${STATUS_STYLE[d.status]}`}>{STATUS_LABEL[d.status]}</span>
        {d.priority !== "normal" && <span className={`${badge} ${PRIORITY_STYLE[d.priority]}`}>{PRIORITY_LABEL[d.priority]}</span>}
      </div>
      <p className="mt-1 text-[15px] text-muted">
        {open ? (
          <span className={bucket === "overdue" ? "font-semibold text-danger" : bucket === "today" ? "font-semibold text-indigo" : ""}>{dueText(d.dueAt, now)}</span>
        ) : d.doneAt ? (
          `${STATUS_LABEL[d.status]} ${stamp(d.doneAt)}`
        ) : null}
        {d.repeat !== "none" && ` · ${REPEAT_LABEL[d.repeat].toLowerCase()}`}
        {d.creatorName && ` · added by ${d.creatorName}`}
      </p>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-4">
          <Card>
            <CardHead icon="docket" title="Details" description="Change the wording, the date, the priority or how often it repeats." />
            <div className="mt-5">
              <ItemForm item={{ id: d.id, title: d.title, detail: d.detail ?? "", priority: d.priority, repeat: d.repeat, date, time }} />
            </div>
          </Card>

          <Card>
            <CardHead icon="message" title="What happened" description="Log calls, WhatsApp messages and visits as they happen, so the next person knows." />
            <div className="mt-4">
              <NoteForm id={d.id} />
            </div>
            <ol className="mt-5 grid gap-1">
              {d.notes.map((n) => (
                <li key={n.id} className={`rounded-2xl px-3 py-2.5 ${n.kind === "event" ? "" : "bg-canvas"}`}>
                  <p className="text-[13px] text-muted">
                    <span className={n.kind === "event" ? "" : "font-semibold text-ink"}>{NOTE_LABEL[n.kind as keyof typeof NOTE_LABEL] ?? "Note"}</span> · {n.by || "Someone"} · {stamp(n.at)}
                  </p>
                  <p className={`mt-0.5 whitespace-pre-wrap ${n.kind === "event" ? "text-[14px] text-muted" : "text-[15px]"}`}>{n.body}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHead icon="queue" title="Next step" description={STATUS_LABEL[d.status]} />
            <div className="mt-4 flex flex-wrap gap-2">
              {NEXT[d.status].map(([to, label]) => (
                <form key={to} action={statusAction.bind(null, d.id, to)}>
                  <button className={to === "done" ? "h-10 cursor-pointer rounded-full bg-verified px-5 text-[15px] font-semibold text-canvas hover:opacity-90" : button}>{label}</button>
                </form>
              ))}
              {canTake && (
                <form action={claimAction.bind(null, d.id)}>
                  <button className={`${button} border-indigo text-indigo`}>Take it</button>
                </form>
              )}
            </div>
            {open && (
              <div className="mt-5 border-t border-hairline pt-4">
                <p className="text-[13px] text-muted">Not yet? Move it to</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {([["tomorrow", "Tomorrow"], ["3d", "In 3 days"], ["week", "In a week"]] as const).map(([to, label]) => (
                    <form key={to} action={snoozeAction.bind(null, d.id, to)}>
                      <button className={button}>{label}</button>
                    </form>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHead icon="users" title="Who has it" />
            <div className="mt-4 flex items-center gap-3">
              {d.assigneeName ? (
                <>
                  <Avatar name={d.assigneeName} image={d.assigneeImage} />
                  <p className="min-w-0 truncate font-medium">{d.assigneeName}</p>
                </>
              ) : (
                <p className="text-[15px]">{d.assigneeRole ? `Up for grabs: anyone in ${ROLE_LABEL[d.assigneeRole as StaffRole] ?? d.assigneeRole}` : "Nobody: the person who had it has left"}</p>
              )}
            </div>
            <form action={reassignAction.bind(null, d.id)} className="mt-4 grid gap-2">
              <label htmlFor="dk-hand" className="text-[13px] text-muted">
                Hand it to
              </label>
              <AssigneeSelect id="dk-hand" name="assignee" people={who.people} pools={who.pools} meId={me.id} value={owner} />
              <button className={`${button} justify-self-start`}>Hand over</button>
            </form>
          </Card>

          <Card>
            <CardHead icon="home" title="About" />
            {d.subject ? (
              <p className="mt-4 text-[15px]">
                <span className="text-muted">{d.subjectKind ? SUBJECT_LABEL[d.subjectKind] : ""}: </span>
                {d.canOpenSubject ? (
                  <Link href={d.subject.href} className="font-semibold text-indigo hover:underline">
                    {d.subject.label}
                  </Link>
                ) : (
                  <span className="font-medium">{d.subject.label}</span>
                )}
              </p>
            ) : (
              <p className="mt-4 text-[15px] text-muted">Nothing attached.</p>
            )}
          </Card>

          {d.canDelete && (
            <Card className="border border-danger/30 bg-canvas">
              <CardHead title="Delete this item" description="Removes it and its history. To keep the history, drop it instead." />
              <details className="mt-4">
                <summary className="inline-flex h-10 cursor-pointer items-center rounded-full border border-danger px-4 text-[15px] font-semibold text-danger hover:bg-danger/8">Delete…</summary>
                <form action={deleteAction.bind(null, d.id)} className="mt-3 grid gap-2">
                  <p className="text-[14px]">This cannot be undone.</p>
                  <button className="h-11 cursor-pointer rounded-full bg-danger px-5 font-semibold text-canvas hover:opacity-90">Yes, delete it</button>
                </form>
              </details>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
