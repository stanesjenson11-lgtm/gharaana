// The team's view of the people on the platform: who they are, what they own, asked for and wrote in about.
// Admin pages only: it shows phone numbers and private notes.
import { and, count, desc, eq, ilike, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import { ACTION_TEXT } from "./dashboard.ts";
import { db } from "./db.ts";
import { STAFF_ROLES } from "./roles.ts";
import { auditLogs, clientNotes, contactReveals, conversations, leads, listings, savedSearches, shortlists, tickets, user } from "./schema.ts";

export const CLIENT_FILTERS = [
  ["all", "Everyone"],
  ["owners", "Own homes"],
  ["requests", "Asked for a visit or call"],
  ["open", "Waiting on support"],
  ["new", "New this week"],
  ["suspended", "Suspended"],
] as const;
export type ClientFilter = (typeof CLIENT_FILTERS)[number][0];
export const isClientFilter = (f: unknown): f is ClientFilter => CLIENT_FILTERS.some(([v]) => v === f);

export const PAGE_SIZE = 25;

const notStaff = or(isNull(user.role), notInArray(user.role, [...STAFF_ROLES]))!;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// One definition per filter, used both to narrow the list and to count the chips above it. The subqueries name
// "user"."id" outright: in a one-table select Drizzle drops the qualifier, and a bare id would mean the subquery's own.
const FILTER_SQL: Record<Exclude<ClientFilter, "all">, SQL> = {
  owners: sql`exists (select 1 from listings l where l.owner_id = "user"."id")`,
  requests: sql`exists (select 1 from leads x where x.requester_id = "user"."id")`,
  open: sql`exists (select 1 from tickets t where t.user_id = "user"."id" and t.status = 'open')`,
  new: sql`${user.createdAt} > now() - interval '7 days'`,
  suspended: sql`coalesce(${user.banned}, false)`,
};

function searchWhere(q: string) {
  const term = q.trim().slice(0, 60);
  if (!term) return undefined;
  // A phone search is only a search made of phone-number characters; "Asha 2" is a name.
  const digits = /^[\d\s+()-]+$/.test(term) ? term.replace(/\D/g, "") : "";
  return or(ilike(user.name, `%${escapeLike(term)}%`), digits ? ilike(user.phoneNumber, `%${digits}%`) : undefined, term.includes("@") ? ilike(user.email, `%${escapeLike(term)}%`) : undefined);
}

const counts = {
  homes: sql<number>`(select count(*) from listings l where l.owner_id = "user"."id")`.mapWith(Number),
  requests: sql<number>`(select count(*) from leads x where x.requester_id = "user"."id")`.mapWith(Number),
  tickets: sql<number>`(select count(*) from tickets t where t.user_id = "user"."id")`.mapWith(Number),
  openTickets: sql<number>`(select count(*) from tickets t where t.user_id = "user"."id" and t.status = 'open')`.mapWith(Number),
};

/** Clients (not staff), newest first, one page at a time. */
export async function listClients({ q = "", filter = "all", page = 1 }: { q?: string; filter?: ClientFilter; page?: number }) {
  const cond = and(notStaff, searchWhere(q), filter === "all" ? undefined : FILTER_SQL[filter]);
  const p = Math.max(1, Math.floor(page) || 1);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, phone: user.phoneNumber, email: user.email, image: user.image, banned: user.banned, createdAt: user.createdAt, ...counts })
      .from(user)
      .where(cond)
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(PAGE_SIZE)
      .offset((p - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(user).where(cond),
  ]);
  return { rows, total: n, page: p, pages: Math.max(1, Math.ceil(n / PAGE_SIZE)) };
}

/** How many clients each filter chip would show. */
export async function clientFilterCounts() {
  const [r] = await db
    .select({
      all: count(),
      owners: sql<number>`count(*) filter (where ${FILTER_SQL.owners})`.mapWith(Number),
      requests: sql<number>`count(*) filter (where ${FILTER_SQL.requests})`.mapWith(Number),
      open: sql<number>`count(*) filter (where ${FILTER_SQL.open})`.mapWith(Number),
      new: sql<number>`count(*) filter (where ${FILTER_SQL.new})`.mapWith(Number),
      suspended: sql<number>`count(*) filter (where ${FILTER_SQL.suspended})`.mapWith(Number),
    })
    .from(user)
    .where(notStaff);
  return r;
}

