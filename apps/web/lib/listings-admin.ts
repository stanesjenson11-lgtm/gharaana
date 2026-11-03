// The team's tools for any listing: find it, correct its details, manage its photos, and move it through its life.
// Admin pages only: it reads private addresses. The actions that call it check the role and write the audit trail.
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { homeTitle, ROOMS, type Home } from "./listing-schema.ts";
import { LISTING_STATUS, type ListingStatus } from "./labels.ts";
import { deleteMediaFile, savePhoto } from "./media.ts";
import { listingPhotos, listings, uploads, user } from "./schema.ts";

export const LISTINGS_PAGE = 25;
export const MAX_PHOTOS = 20;

export type ListingFilter = "all" | ListingStatus;
export const isListingFilter = (f: unknown): f is ListingFilter => f === "all" || (typeof f === "string" && f in LISTING_STATUS);
export type Room = (typeof ROOMS)[number];
export const isRoom = (r: unknown): r is Room => (ROOMS as readonly unknown[]).includes(r);

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function searchWhere(q: string) {
  const term = q.trim().slice(0, 60);
  if (!term) return undefined;
  const digits = /^[\d\s+()-]+$/.test(term) ? term.replace(/\D/g, "") : "";
  const like = `%${escapeLike(term)}%`;
  return or(ilike(listings.title, like), ilike(listings.id, like), ilike(user.name, like), digits ? ilike(user.phoneNumber, `%${digits}%`) : undefined);
}

/** Every listing, whatever its state, newest first, one page at a time. */
export async function listAllListings({ q = "", status = "all", page = 1 }: { q?: string; status?: ListingFilter; page?: number }) {
  const cond = and(status === "all" ? undefined : eq(listings.status, status), searchWhere(q));
  const p = Math.max(1, Math.floor(page) || 1);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: listings.id,
        title: listings.title,
        status: listings.status,
        price: listings.price,
        locality: listings.locality,
        sample: listings.sample,
        visited: sql<boolean>`${listings.visitVerifiedAt} is not null`,
        createdAt: listings.createdAt,
        ownerId: listings.ownerId,
        ownerName: user.name,
        ownerPhone: user.phoneNumber,
        photos: sql<number>`(select count(*) from listing_photos p where p.listing_id = "listings"."id")`.mapWith(Number),
      })
      .from(listings)
      .innerJoin(user, eq(user.id, listings.ownerId))
      .where(cond)
      .orderBy(desc(listings.createdAt), desc(listings.id))
      .limit(LISTINGS_PAGE)
      .offset((p - 1) * LISTINGS_PAGE),
    db.select({ n: count() }).from(listings).innerJoin(user, eq(user.id, listings.ownerId)).where(cond),
  ]);
  return { rows, total: n, page: p, pages: Math.max(1, Math.ceil(n / LISTINGS_PAGE)) };
}

/** How many listings each status chip would show. */
export async function listingStatusCounts() {
  const rows = await db.select({ status: listings.status, n: count() }).from(listings).groupBy(listings.status);
  const out = { all: 0, pending_review: 0, active: 0, rented: 0, expired: 0, rejected: 0 } satisfies Record<ListingFilter, number>;
  for (const r of rows) {
    out[r.status] = r.n;
    out.all += r.n;
  }
  return out;
}

/** One listing with everything the team needs to fix it: private address and proof included. */
export async function listingForEdit(id: string) {
  const [l] = await db.select().from(listings).where(eq(listings.id, id));
  if (!l) return null;
  const [[owner], photos] = await Promise.all([
    db.select({ id: user.id, name: user.name, phone: user.phoneNumber, email: user.email, image: user.image, banned: user.banned }).from(user).where(eq(user.id, l.ownerId)),
    db.select().from(listingPhotos).where(eq(listingPhotos.listingId, id)).orderBy(asc(listingPhotos.position), asc(listingPhotos.id)),
  ]);
  return { ...l, owner, photos };
}

/** Corrects a listing's details. Its type and its map pin stay as they are; the title follows what it now is. */
export async function updateListingDetails(id: string, d: Home) {
  const rows = await db
    .update(listings)
    .set({
      kind: d.kind,
      bhk: d.bhk,
      title: homeTitle(d),
      locality: d.locality,
      area: d.area,
      addressPrivate: d.address,
      price: d.price,
      maintenance: d.maintenance,
      deposit: d.type === "rent" ? d.deposit : 0,
      carpetSqft: d.carpetSqft,
      floor: d.floor,
      totalFloors: d.totalFloors,
      furnishing: d.furnishing,
      facing: d.facing,
      ageYears: d.ageYears,
      availableFrom: d.availableFrom || null,
      tenants: d.tenants,
      pets: d.pets === "yes",
      nonVeg: d.food === "any",
      parking: d.parking,
      bathrooms: d.bathrooms,
      balconies: d.balconies,
      saleCondition: d.type === "buy" ? d.saleCondition : null,
      videoUrl: d.videoUrl ? `https://www.youtube.com/watch?v=${d.videoUrl}` : null,
      amenities: d.amenities,
      description: d.description,
    })
    .where(eq(listings.id, id))
    .returning({ id: listings.id });
  return rows.length > 0;
}

