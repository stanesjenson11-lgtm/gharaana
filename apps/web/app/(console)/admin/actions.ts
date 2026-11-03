"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { setBanned } from "@/lib/admin";
import { logAuditEvent } from "@/lib/audit";
import { isStage, updateCrm } from "@/lib/crm";
import { db } from "@/lib/db";
import { readImport, runImport, type ImportResult } from "@/lib/import";
import { readPage, savePage } from "@/lib/pages";
import { featureListing, readPlan, savePlan } from "@/lib/plans";
import { readProject, saveProject, setUnits, unitIds } from "@/lib/projects";
import { notify } from "@/lib/notify";
import { savedSearchMatches } from "@/lib/saved";
import { listings } from "@/lib/schema";
import { requireAdmin } from "@/lib/session";
import { REJECT_REASONS } from "./reasons";

// Both only touch listings still pending, so two reviewers can't double-decide one listing.
export async function approve(id: string) {
  const me = await requireAdmin("queue");
  const [row] = await db
    .update(listings)
    .set({
      status: "active",
      ownerVerified: true,
      reviewedAt: sql`now()`,
      confirmedAt: sql`now()`,
      expiresAt: sql`now() + interval '30 days'`,
    })
    // A reviewer can never approve their own listing.
    .where(and(eq(listings.id, id), eq(listings.status, "pending_review"), ne(listings.ownerId, me.id)))
    .returning({ ownerId: listings.ownerId, title: listings.title });
  done(id);
  if (!row) return;
  await logAuditEvent("ADMIN_APPROVE_LISTING", { userId: me.id, targetId: id });
  await notify(row.ownerId, `Your home is live: ${row.title}`, `/homes/${id}`);
  // Everyone whose saved search now includes this home hears about it once.
  for (const m of await savedSearchMatches(id, row.ownerId)) await notify(m.userId, `New home for your search "${m.label}": ${row.title}`, `/homes/${id}`);
}

export async function reject(id: string, form: FormData) {
  const me = await requireAdmin("queue");
  const reason = String(form.get("reason"));
  if (!(REJECT_REASONS as readonly string[]).includes(reason)) return;
  const [row] = await db
    .update(listings)
    .set({ status: "rejected", rejectReason: reason, reviewedAt: sql`now()` })
    .where(and(eq(listings.id, id), eq(listings.status, "pending_review")))
    .returning({ ownerId: listings.ownerId, title: listings.title });
  done(id);
  if (row) await logAuditEvent("ADMIN_REJECT_LISTING", { userId: me.id, targetId: id, details: { reason } });
  if (row) await notify(row.ownerId, `${row.title} wasn't approved: ${reason}. You can fix it and post it again.`, "/account");
}

/** Our staff saw the home in person. Works before or after approval; nobody marks their own listing. */
export async function markVisited(id: string) {
  const me = await requireAdmin("queue");
  await db
    .update(listings)
    .set({ visitVerifiedAt: sql`now()` })
    .where(and(eq(listings.id, id), isNull(listings.visitVerifiedAt), ne(listings.ownerId, me.id)));
  done(id);
}

