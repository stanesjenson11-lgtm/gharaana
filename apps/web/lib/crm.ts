// The sales team's view of every callback and visit request: who asked, about which home, and how far the sale has got.
// Admin pages only: it shows both people's numbers.
import { aliasedTable, count, desc, eq, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { leads, listings, user } from "./schema.ts";

export const STAGES = [
  ["new", "New"],
  ["contacted", "Contacted"],
  ["visited", "Visited"],
  ["negotiating", "Negotiating"],
  ["won", "Sold"],
  ["lost", "Lost"],
] as const;
export type Stage = (typeof STAGES)[number][0];
export const isStage = (s: unknown): s is Stage => STAGES.some(([v]) => v === s);

export async function crmLeads(stage?: Stage) {
  const buyer = aliasedTable(user, "buyer");
  const owner = aliasedTable(user, "owner");
  return db
    .select({
      id: leads.id,
      kind: leads.kind,
      ownerAnswer: leads.status,
      stage: leads.crmStage,
      note: leads.crmNote,
      updatedAt: leads.crmUpdatedAt,
      preferredDate: leads.preferredDate,
      preferredSlot: leads.preferredSlot,
      buyerNote: leads.note,
      createdAt: leads.createdAt,
      listingId: listings.id,
      title: listings.title,
      price: listings.price,
      buyerName: buyer.name,
      buyerPhone: buyer.phoneNumber,
      ownerName: owner.name,
      ownerPhone: owner.phoneNumber,
    })
    .from(leads)
    .innerJoin(listings, eq(listings.id, leads.listingId))
    .innerJoin(buyer, eq(buyer.id, leads.requesterId))
    .innerJoin(owner, eq(owner.id, listings.ownerId))
    .where(stage ? eq(leads.crmStage, stage) : undefined)
    .orderBy(desc(leads.createdAt))
    .limit(200);
}

export async function stageCounts(): Promise<Record<Stage, number>> {
  const rows = await db.select({ stage: leads.crmStage, n: count() }).from(leads).groupBy(leads.crmStage);
  return Object.fromEntries(STAGES.map(([s]) => [s, rows.find((r) => r.stage === s)?.n ?? 0])) as Record<Stage, number>;
}

export async function updateCrm(id: number, stage: Stage, note: string) {
  const [row] = await db
    .update(leads)
    .set({ crmStage: stage, crmNote: note.trim().slice(0, 2000) || null, crmUpdatedAt: sql`now()` })
    .where(eq(leads.id, id))
    .returning({ id: leads.id });
  return !!row;
}
