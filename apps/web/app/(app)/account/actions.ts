"use server";

import { and, eq, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { deleteAccount } from "@/lib/account";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { answerLead } from "@/lib/leads";
import { listings, user } from "@/lib/schema";
import { deleteSavedSearch, saveSearch, setShortlisted, shortlistIds } from "@/lib/saved";
import { getMember, requireUser } from "@/lib/session";

// Every action checks ownership in the WHERE clause, so a forged id can only ever touch the caller's own rows.

/** "Still available": resets the 30-day clock and moves the listing up in "recently confirmed". */
export async function confirmAvailable(id: string) {
  const me = await requireUser("/account");
  const [row] = await db
    .update(listings)
    .set({ confirmedAt: sql`now()`, expiresAt: sql`now() + interval '30 days'`, status: sql`case when ${listings.status} = 'expired' then 'active'::listing_status else ${listings.status} end` })
    .where(and(eq(listings.id, id), eq(listings.ownerId, me.id)))
    .returning({ id: listings.id });
  if (row) refresh(id);
}

export async function markRented(id: string) {
  const me = await requireUser("/account");
  const [row] = await db
    .update(listings)
    .set({ status: "rented" })
    .where(and(eq(listings.id, id), eq(listings.ownerId, me.id), eq(listings.status, "active")))
    .returning({ id: listings.id });
  if (row) refresh(id);
}

export async function answer(id: number, status: "confirmed" | "declined" | "done") {
  const me = await requireUser("/account");
  // Bound arguments arrive from the browser, so they're checked like any other input.
  if (!["confirmed", "declined", "done"].includes(status) || !Number.isInteger(id)) return;
  if (await answerLead(me.id, id, status)) revalidatePath("/account");
}

// The heart buttons and the search page call these and handle "signed out" themselves, so no redirects here.
export async function myShortlist(): Promise<string[]> {
  const session = await getMember();
  return session ? shortlistIds(session.user.id) : [];
}

export async function shortlist(listingId: string, on: boolean) {
  const session = await getMember();
  if (!session) return false;
  await setShortlisted(session.user.id, String(listingId).slice(0, 200), on === true);
  return true;
}

export async function saveThisSearch(query: string) {
  const session = await getMember();
  if (!session) return { ok: false, reason: "signed-out" } as const;
  return saveSearch(session.user.id, String(query).slice(0, 2000));
}

/** The name others see in chats and requests. */
export async function setName(form: FormData) {
  const me = await requireUser("/account");
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!name) return;
  await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, me.id));
  revalidatePath("/account");
}

export async function removeSavedSearch(id: number) {
  const me = await requireUser("/account");
  if (Number.isInteger(id)) await deleteSavedSearch(me.id, id);
  revalidatePath("/account");
}

function refresh(id: string) {
  updateTag(`listing:${id}`); // the public page drops a rented listing straight away
  revalidatePath("/account");
}

/**
 * Permanently deletes the signed-in person's account, listings, uploads and personal data.
 * Clears better-auth session cookies and redirects home.
 */
export async function deleteMyAccount() {
  const me = await requireUser("/account");
  const { deletedListings } = await deleteAccount(me.id);
  for (const id of deletedListings) updateTag(`listing:${id}`);
  updateTag("search");
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {}
  const store = await cookies();
  for (const c of store.getAll()) {
    if (c.name.includes("better-auth")) store.delete(c.name);
  }
  redirect("/");
}
