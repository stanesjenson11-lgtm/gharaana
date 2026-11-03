// Callback and visit requests. A buyer's number reaches an owner only through a request the buyer chose to send.
import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db.ts";
import { live } from "./listings.ts";
import { leads, listings, user } from "./schema.ts";
import { notify } from "./notify.ts";
import { SLOTS, visitTime } from "./search.ts";

// ponytail: a fixed daily cap per person against spam, until abuse says otherwise.
export const LEADS_PER_DAY = 10;

const istDate = (plusDays = 0) => new Date(Date.now() + plusDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export const leadSchema = z
  .object({
    listingId: z.string().min(1).max(200),
    kind: z.enum(["callback", "visit"]),
    preferredDate: z.iso.date().optional(),
    preferredSlot: z.enum(SLOTS.map(([v]) => v) as ["morning", "afternoon", "evening"]).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .transform((d) => (d.kind === "callback" ? { ...d, preferredDate: undefined } : d))
  .refine((d) => d.kind === "callback" || (d.preferredDate && d.preferredDate >= istDate() && d.preferredDate <= istDate(60)), {
    path: ["preferredDate"],
    message: "Pick a day in the next two months",
  })
  .refine((d) => d.kind === "callback" || d.preferredSlot, { path: ["preferredSlot"], message: "Pick a time of day" });

export type LeadInput = z.infer<typeof leadSchema>;
export type LeadResult = { ok: true } | { ok: false; reason: "gone" | "sample" | "own" | "duplicate" | "limit" };

export async function createLead(requesterId: string, d: LeadInput): Promise<LeadResult> {
  const [l] = await db.select({ ownerId: listings.ownerId, sample: listings.sample, title: listings.title }).from(listings).where(and(eq(listings.id, d.listingId), live));
  if (!l) return { ok: false, reason: "gone" };
  if (l.sample) return { ok: false, reason: "sample" };
  if (l.ownerId === requesterId) return { ok: false, reason: "own" };

  const open = and(eq(leads.listingId, d.listingId), eq(leads.requesterId, requesterId), eq(leads.kind, d.kind), inArray(leads.status, ["new", "confirmed"]));
  const [dup] = await db.select({ id: leads.id }).from(leads).where(open).limit(1);
  if (dup) return { ok: false, reason: "duplicate" };
  const [{ n }] = await db
    .select({ n: count() })
    .from(leads)
    .where(and(eq(leads.requesterId, requesterId), gt(leads.createdAt, sql`now() - interval '1 day'`)));
  if (n >= LEADS_PER_DAY) return { ok: false, reason: "limit" };

  await db.insert(leads).values({ ...d, requesterId, note: d.note || null });
  const [me] = await db.select({ name: user.name }).from(user).where(eq(user.id, requesterId));
  const who = me?.name || "A buyer";
  await notify(
    l.ownerId,
    d.kind === "visit" ? `${who} wants to visit ${l.title} on ${visitTime(d.preferredDate ?? null, d.preferredSlot ?? null)}` : `${who} asked you to call back about ${l.title}`,
    "/account#requests",
  );
  return { ok: true };
}

/** Requests on an owner's homes, newest unanswered first. Includes the requester's number: they asked to be called. */
export async function leadsForOwner(ownerId: string) {
  return db
    .select({
      id: leads.id,
      kind: leads.kind,
      status: leads.status,
      preferredDate: leads.preferredDate,
      preferredSlot: leads.preferredSlot,
      note: leads.note,
      createdAt: leads.createdAt,
      listingId: listings.id,
      title: listings.title,
      name: user.name,
      phone: user.phoneNumber,
    })
    .from(leads)
    .innerJoin(listings, eq(leads.listingId, listings.id))
    .innerJoin(user, eq(leads.requesterId, user.id))
    .where(eq(listings.ownerId, ownerId))
    .orderBy(sql`${leads.status} = 'new' desc`, desc(leads.createdAt))
    .limit(100);
}

/** What someone has asked for, so they can see whether the owner answered. */
export async function leadsByRequester(requesterId: string) {
  return db
    .select({ id: leads.id, kind: leads.kind, status: leads.status, preferredDate: leads.preferredDate, preferredSlot: leads.preferredSlot, listingId: listings.id, title: listings.title })
    .from(leads)
    .innerJoin(listings, eq(leads.listingId, listings.id))
    .where(eq(leads.requesterId, requesterId))
    .orderBy(desc(leads.createdAt))
    .limit(50);
}

/** The owner's answer. Ownership is checked in the WHERE clause, so a forged id touches nothing. */
export async function answerLead(ownerId: string, id: number, status: "confirmed" | "declined" | "done") {
  const [row] = await db
    .update(leads)
    .set({ status })
    .where(and(eq(leads.id, id), sql`${leads.listingId} in (select id from listings where owner_id = ${ownerId})`))
    .returning({ requesterId: leads.requesterId, kind: leads.kind, listingId: leads.listingId });
  if (row && status !== "done") {
    const [l] = await db.select({ title: listings.title }).from(listings).where(eq(listings.id, row.listingId));
    const what = row.kind === "visit" ? "visit to" : "callback request about";
    await notify(row.requesterId, `The owner ${status === "confirmed" ? "confirmed" : "declined"} your ${what} ${l.title}`, `/homes/${row.listingId}`);
  }
  return !!row;
}