/** Everything the team knows about one person. Undefined when there is no such account. */
export async function clientDetail(id: string) {
  const [person] = await db
    .select({
      id: user.id,
      name: user.name,
      phone: user.phoneNumber,
      phoneVerified: user.phoneNumberVerified,
      email: user.email,
      image: user.image,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, id));
  if (!person) return undefined;

  const one = <T>(rows: T[]) => rows[0];
  const [homes, requests, support, notes, activity, reveals, saved, searches, chats] = await Promise.all([
    db.select({ id: listings.id, title: listings.title, area: listings.area, status: listings.status, createdAt: listings.createdAt }).from(listings).where(eq(listings.ownerId, id)).orderBy(desc(listings.createdAt)).limit(20),
    db
      .select({ id: leads.id, kind: leads.kind, stage: leads.crmStage, createdAt: leads.createdAt, listingId: listings.id, title: listings.title })
      .from(leads)
      .innerJoin(listings, eq(listings.id, leads.listingId))
      .where(eq(leads.requesterId, id))
      .orderBy(desc(leads.createdAt))
      .limit(20),
    db.select({ id: tickets.id, topic: tickets.topic, status: tickets.status, updatedAt: tickets.updatedAt }).from(tickets).where(eq(tickets.userId, id)).orderBy(desc(tickets.updatedAt)).limit(20),
    db
      .select({ id: clientNotes.id, body: clientNotes.body, createdAt: clientNotes.createdAt, author: user.name })
      .from(clientNotes)
      .leftJoin(user, eq(user.id, clientNotes.authorId))
      .where(eq(clientNotes.clientId, id))
      .orderBy(desc(clientNotes.createdAt), desc(clientNotes.id))
      .limit(30),
    activityFor(id),
    db.select({ n: count() }).from(contactReveals).where(eq(contactReveals.userId, id)).then(one),
    db.select({ n: count() }).from(shortlists).where(eq(shortlists.userId, id)).then(one),
    db.select({ n: count() }).from(savedSearches).where(eq(savedSearches.userId, id)).then(one),
    db.select({ n: count() }).from(conversations).where(eq(conversations.buyerId, id)).then(one),
  ]);
  return {
    person,
    homes,
    requests,
    support,
    notes,
    activity,
    totals: { numbersSeen: reveals.n, savedHomes: saved.n, savedSearches: searches.n, chats: chats.n },
  };
}

/** What the person did, and what staff did to them, newest first. */
async function activityFor(id: string) {
  const actor = db.$with("actor").as(db.select({ id: user.id, name: user.name }).from(user));
  const rows = await db
    .with(actor)
    .select({ action: auditLogs.action, at: auditLogs.createdAt, by: auditLogs.userId, who: actor.name })
    .from(auditLogs)
    .leftJoin(actor, eq(actor.id, auditLogs.userId))
    .where(or(eq(auditLogs.userId, id), eq(auditLogs.targetId, id)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(10);
  const done: Record<string, string> = { ADMIN_BAN_USER: "suspended this client", ADMIN_UNBAN_USER: "lifted the suspension", ADMIN_ROLE_CHANGED: "changed their staff role" };
  return rows.map((r) => ({ at: r.at, text: r.by === id ? (ACTION_TEXT[r.action] ?? r.action.toLowerCase().replaceAll("_", " ")) : `${r.who || "Staff"} ${done[r.action] ?? "updated this account"}` }));
}

export type NoteResult = "ok" | "empty" | "long" | "gone";
export const MAX_NOTE = 2000;

/** Adds a private note to a client's file. */
export async function addNote(authorId: string, clientId: string, text: string): Promise<NoteResult> {
  const body = text.trim();
  if (!body) return "empty";
  if (body.length > MAX_NOTE) return "long";
  const [exists] = await db.select({ id: user.id }).from(user).where(eq(user.id, clientId));
  if (!exists) return "gone";
  await db.insert(clientNotes).values({ clientId, authorId, body });
  return "ok";
}