// Where a listing may go from where it is. Approving and rejecting a waiting listing is the review queue's job.
export const MOVES = {
  rented: ["active"],
  expired: ["active"],
  active: ["rented", "expired"], // relisting starts a fresh 30 days
  pending_review: ["active", "rented", "expired", "rejected"], // sent back to the queue
} as const;
export type Move = keyof typeof MOVES;
export const isMove = (m: unknown): m is Move => typeof m === "string" && m in MOVES;

export async function moveListing(id: string, to: Move) {
  const [row] = await db
    .update(listings)
    .set({
      status: to,
      ...(to === "active" && { confirmedAt: sql`now()`, expiresAt: sql`now() + interval '30 days'` }),
      ...(to === "pending_review" && { rejectReason: null }),
    })
    .where(and(eq(listings.id, id), inArray(listings.status, [...MOVES[to]])))
    .returning({ ownerId: listings.ownerId, title: listings.title });
  return row ?? null;
}

/** Adds a photo for the listing's owner: stored like any upload, placed last. */
export async function addPhoto(listingId: string, bytes: Buffer, room: Room) {
  const [l] = await db.select({ ownerId: listings.ownerId }).from(listings).where(eq(listings.id, listingId));
  if (!l) return "gone" as const;
  const [{ n, last }] = await db
    .select({ n: count(), last: sql<number>`coalesce(max(${listingPhotos.position}), -1)`.mapWith(Number) })
    .from(listingPhotos)
    .where(eq(listingPhotos.listingId, listingId));
  if (n >= MAX_PHOTOS) return "full" as const;
  const { key, dhash } = await savePhoto(bytes); // throws MediaError with a message the uploader can read
  await db.transaction(async (tx) => {
    await tx.insert(uploads).values({ key, ownerId: l.ownerId, kind: "photo", dhash, ext: "webp" });
    await tx.insert(listingPhotos).values({ listingId, position: last + 1, src: `/media/${key}`, room, dhash });
  });
  return "ok" as const;
}

const keyOf = (src: string) => (src.startsWith("/media/") ? src.slice("/media/".length) : null);

/** Takes a photo down. A live listing keeps at least one. */
export async function removePhoto(listingId: string, photoId: number) {
  const [p] = await db
    .select({ src: listingPhotos.src, status: listings.status, n: sql<number>`(select count(*) from listing_photos x where x.listing_id = ${listingId})`.mapWith(Number) })
    .from(listingPhotos)
    .innerJoin(listings, eq(listings.id, listingPhotos.listingId))
    .where(and(eq(listingPhotos.id, photoId), eq(listingPhotos.listingId, listingId)));
  if (!p) return "gone" as const;
  if (p.status === "active" && p.n <= 1) return "last" as const;
  await db.delete(listingPhotos).where(eq(listingPhotos.id, photoId));
  const key = keyOf(p.src);
  if (key) {
    await db.delete(uploads).where(eq(uploads.key, key));
    await deleteMediaFile(key, "photo");
  }
  return "ok" as const;
}

/** Swaps a photo with its neighbour. The first photo is the one on the card. */
export async function shiftPhoto(listingId: string, photoId: number, dir: -1 | 1) {
  await db.transaction(async (tx) => {
    const all = await tx
      .select({ id: listingPhotos.id, position: listingPhotos.position })
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, listingId))
      .orderBy(asc(listingPhotos.position), asc(listingPhotos.id));
    const i = all.findIndex((p) => p.id === photoId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= all.length) return;
    // Renumber the whole row 0..n-1 so equal or gappy positions can't leave two photos tied.
    const order = all.map((p) => p.id);
    [order[i], order[j]] = [order[j], order[i]];
    for (const [position, id] of order.entries()) await tx.update(listingPhotos).set({ position }).where(eq(listingPhotos.id, id));
  });
}

export async function setPhotoRoom(listingId: string, photoId: number, room: Room) {
  await db.update(listingPhotos).set({ room }).where(and(eq(listingPhotos.id, photoId), eq(listingPhotos.listingId, listingId)));
}

/** Removes a listing for good, with its photos and ownership proof. Other tables that point at it cascade. */
export async function deleteListing(id: string) {
  const [l] = await db.select({ proofKey: listings.proofKey }).from(listings).where(eq(listings.id, id));
  if (!l) return false;
  const photos = await db.select({ src: listingPhotos.src }).from(listingPhotos).where(eq(listingPhotos.listingId, id));
  const keys = [...photos.map((p) => keyOf(p.src)), l.proofKey].filter((k): k is string => !!k);
  const files = keys.length ? await db.select({ key: uploads.key, kind: uploads.kind, ext: uploads.ext }).from(uploads).where(inArray(uploads.key, keys)) : [];
  await db.transaction(async (tx) => {
    await tx.delete(listings).where(eq(listings.id, id));
    if (files.length) await tx.delete(uploads).where(inArray(uploads.key, files.map((f) => f.key)));
  });
  await Promise.all(files.map((f) => deleteMediaFile(f.key, f.kind, f.ext)));
  return true;
}
