// The docket: work the team hands to each other, with an owner, a due date and a next step. Admin pages only: it shows
// client names and private notes. Who may do what is decided here, not in the pages:
//   see     the super admin sees everything; everyone else sees what they own, made, or what sits in their role's pool
//   hand to a person or role pool that roles.ts allows (canHandOff); anyone can keep an item for themselves
//   claim   anyone in a role takes an item from that role's pool; the first to ask gets it
//   edit    anyone who can see an item can work it; only its maker or the super admin can delete it
import { aliasedTable, and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "./db.ts";
import {
  OPEN_STATUSES,
  PRIORITY_LABEL,
  SUBJECT_SECTION,
  dueText,
  istDate,
  isNoteKind,
  isPriority,
  isRepeat,
  isSubjectKind,
  nextDue,
  todayRange,
  type DocketPriority,
  type DocketRepeat,
  type DocketStatus,
  type NoteKind,
  type Scope,
  type SubjectKind,
  type Target,
} from "./docket-meta.ts";
import { notify } from "./notify.ts";
import { can, canHandOff, handOffTargets, isStaffRole, ROLE_LABEL, STAFF_ROLES, type StaffRole } from "./roles.ts";
import { docketItems, docketNotes, leads, listings, tickets, user } from "./schema.ts";
import { topicLabel } from "./support-topics.ts";

/** The person using the docket: already known to be staff. */
export type Viewer = { id: string; role: StaffRole; name: string };

export const PAGE_SIZE = 25;
const OPEN = [...OPEN_STATUSES];
const CLOSED: DocketStatus[] = ["done", "dropped"];
const href = (id: number) => `/admin/docket/${id}`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "Someone";

// ---------- What each person may see ----------

const visible = (v: Viewer) =>
  v.role === "admin" ? undefined : or(eq(docketItems.assigneeId, v.id), eq(docketItems.createdBy, v.id), eq(docketItems.assigneeRole, v.role));

const SCOPE_SQL: Record<Scope, (v: Viewer) => SQL> = {
  mine: (v) => and(eq(docketItems.assigneeId, v.id), inArray(docketItems.status, OPEN))!,
  pool: (v) => and(v.role === "admin" ? isNotNull(docketItems.assigneeRole) : eq(docketItems.assigneeRole, v.role), inArray(docketItems.status, OPEN))!,
  made: (v) => and(eq(docketItems.createdBy, v.id), or(isNull(docketItems.assigneeId), ne(docketItems.assigneeId, v.id)), inArray(docketItems.status, OPEN))!,
  team: () => inArray(docketItems.status, OPEN),
  done: () => inArray(docketItems.status, CLOSED),
};

// ---------- What an item is about ----------

export type SubjectInfo = { label: string; href: string };
export type SubjectRef = { kind: SubjectKind; id: string };
export const subjectKey = (r: SubjectRef) => `${r.kind}:${r.id}`;

/** Names and links for the things items point at. A subject that no longer exists is simply missing from the result. */
export async function resolveSubjects(refs: SubjectRef[]): Promise<Map<string, SubjectInfo>> {
  const out = new Map<string, SubjectInfo>();
  const ids = (k: SubjectKind) => [...new Set(refs.filter((r) => r.kind === k).map((r) => r.id))];
  const numbers = (k: SubjectKind) => ids(k).filter((i) => /^\d{1,9}$/.test(i)).map(Number);
  const [clients, homes, requests, asks] = await Promise.all([
    ids("client").length ? db.select({ id: user.id, name: user.name, phone: user.phoneNumber }).from(user).where(inArray(user.id, ids("client"))) : [],
    ids("listing").length ? db.select({ id: listings.id, title: listings.title }).from(listings).where(inArray(listings.id, ids("listing"))) : [],
    numbers("lead").length
      ? db.select({ id: leads.id, title: listings.title, who: user.name }).from(leads).innerJoin(listings, eq(listings.id, leads.listingId)).innerJoin(user, eq(user.id, leads.requesterId)).where(inArray(leads.id, numbers("lead")))
      : [],
    numbers("ticket").length ? db.select({ id: tickets.id, topic: tickets.topic, who: user.name }).from(tickets).innerJoin(user, eq(user.id, tickets.userId)).where(inArray(tickets.id, numbers("ticket"))) : [],
  ]);
  for (const c of clients) out.set(`client:${c.id}`, { label: c.name || c.phone || "A client", href: `/admin/clients/${c.id}` });
  for (const h of homes) out.set(`listing:${h.id}`, { label: h.title, href: `/admin/listings/${h.id}` });
  for (const r of requests) out.set(`lead:${r.id}`, { label: `${r.who || "A client"}, ${r.title}`, href: "/admin/leads" });
  for (const t of asks) out.set(`ticket:${t.id}`, { label: `${t.who || "A client"}: ${topicLabel(t.topic)}`, href: `/help/${t.id}` });
  return out;
}

// ---------- Lists ----------

export type Row = {
  id: number;
  title: string;
  status: DocketStatus;
  priority: DocketPriority;
  dueAt: Date | null;
  repeat: DocketRepeat;
  assigneeId: string | null;
  assigneeRole: string | null;
  assigneeName: string | null;
  assigneeImage: string | null;
  subject: SubjectInfo | null;
  subjectKind: SubjectKind | null;
};

const assignee = aliasedTable(user, "assignee");

/** One page of items for a scope, soonest due first and most urgent first among equals. */
export async function listItems(v: Viewer, { scope = "mine", q = "", page = 1 }: { scope?: Scope; q?: string; page?: number }) {
  const sc = scope === "team" && v.role !== "admin" ? "mine" : scope;
  const term = q.trim().slice(0, 80);
  const cond = and(visible(v), SCOPE_SQL[sc](v), term ? ilike(docketItems.title, `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) : undefined);
  const p = Math.max(1, Math.floor(page) || 1);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: docketItems.id,
        title: docketItems.title,
        status: docketItems.status,
        priority: docketItems.priority,
        dueAt: docketItems.dueAt,
        repeat: docketItems.repeat,
        assigneeId: docketItems.assigneeId,
        assigneeRole: docketItems.assigneeRole,
        assigneeName: assignee.name,
        assigneeImage: assignee.image,
        subjectKind: docketItems.subjectKind,
        subjectId: docketItems.subjectId,
      })
      .from(docketItems)
      .leftJoin(assignee, eq(assignee.id, docketItems.assigneeId))
      .where(cond)
      .orderBy(...(sc === "done" ? [desc(docketItems.doneAt), desc(docketItems.id)] : [sql`${docketItems.dueAt} asc nulls last`, desc(docketItems.priority), desc(docketItems.id)]))
      .limit(PAGE_SIZE)
      .offset((p - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(docketItems).where(cond),
  ]);
  const subjects = await resolveSubjects(rows.flatMap((r) => (r.subjectKind && r.subjectId ? [{ kind: r.subjectKind, id: r.subjectId }] : [])));
  const items: Row[] = rows.map(({ subjectId, ...r }) => ({ ...r, subject: (r.subjectKind && subjectId && subjects.get(`${r.subjectKind}:${subjectId}`)) || null }));
  return { items, total: n, page: p, pages: Math.max(1, Math.ceil(n / PAGE_SIZE)) };
}

/** How many items each chip would show. */
export async function scopeCounts(v: Viewer) {
  const f = (s: Scope) => sql<number>`count(*) filter (where ${SCOPE_SQL[s](v)})`.mapWith(Number);
  const [r] = await db.select({ mine: f("mine"), pool: f("pool"), made: f("made"), team: f("team"), done: f("done") }).from(docketItems).where(visible(v));
  return r;
}

/** The numbers on the dashboard card and the page header. */
export async function summary(v: Viewer, now = new Date()) {
  const [, end] = todayRange(now);
  const mine = and(eq(docketItems.assigneeId, v.id), inArray(docketItems.status, OPEN));
  const [r] = await db
    .select({
      open: sql<number>`count(*) filter (where ${mine})`.mapWith(Number),
      overdue: sql<number>`count(*) filter (where ${mine} and ${docketItems.dueAt} < ${now.toISOString()}::timestamptz)`.mapWith(Number),
      today: sql<number>`count(*) filter (where ${mine} and ${docketItems.dueAt} >= ${now.toISOString()}::timestamptz and ${docketItems.dueAt} < ${end.toISOString()}::timestamptz)`.mapWith(Number),
      pool: sql<number>`count(*) filter (where ${SCOPE_SQL.pool(v)})`.mapWith(Number),
    })
    .from(docketItems)
    .where(visible(v));
  return r;
}

// ---------- One item ----------

export async function itemDetail(v: Viewer, id: number) {
  if (!Number.isInteger(id)) return null;
  const creator = aliasedTable(user, "creator");
  const [item] = await db
    .select({ item: docketItems, assigneeName: assignee.name, assigneeImage: assignee.image, creatorName: creator.name })
    .from(docketItems)
    .leftJoin(assignee, eq(assignee.id, docketItems.assigneeId))
    .leftJoin(creator, eq(creator.id, docketItems.createdBy))
    .where(and(eq(docketItems.id, id), visible(v)));
  if (!item) return null;
  const author = aliasedTable(user, "author");
  const notes = await db
    .select({ id: docketNotes.id, kind: docketNotes.kind, body: docketNotes.body, at: docketNotes.createdAt, by: author.name })
    .from(docketNotes)
    .leftJoin(author, eq(author.id, docketNotes.authorId))
    .where(eq(docketNotes.itemId, id))
    .orderBy(desc(docketNotes.createdAt), desc(docketNotes.id));
  const ref = item.item.subjectKind && item.item.subjectId ? { kind: item.item.subjectKind, id: item.item.subjectId } : null;
  const subject = ref ? ((await resolveSubjects([ref])).get(subjectKey(ref)) ?? null) : null;
  return {
    ...item.item,
    assigneeName: item.assigneeName,
    assigneeImage: item.assigneeImage,
    creatorName: item.creatorName,
    subject,
    notes,
    canDelete: v.role === "admin" || item.item.createdBy === v.id,
    // Opening the thing it is about needs that section; the label shows either way.
    canOpenSubject: !!item.item.subjectKind && can(v.role, SUBJECT_SECTION[item.item.subjectKind]),
  };
}

/** Who the viewer may give work to: the people and role pools their role allows. */
export async function assignees(v: Viewer) {
  const roles = handOffTargets(v.role);
  const people = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(and(inArray(user.role, [...roles]), sql`coalesce(${user.banned}, false) = false`))
    .orderBy(asc(user.role), asc(user.name));
  return {
    people: people.map((p) => ({ id: p.id, name: p.name || "No name", role: p.role as StaffRole })),
    pools: roles.map((r) => ({ role: r, label: ROLE_LABEL[r] })),
  };
}

// ---------- Changing things ----------

export type Reason = "gone" | "title" | "long" | "due" | "target" | "subject" | "forbidden" | "bad";
export type Result = { ok: true; id: number } | { ok: false; reason: Reason };
const fail = (reason: Reason): Result => ({ ok: false, reason });

type Db = Pick<typeof db, "insert">;
const log = (tx: Db, itemId: number, authorId: string | null, body: string, kind: NoteKind | "event" = "event") => tx.insert(docketNotes).values({ itemId, authorId, kind, body });

/** Checks that the target is staff who can be given work, and that the giver's role may give them work. */
async function checkTarget(actor: Viewer, t: Target): Promise<{ role: StaffRole; userId: string | null; name: string } | null> {
  if ("userId" in t) {
    const [u] = await db.select({ id: user.id, name: user.name, role: user.role, banned: user.banned }).from(user).where(eq(user.id, t.userId));
    if (!u || u.banned || !isStaffRole(u.role) || !canHandOff(actor.role, u.role)) return null;
    return { role: u.role, userId: u.id, name: u.name || "a teammate" };
  }
  return isStaffRole(t.role) && canHandOff(actor.role, t.role) ? { role: t.role, userId: null, name: `the ${ROLE_LABEL[t.role]} pool` } : null;
}

const staffWith = async (role: StaffRole, except: string) =>
  (await db.select({ id: user.id }).from(user).where(and(eq(user.role, role), ne(user.id, except), sql`coalesce(${user.banned}, false) = false`))).map((u) => u.id);

/**
 * Alerts are best effort: a teammate leaving halfway, or a WhatsApp outage, must never fail the work itself. They go one by
 * one so a person who has gone doesn't stop the rest hearing.
 */
async function alert(to: string | string[], text: string, to_href: string) {
  await Promise.all([to].flat().map((id) => notify(id, text, to_href).catch((e: Error) => console.error("[docket] alert failed:", e.message))));
}

async function tell(actor: Viewer, to: { role: StaffRole; userId: string | null }, id: number, title: string) {
  if (to.userId) {
    if (to.userId !== actor.id) await alert(to.userId, `${firstName(actor.name)} gave you: ${title}`, href(id));
  } else await alert(await staffWith(to.role, actor.id), `New for ${ROLE_LABEL[to.role]}: ${title}`, href(id));
}

export type NewItem = { title: string; detail?: string; priority?: string; repeat?: string; dueAt: Date | null; target: Target; subject?: SubjectRef | null };

export async function createItem(actor: Viewer, input: NewItem): Promise<Result> {
  const title = input.title.trim();
  const detail = (input.detail ?? "").trim();
  if (!title || title.length > 160) return fail("title");
  if (detail.length > 2000) return fail("long");
  const priority = input.priority ?? "normal";
  const repeat = input.repeat ?? "none";
  if (!isPriority(priority) || !isRepeat(repeat)) return fail("bad");
  const to = await checkTarget(actor, input.target);
  if (!to) return fail("target");
  let subject: SubjectRef | null = null;
  if (input.subject) {
    const s = input.subject;
    // Only things the creator may open themselves can be attached.
    if (!isSubjectKind(s.kind) || !can(actor.role, SUBJECT_SECTION[s.kind]) || !(await resolveSubjects([s])).has(subjectKey(s))) return fail("subject");
    subject = s;
  }
  const [row] = await db
    .insert(docketItems)
    .values({
      title,
      detail: detail || null,
      priority,
      repeat,
      dueAt: input.dueAt,
      createdBy: actor.id,
      assigneeId: to.userId,
      assigneeRole: to.userId ? null : to.role,
      subjectKind: subject?.kind ?? null,
      subjectId: subject?.id ?? null,
    })
    .returning({ id: docketItems.id });
  await log(db, row.id, actor.id, to.userId ? (to.userId === actor.id ? "Added to their own list" : `Given to ${to.name}`) : `Put in ${to.name}`);
  await tell(actor, to, row.id, title);
  return { ok: true, id: row.id };
}

/** The item as the viewer may work on it, or null. */
const workable = async (v: Viewer, id: number) => {
  if (!Number.isInteger(id)) return null;
  const [item] = await db.select().from(docketItems).where(and(eq(docketItems.id, id), visible(v)));
  return item ?? null;
};

export async function editItem(actor: Viewer, id: number, patch: { title?: string; detail?: string; priority?: string; repeat?: string; dueAt?: Date | null }): Promise<Result> {
  const item = await workable(actor, id);
  if (!item) return fail("gone");
  const set: Partial<typeof docketItems.$inferInsert> = { updatedAt: new Date() };
  const events: string[] = [];
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t || t.length > 160) return fail("title");
    if (t !== item.title) set.title = t;
  }
  if (patch.detail !== undefined) {
    const d = patch.detail.trim();
    if (d.length > 2000) return fail("long");
    if (d !== (item.detail ?? "")) set.detail = d || null;
  }
  if (patch.priority !== undefined) {
    if (!isPriority(patch.priority)) return fail("bad");
    if (patch.priority !== item.priority) {
      set.priority = patch.priority;
      events.push(`Priority set to ${PRIORITY_LABEL[patch.priority].toLowerCase()}`);
    }
  }
  if (patch.repeat !== undefined) {
    if (!isRepeat(patch.repeat)) return fail("bad");
    if (patch.repeat !== item.repeat) set.repeat = patch.repeat;
  }
  if (patch.dueAt !== undefined && patch.dueAt?.getTime() !== item.dueAt?.getTime()) {
    set.dueAt = patch.dueAt;
    set.remindedAt = null; // a new date earns a new reminder
    events.push(patch.dueAt ? `Due date moved to ${dueText(patch.dueAt, new Date())}` : "Due date removed");
  }
  await db.transaction(async (tx) => {
    await tx.update(docketItems).set(set).where(eq(docketItems.id, id));
    for (const e of events) await log(tx, id, actor.id, e);
  });
  return { ok: true, id };
}

/** Moves an item to another person or pool. */
export async function reassign(actor: Viewer, id: number, target: Target): Promise<Result> {
  const item = await workable(actor, id);
  if (!item) return fail("gone");
  const to = await checkTarget(actor, target);
  if (!to) return fail("target");
  await db.transaction(async (tx) => {
    await tx
      .update(docketItems)
      .set({ assigneeId: to.userId, assigneeRole: to.userId ? null : to.role, assignedAt: new Date(), updatedAt: new Date(), remindedAt: null })
      .where(eq(docketItems.id, id));
    await log(tx, id, actor.id, to.userId ? `Handed to ${to.name}` : `Put in ${to.name}`);
  });
  await tell(actor, to, id, item.title);
  return { ok: true, id };
}

/** Takes an item out of a role's pool. Atomic: of two people asking at once, one gets it and the other hears "gone". */
export async function claim(actor: Viewer, id: number): Promise<Result> {
  if (!Number.isInteger(id)) return fail("gone");
  const [row] = await db
    .update(docketItems)
    .set({ assigneeId: actor.id, assigneeRole: null, assignedAt: new Date(), updatedAt: new Date(), remindedAt: null })
    .where(
      and(eq(docketItems.id, id), isNull(docketItems.assigneeId), inArray(docketItems.status, OPEN), actor.role === "admin" ? isNotNull(docketItems.assigneeRole) : eq(docketItems.assigneeRole, actor.role)),
    )
    .returning({ title: docketItems.title, createdBy: docketItems.createdBy });
  if (!row) return fail("gone");
  await log(db, id, actor.id, `Taken by ${actor.name || "a teammate"}`);
  if (row.createdBy && row.createdBy !== actor.id) await alert(row.createdBy, `${firstName(actor.name)} took: ${row.title}`, href(id));
  return { ok: true, id };
}

/** Marks an item open, in progress, waiting, done or dropped. Finishing a repeating item opens the next one. */
export async function setStatus(actor: Viewer, id: number, status: DocketStatus): Promise<Result> {
  const item = await workable(actor, id);
  if (!item) return fail("gone");
  if (item.status === status) return { ok: true, id };
  const now = new Date();
  const finished = status === "done" || status === "dropped";
  await db.transaction(async (tx) => {
    await tx.update(docketItems).set({ status, doneAt: finished ? now : null, updatedAt: now }).where(eq(docketItems.id, id));
    await log(tx, id, actor.id, { open: "Reopened", doing: "Started", waiting: "Waiting on someone", done: "Marked done", dropped: "Dropped" }[status]);
    const next = status === "done" ? nextDue(item.dueAt, item.repeat, now) : null;
    if (next) {
      const [again] = await tx
        .insert(docketItems)
        .values({
          title: item.title,
          detail: item.detail,
          priority: item.priority,
          repeat: item.repeat,
          dueAt: next,
          createdBy: item.createdBy,
          assigneeId: item.assigneeId,
          assigneeRole: item.assigneeRole,
          subjectKind: item.subjectKind,
          subjectId: item.subjectId,
        })
        .returning({ id: docketItems.id });
      await log(tx, again.id, actor.id, `Repeat of an item finished ${istDate(now)}`);
      await log(tx, id, actor.id, `Next one is due ${dueText(next, now)}`);
    }
  });
  // The person who gave the work hears when someone else finishes it.
  if (finished && item.createdBy && item.createdBy !== actor.id) await alert(item.createdBy, `${firstName(actor.name)} ${status === "done" ? "finished" : "dropped"}: ${item.title}`, href(id));
  return { ok: true, id };
}

export async function addNote(actor: Viewer, id: number, kind: string, body: string): Promise<Result> {
  const text = body.trim();
  if (!isNoteKind(kind) || !text) return fail("bad");
  if (text.length > 2000) return fail("long");
  if (!(await workable(actor, id))) return fail("gone");
  await db.transaction(async (tx) => {
    await log(tx, id, actor.id, text, kind);
    await tx.update(docketItems).set({ updatedAt: new Date() }).where(eq(docketItems.id, id));
  });
  return { ok: true, id };
}

export async function deleteItem(actor: Viewer, id: number): Promise<Result> {
  const item = await workable(actor, id);
  if (!item) return fail("gone");
  if (actor.role !== "admin" && item.createdBy !== actor.id) return fail("forbidden");
  await db.delete(docketItems).where(eq(docketItems.id, id));
  return { ok: true, id };
}

// ---------- Reminders and the team's view ----------

/**
 * Tells the owner of each open item that falls due within a day (or is already late), once. Items in a role's pool go
 * to everyone in the role. Run by the nightly maintenance job; run it more often and the reminders arrive nearer the time.
 */
export async function sendDueReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 864e5);
  const due = await db
    .select({ id: docketItems.id, title: docketItems.title, dueAt: docketItems.dueAt, assigneeId: docketItems.assigneeId, assigneeRole: docketItems.assigneeRole })
    .from(docketItems)
    .where(and(inArray(docketItems.status, OPEN), isNull(docketItems.remindedAt), isNotNull(docketItems.dueAt), lte(docketItems.dueAt, soon)));
  for (const d of due) {
    // Marked first, so a second run at the same moment can't send it twice.
    const [got] = await db.update(docketItems).set({ remindedAt: now }).where(and(eq(docketItems.id, d.id), isNull(docketItems.remindedAt))).returning({ id: docketItems.id });
    if (!got) continue;
    const who = d.assigneeId ? [d.assigneeId] : isStaffRole(d.assigneeRole) ? await staffWith(d.assigneeRole, "") : [];
    const late = d.dueAt!.getTime() < now.getTime();
    await alert(who, `${late ? "Overdue" : "Due soon"}: ${d.title}`, href(d.id));
  }
  return due.length;
}

/** Each team member's load, and what waits unclaimed in each pool. For the super admin. */
export async function workload(now = new Date()) {
  const open = sql`d.status in ('open', 'doing', 'waiting')`;
  const people = await db.execute(sql`
    select u.id, u.name, u.role, u.image,
      (select count(*) from docket_items d where d.assignee_id = u.id and ${open})::int as open,
      (select count(*) from docket_items d where d.assignee_id = u.id and ${open} and d.due_at < ${now.toISOString()}::timestamptz)::int as overdue,
      (select count(*) from docket_items d where d.assignee_id = u.id and d.status = 'done' and d.done_at > ${now.toISOString()}::timestamptz - interval '7 days')::int as done_week,
      (select round(100.0 * count(*) filter (where d.done_at <= d.due_at) / nullif(count(*), 0)) from docket_items d
        where d.assignee_id = u.id and d.status = 'done' and d.due_at is not null and d.done_at > ${now.toISOString()}::timestamptz - interval '30 days') as on_time,
      (select round(avg(extract(epoch from d.done_at - d.assigned_at) / 3600)::numeric, 1) from docket_items d
        where d.assignee_id = u.id and d.status = 'done' and d.done_at > ${now.toISOString()}::timestamptz - interval '30 days') as hours
    from "user" u
    where u.role in (${sql.join(STAFF_ROLES.map((r) => sql`${r}`), sql`, `)}) and coalesce(u.banned, false) = false
    order by u.role, u.name`);
  const pools = await db
    .select({ role: docketItems.assigneeRole, n: count() })
    .from(docketItems)
    .where(and(isNotNull(docketItems.assigneeRole), inArray(docketItems.status, OPEN)))
    .groupBy(docketItems.assigneeRole);
  return {
    people: (people.rows as { id: string; name: string | null; role: StaffRole; image: string | null; open: number; overdue: number; done_week: number; on_time: string | null; hours: string | null }[]).map((r) => ({
      id: r.id,
      name: r.name || "No name",
      role: r.role,
      image: r.image,
      open: r.open,
      overdue: r.overdue,
      doneWeek: r.done_week,
      onTimePct: r.on_time === null ? null : Number(r.on_time),
      hours: r.hours === null ? null : Number(r.hours),
    })),
    pools: pools.flatMap((p) => (isStaffRole(p.role) ? [{ role: p.role, n: p.n }] : [])),
  };
}

/** Items finished per day for the last `days` days, today last, zero-filled. */
export async function finishedPerDay(days = 14) {
  const r = await db.execute(sql`
    select to_char(d, 'DD Mon') as k, coalesce(c.n, 0)::int as n
    from generate_series((now() at time zone 'Asia/Kolkata')::date - ${days - 1}::int, (now() at time zone 'Asia/Kolkata')::date, interval '1 day') d
    left join (
      select (done_at at time zone 'Asia/Kolkata')::date as day, count(*)::int as n from docket_items
      where status = 'done' and done_at > now() - make_interval(days => ${days}) group by 1
    ) c on c.day = d::date
    order by d`);
  return (r.rows as { k: string; n: number }[]).map((x) => ({ label: x.k, value: Number(x.n) }));
}

