// Per-person lists kept in the database: shortlisted homes and saved searches.
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { listingMatches } from "./listings.ts";
import { parseSearch } from "./parse-search.ts";
import { savedSearches, shortlists } from "./schema.ts";
import { describeSearch, toQuery } from "./search.ts";

// ponytail: a flat cap keeps the list readable. New matches are announced by savedSearchMatches when a home is approved.
export const MAX_SAVED_SEARCHES = 20;

export async function shortlistIds(userId: string) {
  const rows = await db.select({ id: shortlists.listingId }).from(shortlists).where(eq(shortlists.userId, userId));
  return rows.map((r) => r.id);
}

export async function setShortlisted(userId: string, listingId: string, on: boolean) {
  if (!on) {
    await db.delete(shortlists).where(and(eq(shortlists.userId, userId), eq(shortlists.listingId, listingId)));
    return;
  }
  // Insert-select: an id that isn't a listing adds nothing instead of failing on the foreign key.
  await db.execute(sql`insert into ${shortlists} (user_id, listing_id) select ${userId}, id from listings where id = ${listingId} on conflict do nothing`);
}

/** Stores the search in its normal form, so the same search saved twice is one entry. */
export async function saveSearch(userId: string, raw: string): Promise<{ ok: true } | { ok: false; reason: "full" }> {
  const p = parseSearch(Object.fromEntries(new URLSearchParams(raw)));
  const query = toQuery(p);
  const mine = eq(savedSearches.userId, userId);
  const [dup] = await db.select({ id: savedSearches.id }).from(savedSearches).where(and(mine, eq(savedSearches.query, query))).limit(1);
  if (dup) return { ok: true };
  const [{ n }] = await db.select({ n: count() }).from(savedSearches).where(mine);
  if (n >= MAX_SAVED_SEARCHES) return { ok: false, reason: "full" };
  await db.insert(savedSearches).values({ userId, query, label: describeSearch(p) });
  return { ok: true };
}

/** People whose saved searches include this home, with the search's name; one entry per person, never the owner. */
export async function savedSearchMatches(listingId: string, ownerId: string) {
  // ponytail: checks every saved search one by one; fine for thousands, batch it by locality if it grows past that.
  const all = await db.select({ userId: savedSearches.userId, query: savedSearches.query, label: savedSearches.label }).from(savedSearches);
  const found = new Map<string, string>();
  for (const s of all) {
    if (s.userId === ownerId || found.has(s.userId)) continue;
    if (await listingMatches(parseSearch(Object.fromEntries(new URLSearchParams(s.query))), listingId)) found.set(s.userId, s.label);
  }
  return [...found].map(([userId, label]) => ({ userId, label }));
}

export async function savedSearchList(userId: string) {
  return db
    .select({ id: savedSearches.id, query: savedSearches.query, label: savedSearches.label })
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(desc(savedSearches.createdAt));
}

export async function deleteSavedSearch(userId: string, id: number) {
  await db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
}
