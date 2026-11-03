"use server";

import { eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { logAuditEvent } from "@/lib/audit";
import { db } from "@/lib/db";
import { fieldErrors, homeFields, homeRules } from "@/lib/listing-schema";
import { deleteListing, isMove, isRoom, moveListing, removePhoto, setPhotoRoom, shiftPhoto, updateListingDetails, type Move } from "@/lib/listings-admin";
import { notify } from "@/lib/notify";
import { listings } from "@/lib/schema";
import { requireAdmin } from "@/lib/session";

export type EditState = { errors?: Record<string, string>; ok?: string };

function refresh(id: string) {
  updateTag(`listing:${id}`);
  revalidatePath("/admin/listings");
  revalidatePath(`/admin/listings/${id}`);
  revalidatePath("/admin");
  revalidatePath("/admin/queue");
}

export async function saveListing(id: string, _: EditState, form: FormData): Promise<EditState> {
  const me = await requireAdmin("listings");
  const [row] = await db.select({ type: listings.type }).from(listings).where(eq(listings.id, id));
  if (!row) return { errors: { form: "This listing no longer exists." } };
  const parsed = homeRules(homeFields).safeParse({
    ...Object.fromEntries(form),
    type: row.type, // the type never changes here
    tenants: form.getAll("tenants"),
    amenities: form.getAll("amenities"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  await updateListingDetails(id, parsed.data);
  await logAuditEvent("ADMIN_EDIT_LISTING", { userId: me.id, targetId: id });
  refresh(id);
  return { ok: "Saved. The public page shows it now." };
}

const TELL: Record<Move, string> = {
  active: "Your home is live again",
  rented: "We marked your home as sold",
  expired: "We took your home down",
  pending_review: "Your home is back with our review team",
};

/** Live, sold, taken down or back to the queue. The owner is told, since it changes what buyers see. */
export async function changeStatus(id: string, to: string) {
  const me = await requireAdmin("listings");
  if (!isMove(to)) return;
  const row = await moveListing(id, to);
  if (row) {
    await logAuditEvent("ADMIN_LISTING_STATUS", { userId: me.id, targetId: id, details: { to } });
    await notify(row.ownerId, `${TELL[to]}: ${row.title}`, to === "active" ? `/homes/${id}` : "/account");
  }
  refresh(id);
}

export async function removePhotoAction(listingId: string, photoId: number) {
  const me = await requireAdmin("listings");
  if ((await removePhoto(listingId, photoId)) === "ok") await logAuditEvent("ADMIN_LISTING_PHOTOS", { userId: me.id, targetId: listingId, details: { removed: photoId } });
  refresh(listingId);
}

export async function shiftPhotoAction(listingId: string, photoId: number, dir: number) {
  await requireAdmin("listings");
  await shiftPhoto(listingId, photoId, dir < 0 ? -1 : 1);
  refresh(listingId);
}

export async function setRoomAction(listingId: string, photoId: number, form: FormData) {
  await requireAdmin("listings");
  const room = form.get("room");
  if (isRoom(room)) await setPhotoRoom(listingId, photoId, room);
  refresh(listingId);
}

export async function deleteListingAction(id: string) {
  const me = await requireAdmin("listings");
  const [row] = await db.select({ title: listings.title }).from(listings).where(eq(listings.id, id));
  if (!row || !(await deleteListing(id))) return;
  await logAuditEvent("ADMIN_DELETE_LISTING", { userId: me.id, targetId: id, details: { title: row.title } });
  updateTag(`listing:${id}`);
  revalidatePath("/admin", "layout");
  redirect("/admin/listings");
}