/** Ban or unban someone. Their cached listing pages are refreshed straight away, so a ban takes them down at once. */
export async function setUserBanned(userId: string, banned: boolean) {
  const me = await requireAdmin("users");
  if (!(await setBanned(me.id, String(userId), banned === true))) return;
  const theirs = await db.select({ id: listings.id }).from(listings).where(eq(listings.ownerId, String(userId)));
  for (const { id } of theirs) updateTag(`listing:${id}`);
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${String(userId)}`);
}

/** Checks a spreadsheet without writing anything; what the import page shows before anyone commits. */
export async function previewImport(text: string) {
  await requireAdmin("import");
  const { errors, rows } = readImport(String(text));
  return {
    errors,
    rows: rows.map(({ line, errors, data }) => ({ line, errors, title: data && `${data.bhk ? `${data.bhk} BHK` : "1 RK"} in ${data.area}, ${data.locality}`, owner: data?.ownerName, price: data?.price, photos: data?.photoUrls.length })),
  };
}

/** One batch of rows (header included). The page sends small batches so photo downloads never hit a request time limit. */
export async function importBatch(text: string): Promise<ImportResult[]> {
  await requireAdmin("import");
  const results = await runImport(String(text));
  revalidatePath("/admin");
  revalidatePath("/admin/queue");
  return results;
}

/** The sales team moves a request along its pipeline and keeps notes on it. */
export async function saveCrm(id: number, form: FormData) {
  await requireAdmin("leads");
  const stage = form.get("stage");
  if (!Number.isInteger(id) || !isStage(stage)) return;
  await updateCrm(id, stage, String(form.get("note") ?? ""));
  revalidatePath("/admin/leads");
}

export type AdminFormState = { error?: string; ok?: string };

/** Creates (id null) or edits a plan. The public plans page is cached under the "plans" tag. */
export async function savePlanAction(id: number | null, _: AdminFormState, form: FormData): Promise<AdminFormState> {
  await requireAdmin("plans");
  if (id !== null && !Number.isInteger(id)) return { error: "Unknown plan." };
  const r = readPlan(form);
  if ("error" in r) return r;
  await savePlan(id, r.plan);
  updateTag("plans");
  revalidatePath("/admin/plans");
  return { ok: "Saved." };
}

/** Features a listing for some days (0 stops). Takes the listing's link or its id. */
export async function featureAction(_: AdminFormState, form: FormData): Promise<AdminFormState> {
  await requireAdmin("plans");
  const raw = String(form.get("listing") ?? "").trim();
  const id = raw.split("/homes/").pop()!.split(/[?#/]/)[0].slice(0, 200);
  const days = Number(form.get("days"));
  if (!id || !Number.isInteger(days) || days < 0 || days > 365) return { error: "Paste the listing's link and choose the number of days." };
  if (!(await featureListing(id, days))) return { error: "There's no listing with that link." };
  revalidatePath("/admin/plans");
  return { ok: days ? `Featured for ${days} days.` : "No longer featured." };
}

/** Creates or edits a blog post or area guide. Public pages are cached under the "pages" tag. */
export async function savePageAction(id: number | null, _: AdminFormState, form: FormData): Promise<AdminFormState> {
  const me = await requireAdmin("pages");
  if (id !== null && !Number.isInteger(id)) return { error: "Unknown page." };
  const r = readPage(form);
  if ("error" in r) return r;
  const saved = await savePage(id, r.page, me.id);
  if (!saved.ok) return { error: saved.error };
  updateTag("pages");
  revalidatePath("/admin/pages");
  return { ok: r.page.published ? "Saved and live." : "Saved as a draft." };
}

/** Creates or edits a builder project and sets its units. Listing pages show the project, so their caches refresh too. */
export async function saveProjectAction(id: string | null, _: AdminFormState, form: FormData): Promise<AdminFormState> {
  await requireAdmin("projects");
  const r = readProject(form);
  if ("error" in r) return r;
  const projectId = await saveProject(id ? String(id) : null, r.project);
  const before = await unitIds(projectId);
  const unknown = await setUnits(projectId, String(form.get("units") ?? ""));
  for (const u of new Set([...before, ...(await unitIds(projectId))])) updateTag(`listing:${u}`);
  updateTag("projects");
  revalidatePath("/admin/projects");
  return unknown.length ? { error: `Saved, but these aren't sale listings here: ${unknown.join(", ")}` } : { ok: r.project.published ? "Saved and live." : "Saved as a draft." };
}

function done(id: string) {
  // ponytail: proofs are due for deletion 30 days after reviewed_at; a nightly job does that once pg-boss is in.
  updateTag(`listing:${id}`);
  revalidatePath("/admin");
  revalidatePath("/admin/queue");
  revalidatePath("/admin/listings");
  revalidatePath(`/admin/listings/${id}`);
}
