// In-app chat between a buyer and an owner: one thread per buyer and home. Neither side sees the other's number here.
import { aliasedTable, and, asc, count, desc, eq, gt, or, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { live } from "./listings.ts";
import { conversations, listings, messages, user } from "./schema.ts";

export const MAX_MESSAGE = 2000;
// ponytail: a flat per-person cap against spam; tune it once real conversations exist.
export const MESSAGES_PER_HOUR = 60;

export type ChatMessage = { id: number; body: string; createdAt: Date; mine: boolean };

/** Opens (or reopens) the buyer's thread about a home. */
export async function startConversation(buyerId: string, listingId: string): Promise<{ ok: true; id: number } | { ok: false; reason: "gone" | "sample" | "own" }> {
  const [l] = await db.select({ ownerId: listings.ownerId, sample: listings.sample }).from(listings).where(and(eq(listings.id, listingId), live));
  if (!l) return { ok: false, reason: "gone" };
  if (l.sample) return { ok: false, reason: "sample" };
  if (l.ownerId === buyerId) return { ok: false, reason: "own" };
  // The no-op update makes Postgres return the existing row's id on a repeat.
  const [row] = await db
    .insert(conversations)
    .values({ listingId, buyerId, ownerId: l.ownerId })
    .onConflictDoUpdate({ target: [conversations.listingId, conversations.buyerId], set: { listingId } })
    .returning({ id: conversations.id });
  return { ok: true, id: row.id };
}

async function sideOf(conversationId: number, userId: string) {
  const [c] = await db
    .select({ buyerId: conversations.buyerId })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), or(eq(conversations.buyerId, userId), eq(conversations.ownerId, userId))));
  return c ? (c.buyerId === userId ? "buyer" : "owner") : null;
}

/** The thread's header, or undefined for anyone who isn't one of its two people. */
export async function conversationFor(conversationId: number, userId: string) {
  const other = aliasedTable(user, "other");
  const [c] = await db
    .select({ id: conversations.id, listingId: listings.id, title: listings.title, otherName: other.name, buyerId: conversations.buyerId })
    .from(conversations)
    .innerJoin(listings, eq(listings.id, conversations.listingId))
    .innerJoin(other, sql`${other.id} = case when ${conversations.buyerId} = ${userId} then ${conversations.ownerId} else ${conversations.buyerId} end`)
    .where(and(eq(conversations.id, conversationId), or(eq(conversations.buyerId, userId), eq(conversations.ownerId, userId))));
  return c && { ...c, side: c.buyerId === userId ? ("buyer" as const) : ("owner" as const) };
}

/** Messages newer than `afterId` (the latest 200 on first load), and marks the thread read for this person. */
export async function messagesAfter(conversationId: number, userId: string, afterId = 0): Promise<ChatMessage[] | null> {
  const side = await sideOf(conversationId, userId);
  if (!side) return null;
  const rows = await db
    .select({ id: messages.id, senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), gt(messages.id, afterId)))
    .orderBy(desc(messages.id))
    .limit(200);
  await db
    .update(conversations)
    .set(side === "buyer" ? { buyerReadAt: sql`now()` } : { ownerReadAt: sql`now()` })
    .where(eq(conversations.id, conversationId));
  return rows.reverse().map(({ senderId, ...m }) => ({ ...m, mine: senderId === userId }));
}

export async function sendMessage(conversationId: number, userId: string, body: string): Promise<{ ok: true } | { ok: false; reason: "empty" | "long" | "gone" | "limit" }> {
  const text = body.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > MAX_MESSAGE) return { ok: false, reason: "long" };
  const side = await sideOf(conversationId, userId);
  if (!side) return { ok: false, reason: "gone" };
  const [{ n }] = await db
    .select({ n: count() })
    .from(messages)
    .where(and(eq(messages.senderId, userId), gt(messages.createdAt, sql`now() - interval '1 hour'`)));
  if (n >= MESSAGES_PER_HOUR) return { ok: false, reason: "limit" };
  await db.transaction(async (tx) => {
    await tx.insert(messages).values({ conversationId, senderId: userId, body: text });
    await tx
      .update(conversations)
      .set({ lastMessageAt: sql`now()`, ...(side === "buyer" ? { buyerReadAt: sql`now()` } : { ownerReadAt: sql`now()` }) })
      .where(eq(conversations.id, conversationId));
  });
  return { ok: true };
}

// Raw names in the subqueries on purpose: drizzle renders ${conversations.id} unqualified, which would bind to m.id.
const myReadAt = (userId: string) => sql`case when conversations.buyer_id = ${userId} then conversations.buyer_read_at else conversations.owner_read_at end`;
const unreadIn = (userId: string) =>
  sql<number>`(select count(*) from messages m where m.conversation_id = conversations.id and m.sender_id <> ${userId} and m.created_at > ${myReadAt(userId)})`.mapWith(Number);
// An owner only sees a thread once the buyer has written something.
const visibleTo = (userId: string) =>
  or(eq(conversations.buyerId, userId), and(eq(conversations.ownerId, userId), sql`exists (select 1 from messages m where m.conversation_id = conversations.id)`));

export async function inbox(userId: string, limit = 100) {
  const other = aliasedTable(user, "other");
  return db
    .select({
      id: conversations.id,
      listingId: listings.id,
      title: listings.title,
      otherName: other.name,
      mineIsBuyer: sql<boolean>`(${conversations.buyerId} = ${userId})`,
      lastMessageAt: conversations.lastMessageAt,
      last: sql<string | null>`(select m.body from messages m where m.conversation_id = conversations.id order by m.id desc limit 1)`,
      unread: unreadIn(userId),
    })
    .from(conversations)
    .innerJoin(listings, eq(listings.id, conversations.listingId))
    .innerJoin(other, sql`${other.id} = case when ${conversations.buyerId} = ${userId} then ${conversations.ownerId} else ${conversations.buyerId} end`)
    .where(visibleTo(userId))
    .orderBy(desc(conversations.lastMessageAt), asc(conversations.id))
    .limit(limit);
}

/** For the header badge. */
export async function unreadTotal(userId: string) {
  const [{ n }] = await db.select({ n: sql<number>`coalesce(sum(${unreadIn(userId)}), 0)`.mapWith(Number) }).from(conversations).where(visibleTo(userId));
  return n;
}
