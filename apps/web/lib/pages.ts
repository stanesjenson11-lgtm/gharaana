// Blog posts and area guides. Admins write them; the public only ever sees published ones.
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { LOCALITIES } from "./places.ts";
import { slugify } from "./prose.ts";
import { pages } from "./schema.ts";

/** Every locality has an area page at /areas/<slug>, with or without a written guide. */
export const AREAS = Object.keys(LOCALITIES).map((name) => ({ name, slug: slugify(name) }));
export const areaBySlug = (slug: string) => AREAS.find((a) => a.slug === slug);

export type PageInput = { kind: "post" | "area"; slug: string; title: string; summary: string; body: string; published: boolean };

export function readPage(form: FormData): { error: string } | { page: PageInput } {
  const kind = form.get("kind") === "area" ? "area" : "post";
  const title = String(form.get("title") ?? "").trim();
  const slug = kind === "area" ? String(form.get("area") ?? "") : slugify(String(form.get("slug") || title));
  const summary = String(form.get("summary") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (kind === "area" && !areaBySlug(slug)) return { error: "Choose which area this guide is for." };
  if (title.length < 4 || title.length > 120) return { error: "Give it a title (4 to 120 characters)." };
  if (!slug) return { error: "The web address needs letters or numbers." };
  if (summary.length > 300) return { error: "Keep the summary under 300 characters." };
  if (body.length < 40 || body.length > 50_000) return { error: "Write at least a few sentences (40 characters or more)." };
  return { page: { kind, slug, title, summary, body, published: form.get("published") === "on" } };
}

/** Creates or edits a page. Returns an error if another page of the same kind already uses the address. */
export async function savePage(id: number | null, p: PageInput, authorId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const [clash] = await db.select({ id: pages.id }).from(pages).where(and(eq(pages.kind, p.kind), eq(pages.slug, p.slug)));
  if (clash && clash.id !== id) return { ok: false, error: p.kind === "area" ? "That area already has a guide; edit it instead." : "Another post already uses that web address." };
  // The first publish sets the date; later edits keep it.
  const publishedAt = p.published ? sql`coalesce(${pages.publishedAt}, now())` : null;
  if (id === null) await db.insert(pages).values({ ...p, authorId, publishedAt: p.published ? sql`now()` : null });
  else await db.update(pages).set({ ...p, publishedAt, updatedAt: sql`now()` }).where(eq(pages.id, id));
  return { ok: true };
}

export const allPages = () => db.select().from(pages).orderBy(desc(pages.updatedAt));

export const publishedPosts = () =>
  db
    .select({ slug: pages.slug, title: pages.title, summary: pages.summary, publishedAt: pages.publishedAt })
    .from(pages)
    .where(and(eq(pages.kind, "post"), eq(pages.published, true)))
    .orderBy(desc(pages.publishedAt));

export async function publishedPage(kind: "post" | "area", slug: string) {
  const [p] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.kind, kind), eq(pages.slug, slug), eq(pages.published, true)));
  return p;
}
