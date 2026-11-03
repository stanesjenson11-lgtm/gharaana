// The only way an owner's number leaves the server: to a signed-in person, logged, and capped per day against scraping.
import { and, count, eq, gt, sql } from "drizzle-orm";
import { logAuditEvent } from "./audit.ts";
import { db } from "./db.ts";
import { live } from "./listings.ts";
import { contactReveals, listings, user } from "./schema.ts";

// ponytail: one fixed cap until the client picks a number; rolling 24 hours per person.
export const REVEALS_PER_DAY = 25;

export type Reveal = { ok: true; phone: string } | { ok: false; reason: "gone" | "sample" | "no-phone" | "limit" };

export async function revealPhone(viewerId: string, listingId: string): Promise<Reveal> {
  const [l] = await db
    .select({ ownerId: listings.ownerId, sample: listings.sample, phone: user.phoneNumber })
    .from(listings)
    .innerJoin(user, eq(user.id, listings.ownerId))
    .where(and(eq(listings.id, listingId), live));
  if (!l) return { ok: false, reason: "gone" };
  if (l.sample) return { ok: false, reason: "sample" };
  if (!l.phone) return { ok: false, reason: "no-phone" };
  if (l.ownerId === viewerId) return { ok: true, phone: l.phone };

  // Seeing the same number again is free. ponytail: two reveals racing can both pass the count, one over the cap at worst.
  const mine = and(eq(contactReveals.userId, viewerId), eq(contactReveals.listingId, listingId));
  const [seen] = await db.select({ id: contactReveals.id }).from(contactReveals).where(mine).limit(1);
  if (!seen) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(contactReveals)
      .where(and(eq(contactReveals.userId, viewerId), gt(contactReveals.createdAt, sql`now() - interval '1 day'`)));
    if (n >= REVEALS_PER_DAY) return { ok: false, reason: "limit" };
    await db.insert(contactReveals).values({ userId: viewerId, listingId });
    await logAuditEvent("PHONE_REVEALED", { userId: viewerId, targetId: listingId });
  }
  return { ok: true, phone: l.phone };
}
