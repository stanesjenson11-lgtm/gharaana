// Support tickets: one person and the team, in a thread. Staff see every ticket; everyone else only their own.
import { aliasedTable, and, asc, count, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { notify } from "./notify.ts";
import { listings, ticketMessages, tickets, user } from "./schema.ts";

export { isTopic, TICKET_STATUS, TOPICS, topicLabel, type Topic } from "./support-topics.ts";
import type { Topic } from "./support-topics.ts";

// ponytail: a flat cap against spam; staff can still reply to anything.
export const TICKETS_PER_DAY = 5;
const MIN = 10;
const MAX = 3000;

type Problem = "short" | "long" | "limit" | "gone";
const check = (body: string): Problem | null => (body.trim().length < MIN ? "short" : body.trim().length > MAX ? "long" : null);

export async function openTicket(userId: string, topic: Topic, body: string, listingId?: string | null): Promise<{ ok: true; id: number } | { ok: false; reason: Problem }> {
  const problem = check(body);
  if (problem) return { ok: false, reason: problem };
  const [{ n }] = await db
    .select({ n: count() })
    .from(tickets)
    .where(and(eq(tickets.userId, userId), gt(tickets.createdAt, sql`now() - interval '1 day'`)));
  if (n >= TICKETS_PER_DAY) return { ok: false, reason: "limit" };
  // A listing id from a link is only kept if that listing exists.
  const [listing] = listingId ? await db.select({ id: listings.id }).from(listings).where(eq(listings.id, listingId)) : [];
  return db.transaction(async (tx) => {
    const [t] = await tx.insert(tickets).values({ userId, topic, listingId: listing?.id ?? null }).returning({ id: tickets.id });
    await tx.insert(ticketMessages).values({ ticketId: t.id, authorId: userId, body: body.trim() });
    return { ok: true as const, id: t.id };
  });
}

/** The thread, or undefined unless the viewer opened it or is staff. */
export async function ticketThread(ticketId: number, viewer: { id: string; staff: boolean }) {
  const owner = aliasedTable(user, "owner");
  const [t] = await db
    .select({
      id: tickets.id,
      userId: tickets.userId,
      topic: tickets.topic,
      status: tickets.status,
      createdAt: tickets.createdAt,
      listingId: listings.id,
      listingTitle: listings.title,
      personName: owner.name,
      personPhone: owner.phoneNumber,
    })
    .from(tickets)
    .innerJoin(owner, eq(owner.id, tickets.userId))
    .leftJoin(listings, eq(listings.id, tickets.listingId))
    .where(eq(tickets.id, ticketId));
  if (!t || (!viewer.staff && t.userId !== viewer.id)) return undefined;
  const messages = await db
    .select({ id: ticketMessages.id, body: ticketMessages.body, fromStaff: ticketMessages.fromStaff, createdAt: ticketMessages.createdAt })
    .from(ticketMessages)
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(asc(ticketMessages.id));
  return { ...t, messages };
}

/** A reply from the person reopens the ticket; one from staff marks it answered. */
export async function replyToTicket(ticketId: number, viewer: { id: string; staff: boolean }, body: string): Promise<{ ok: true } | { ok: false; reason: Problem }> {
  const problem = check(body);
  if (problem) return { ok: false, reason: problem };
  const [t] = await db.select({ userId: tickets.userId }).from(tickets).where(eq(tickets.id, ticketId));
  if (!t || (!viewer.staff && t.userId !== viewer.id)) return { ok: false, reason: "gone" };
  const fromStaff = viewer.staff && t.userId !== viewer.id;
  await db.transaction(async (tx) => {
    await tx.insert(ticketMessages).values({ ticketId, authorId: viewer.id, fromStaff, body: body.trim() });
    await tx
      .update(tickets)
      .set({ status: fromStaff ? "answered" : "open", updatedAt: sql`now()` })
      .where(eq(tickets.id, ticketId));
  });
  if (fromStaff) await notify(t.userId, "Our team replied to your support request", `/help/${ticketId}`);
  return { ok: true };
}

export async function closeTicket(ticketId: number) {
  await db.update(tickets).set({ status: "closed", updatedAt: sql`now()` }).where(eq(tickets.id, ticketId));
}

export async function ticketsOf(userId: string) {
  return db
    .select({ id: tickets.id, topic: tickets.topic, status: tickets.status, updatedAt: tickets.updatedAt })
    .from(tickets)
    .where(eq(tickets.userId, userId))
    .orderBy(desc(tickets.updatedAt))
    .limit(50);
}

/** The team's queue: tickets waiting on them first, oldest first, so nobody waits longest. */
export async function supportQueue(status: "open" | "answered" | "closed" = "open") {
  return db
    .select({
      id: tickets.id,
      topic: tickets.topic,
      status: tickets.status,
      updatedAt: tickets.updatedAt,
      name: user.name,
      phone: user.phoneNumber,
      listingTitle: listings.title,
      first: sql<string>`(select m.body from ticket_messages m where m.ticket_id = tickets.id order by m.id limit 1)`,
    })
    .from(tickets)
    .innerJoin(user, eq(user.id, tickets.userId))
    .leftJoin(listings, eq(listings.id, tickets.listingId))
    .where(eq(tickets.status, status))
    .orderBy(status === "closed" ? desc(tickets.updatedAt) : asc(tickets.updatedAt))
    .limit(200);
}
