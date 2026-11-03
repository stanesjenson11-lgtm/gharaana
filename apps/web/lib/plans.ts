// Owner plans and featured listings. Admins set the prices; until online payments exist, the team sells plans by phone
// and features the listing by hand for the plan's days.
import { asc, eq, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { listings, plans } from "./schema.ts";

export type PlanInput = { name: string; price: number; days: number; perks: string[]; active: boolean; position: number };

export const activePlans = () => db.select().from(plans).where(eq(plans.active, true)).orderBy(asc(plans.position), asc(plans.price));
export const allPlans = () => db.select().from(plans).orderBy(asc(plans.position), asc(plans.price));

/** From the admin form; returns what's wrong in plain words, or the clean plan. */
export function readPlan(form: FormData): { error: string } | { plan: PlanInput } {
  const name = String(form.get("name") ?? "").trim();
  const price = Number(String(form.get("price") ?? "").replace(/[,\s₹]/g, ""));
  const days = Number(form.get("days"));
  const position = Number(form.get("position") || 0);
  const perks = String(form.get("perks") ?? "")
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
  if (name.length < 2 || name.length > 60) return { error: "Give the plan a name (up to 60 characters)." };
  if (!Number.isInteger(price) || price < 0 || price > 10_000_000) return { error: "Price must be whole rupees, up to ₹1 crore." };
  if (!Number.isInteger(days) || days < 1 || days > 365) return { error: "Days must be from 1 to 365." };
  if (perks.length > 8 || perks.some((p) => p.length > 120)) return { error: "Up to 8 perks, one per line, each under 120 characters." };
  if (!Number.isInteger(position) || position < 0 || position > 99) return { error: "Order must be a number from 0 to 99." };
  return { plan: { name, price, days, perks, active: form.get("active") === "on", position } };
}

export async function savePlan(id: number | null, plan: PlanInput) {
  if (id === null) await db.insert(plans).values(plan);
  else await db.update(plans).set({ ...plan, updatedAt: sql`now()` }).where(eq(plans.id, id));
}

/** Homes featured right now, soonest to end first. */
export const featuredListings = () =>
  db
    .select({ id: listings.id, title: listings.title, until: listings.featuredUntil })
    .from(listings)
    .where(sql`coalesce(${listings.featuredUntil} > now(), false)`)
    .orderBy(asc(listings.featuredUntil));

/** Features a listing for `days` from now; 0 stops featuring it. Returns false if there's no such listing. */
export async function featureListing(listingId: string, days: number) {
  const [row] = await db
    .update(listings)
    .set({ featuredUntil: days > 0 ? sql`now() + make_interval(days => ${Math.min(Math.trunc(days), 365)})` : null })
    .where(eq(listings.id, listingId))
    .returning({ id: listings.id });
  return !!row;
}
