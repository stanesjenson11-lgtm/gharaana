// The numbers behind the staff dashboard. Days and weeks are counted in India time. Each function is one card's worth
// of data, so a role only pays for the cards it can see.
import { aliasedTable, and, asc, count, desc, eq, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "./db.ts";
import { ROLE_LABEL, STAFF_ROLES, isStaffRole } from "./roles.ts";
import { auditLogs, leads, listings, tickets, user } from "./schema.ts";

const rows = async <T>(q: SQL) => (await db.execute(q)).rows as T[];
const staffList = sql.join(STAFF_ROLES.map((r) => sql`${r}`), sql`, `);
const isClient = or(isNull(user.role), notInArray(user.role, [...STAFF_ROLES]))!;
const daysSince = (d: Date | string | null) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 864e5)) : null);

export type Point = { label: string; value: number };

// ---------- Listings ----------

export async function reviewStats() {
  const [r] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${listings.status} = 'pending_review')`.mapWith(Number),
      live: sql<number>`count(*) filter (where ${listings.status} = 'active')`.mapWith(Number),
      visited: sql<number>`count(*) filter (where ${listings.status} = 'active' and ${listings.visitVerifiedAt} is not null)`.mapWith(Number),
      expiring: sql<number>`count(*) filter (where ${listings.status} = 'active' and ${listings.expiresAt} < now() + interval '7 days')`.mapWith(Number),
      approvedWeek: sql<number>`count(*) filter (where ${listings.reviewedAt} > now() - interval '7 days' and ${listings.status} in ('active', 'rented', 'expired'))`.mapWith(Number),
      rejectedWeek: sql<number>`count(*) filter (where ${listings.reviewedAt} > now() - interval '7 days' and ${listings.status} = 'rejected')`.mapWith(Number),
      oldestPending: sql<Date | null>`min(${listings.createdAt}) filter (where ${listings.status} = 'pending_review')`,
    })
    .from(listings);
  return { ...r, oldestPendingDays: daysSince(r.oldestPending) };
}

export const listingsByStatus = () =>
  db.select({ status: listings.status, n: count() }).from(listings).groupBy(listings.status);

/** New listings per day for the last `days` days, today last, zero-filled. */
export async function listingsPerDay(days = 14): Promise<Point[]> {
  const r = await rows<{ k: string; n: number }>(sql`
    select to_char(d, 'DD Mon') as k, coalesce(c.n, 0)::int as n
    from generate_series((now() at time zone 'Asia/Kolkata')::date - ${days - 1}::int, (now() at time zone 'Asia/Kolkata')::date, interval '1 day') d
    left join (
      select (created_at at time zone 'Asia/Kolkata')::date as day, count(*)::int as n from listings
      where created_at > now() - make_interval(days => ${days}) group by 1
    ) c on c.day = d::date
    order by d`);
  return r.map((x) => ({ label: x.k, value: Number(x.n) }));
}

// ---------- Clients ----------

export async function clientStats() {
  const [r] = await db
    .select({
      total: count(),
      week: sql<number>`count(*) filter (where ${user.createdAt} > now() - interval '7 days')`.mapWith(Number),
      before: sql<number>`count(*) filter (where ${user.createdAt} > now() - interval '14 days' and ${user.createdAt} <= now() - interval '7 days')`.mapWith(Number),
      banned: sql<number>`count(*) filter (where ${user.banned})`.mapWith(Number),
    })
    .from(user)
    .where(isClient);
  return r;
}

/** New clients per week for the last `weeks` weeks (Monday to Sunday), this week last. */
export async function clientsPerWeek(weeks = 8): Promise<Point[]> {
  const r = await rows<{ k: string; n: number }>(sql`
    select to_char(w, 'DD Mon') as k, coalesce(c.n, 0)::int as n
    from generate_series(
      date_trunc('week', now() at time zone 'Asia/Kolkata') - make_interval(weeks => ${weeks - 1}),
      date_trunc('week', now() at time zone 'Asia/Kolkata'), interval '1 week') w
    left join (
      select date_trunc('week', created_at::timestamptz at time zone 'Asia/Kolkata') as wk, count(*)::int as n from "user"
      where created_at > now() - make_interval(weeks => ${weeks}) and (role is null or role not in (${staffList})) group by 1
    ) c on c.wk = w
    order by w`);
  return r.map((x) => ({ label: x.k, value: Number(x.n) }));
}

// ---------- Leads ----------

export async function leadStats() {
  const byStage = await db.select({ stage: leads.crmStage, n: count() }).from(leads).groupBy(leads.crmStage);
  const [w] = await db
    .select({
      week: sql<number>`count(*) filter (where ${leads.createdAt} > now() - interval '7 days')`.mapWith(Number),
      before: sql<number>`count(*) filter (where ${leads.createdAt} > now() - interval '14 days' and ${leads.createdAt} <= now() - interval '7 days')`.mapWith(Number),
    })
    .from(leads);
  return { byStage, ...w };
}

/** Requests by day of the week (Monday first) over the last 90 days. */
export async function leadsByWeekday(): Promise<Point[]> {
  const r = await rows<{ k: number; n: number }>(sql`
    select extract(isodow from created_at at time zone 'Asia/Kolkata')::int as k, count(*)::int as n from leads
    where created_at > now() - interval '90 days' group by 1`);
  const by = new Map(r.map((x) => [Number(x.k), Number(x.n)]));
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({ label, value: by.get(i + 1) ?? 0 }));
}

// ---------- Support ----------

export async function ticketStats() {
  const byStatus = await db.select({ status: tickets.status, n: count() }).from(tickets).groupBy(tickets.status);
  const byTopic = await db.select({ topic: tickets.topic, n: count() }).from(tickets).where(eq(tickets.status, "open")).groupBy(tickets.topic);
  const [o] = await db
    .select({ oldest: sql<Date | null>`min(${tickets.updatedAt})` })
    .from(tickets)
    .where(eq(tickets.status, "open"));
  return { byStatus, byTopic, oldestOpenDays: daysSince(o.oldest) };
}

// ---------- What needs someone today ----------

const total = sql<number>`count(*) over()`.mapWith(Number);

export async function attention() {
  const [pending, unvisited, waiting, newLeads] = await Promise.all([
    db
      .select({ id: listings.id, title: listings.title, area: listings.area, since: listings.createdAt, total })
      .from(listings)
      .where(and(eq(listings.status, "pending_review"), sql`${listings.createdAt} < now() - interval '2 days'`))
      .orderBy(asc(listings.createdAt))
      .limit(5),
    db
      .select({ id: listings.id, title: listings.title, area: listings.area, since: listings.confirmedAt, total })
      .from(listings)
      .where(and(eq(listings.status, "active"), isNull(listings.visitVerifiedAt)))
      .orderBy(asc(listings.confirmedAt))
      .limit(5),
    db
      .select({ id: tickets.id, topic: tickets.topic, who: user.name, since: tickets.updatedAt, total })
      .from(tickets)
      .innerJoin(user, eq(user.id, tickets.userId))
      .where(eq(tickets.status, "open"))
      .orderBy(asc(tickets.updatedAt))
      .limit(5),
    db
      .select({ id: leads.id, kind: leads.kind, title: listings.title, who: user.name, since: leads.createdAt, total })
      .from(leads)
      .innerJoin(listings, eq(listings.id, leads.listingId))
      .innerJoin(user, eq(user.id, leads.requesterId))
      .where(and(eq(leads.crmStage, "new"), sql`${leads.createdAt} < now() - interval '1 day'`))
      .orderBy(asc(leads.createdAt))
      .limit(5),
  ]);
  const t = <T extends { total: number }>(l: T[]) => l[0]?.total ?? 0;
  return {
    pending: { rows: pending, total: t(pending) },
    unvisited: { rows: unvisited, total: t(unvisited) },
    waiting: { rows: waiting, total: t(waiting) },
    newLeads: { rows: newLeads, total: t(newLeads) },
  };
}

// ---------- Activity (super admin) ----------

export const ACTION_TEXT: Record<string, string> = {
  AUTH_SIGN_IN: "signed in",
  AUTH_SIGN_OUT: "signed out",
  AUTH_SESSION_IDLE: "was signed out after sitting idle",
  ACCOUNT_DELETED: "deleted their account",
  ADMIN_BAN_USER: "suspended a client",
  ADMIN_UNBAN_USER: "lifted a suspension",
  ADMIN_APPROVE_LISTING: "approved a listing",
  ADMIN_REJECT_LISTING: "rejected a listing",
  ADMIN_EDIT_LISTING: "edited a listing",
  ADMIN_LISTING_STATUS: "changed where a listing stands",
  ADMIN_LISTING_PHOTOS: "changed a listing's photos",
  ADMIN_DELETE_LISTING: "deleted a listing",
  ADMIN_ROLE_CHANGED: "changed someone's staff role",
  ADMIN_STAFF_INVITED: "invited someone to the team",
  ADMIN_STAFF_INVITE_REVOKED: "withdrew a team invite",
  ADMIN_MFA_OK: "passed the authenticator check",
  ADMIN_MFA_FAILED: "entered a wrong authenticator code",
  ADMIN_MFA_LOCKED: "was locked out after wrong codes",
  ADMIN_MFA_ENROLLED: "set up an authenticator",
  ADMIN_MFA_RESET: "had their authenticator reset",
  PHONE_REVEALED: "viewed an owner's number",
  CONSENT_RECORDED: "recorded consent",
};

/** One audit event as a sentence, naming the person it was done to where that matters. */
function sentence(action: string, target: string | null, details: string | null) {
  const them = target || "a client";
  if (action === "ADMIN_ROLE_CHANGED") {
    let to = "";
    try {
      to = JSON.parse(details ?? "{}").to ?? "";
    } catch {}
    return to === "member" ? `removed ${them}'s staff access` : `made ${them} ${isStaffRole(to) ? ROLE_LABEL[to] : "staff"}`;
  }
  if (action === "ADMIN_BAN_USER") return `suspended ${them}`;
  if (action === "ADMIN_UNBAN_USER") return `lifted ${them}'s suspension`;
  return ACTION_TEXT[action] ?? action.toLowerCase().replaceAll("_", " ");
}

/** The latest staff events, in words. Client sign-ins stay out: they would drown these. */
export async function recentActivity(limit = 8) {
  const target = aliasedTable(user, "target");
  const r = await db
    .select({ action: auditLogs.action, at: auditLogs.createdAt, who: user.name, targetName: target.name, details: auditLogs.details })
    .from(auditLogs)
    .leftJoin(user, eq(user.id, auditLogs.userId))
    .leftJoin(target, eq(target.id, auditLogs.targetId))
    .where(sql`${auditLogs.action} like 'ADMIN\_%'`)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  return r.map((x) => ({ who: x.who || "A former team member", text: sentence(x.action, x.targetName, x.details), at: x.at }));
}
