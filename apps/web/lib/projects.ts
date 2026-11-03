// Builder projects: a page for the project, with its units as ordinary sale listings (so chat, visits and the CRM all work).
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { live } from "./listings.ts";
import { LOCALITIES } from "./places.ts";
import { slugify } from "./prose.ts";
import { listings, projects } from "./schema.ts";

export type ProjectInput = { name: string; builder: string; rera: string; possession: string | null; locality: string; description: string; published: boolean };

export function readProject(form: FormData): { error: string } | { project: ProjectInput } {
  const v = (k: string) => String(form.get(k) ?? "").trim();
  const [name, builder, rera, possession, description] = [v("name"), v("builder"), v("rera").toUpperCase(), v("possession"), v("description")];
  const locality = Object.keys(LOCALITIES).find((l) => l.toLowerCase() === v("locality").toLowerCase());
  if (name.length < 2 || name.length > 80) return { error: "Give the project its name." };
  if (builder.length < 2 || builder.length > 80) return { error: "Add the builder's name." };
  // Karnataka numbers look like PRM/KA/RERA/1251/309/PR/171015/000287; projects must show theirs in every advert.
  if (!/^[A-Z0-9/-]{8,60}$/.test(rera)) return { error: "Add the RERA registration number, e.g. PRM/KA/RERA/1251/309/PR/171015/000287." };
  if (possession && !/^\d{4}-\d{2}-\d{2}$/.test(possession)) return { error: "Possession must be a date, or empty if ready." };
  if (!locality) return { error: `Locality must be one of ${Object.keys(LOCALITIES).join(", ")}.` };
  if (description.length < 40 || description.length > 5000) return { error: "Describe the project in at least 40 characters." };
  return { project: { name, builder, rera, possession: possession || null, locality, description, published: form.get("published") === "on" } };
}

/** Creates or edits a project; returns its id (a slug made from the name and locality when new). */
export async function saveProject(id: string | null, p: ProjectInput) {
  if (id) {
    await db.update(projects).set(p).where(eq(projects.id, id));
    return id;
  }
  const slug = slugify(`${p.name} ${p.locality}`);
  const [taken] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, slug));
  const newId = taken ? `${slug}-${Date.now().toString(36)}` : slug;
  await db.insert(projects).values({ id: newId, ...p });
  return newId;
}

/**
 * Makes exactly these listings the project's units (links or ids, one per line). Units are marked new from the builder.
 * Returns the ids that matched no sale listing, so the admin can fix them.
 */
export async function setUnits(projectId: string, text: string) {
  const ids = [...new Set(text.split(/\s+/).filter(Boolean).map((l) => l.split("/homes/").pop()!.split(/[?#/]/)[0]))].slice(0, 500);
  const found = ids.length ? await db.select({ id: listings.id }).from(listings).where(and(inArray(listings.id, ids), eq(listings.type, "buy"))) : [];
  const ok = found.map((f) => f.id);
  await db.transaction(async (tx) => {
    await tx
      .update(listings)
      .set({ projectId: null })
      .where(and(eq(listings.projectId, projectId), ok.length ? notInArray(listings.id, ok) : undefined));
    if (ok.length) await tx.update(listings).set({ projectId, saleCondition: "new" }).where(inArray(listings.id, ok));
  });
  return ids.filter((i) => !ok.includes(i));
}

// Unit counts and prices only count homes the public can see (same rule as search).
const liveUnits = sql`listings.project_id = projects.id and ${live}`;

export const projectSummaries = (publishedOnly = true) =>
  db
    .select({
      id: projects.id,
      name: projects.name,
      builder: projects.builder,
      locality: projects.locality,
      possession: projects.possession,
      published: projects.published,
      units: sql<number>`(select count(*) from listings where ${liveUnits})`.mapWith(Number),
      from: sql<number | null>`(select min(price) from listings where ${liveUnits})`.mapWith(Number),
      to: sql<number | null>`(select max(price) from listings where ${liveUnits})`.mapWith(Number),
    })
    .from(projects)
    .where(publishedOnly ? eq(projects.published, true) : undefined)
    .orderBy(desc(projects.createdAt));

export async function projectFor(id: string, publishedOnly = true) {
  const [p] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), publishedOnly ? eq(projects.published, true) : undefined));
  return p;
}

/** "Possession Dec 2027", or "Ready to move" once the date has passed. Call inside cached code: it reads the clock. */
export const possessionLabel = (d: string | null) => {
  const at = d ? new Date(`${d}T12:00:00+05:30`) : null;
  return at && at > new Date() ? `Possession ${at.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}` : "Ready to move";
};

export const unitIds = async (projectId: string) =>
  (await db.select({ id: listings.id }).from(listings).where(eq(listings.projectId, projectId)).orderBy(asc(listings.id))).map((r) => r.id);
