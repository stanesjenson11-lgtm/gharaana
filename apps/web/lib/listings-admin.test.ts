// The team's listing tools: finding, editing, moving, photos and deleting. Runs against the dev database.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { db, pool } from "./db.ts";
import { homeFields, homeRules } from "./listing-schema.ts";
import { addPhoto, deleteListing, listAllListings, listingForEdit, listingStatusCounts, moveListing, removePhoto, setPhotoRoom, shiftPhoto, updateListingDetails } from "./listings-admin.ts";
import { MEDIA_DIR } from "./media.ts";
import { listingPhotos, listings, uploads, user } from "./schema.ts";

after(() => pool.end());

const home = (id: string, ownerId: string, status: "active" | "pending_review" = "active") => ({
  id, ownerId, status, type: "buy" as const, kind: "apartment" as const, bhk: 2, title: "t", locality: "Indiranagar",
  area: "2nd Stage", addressPrivate: "12 Test Road", location: { x: 77.6, y: 12.9 }, price: 5_000_000, carpetSqft: 900, floor: 1,
  totalFloors: 4, furnishing: "none" as const, facing: "East", ageYears: 1, pets: false, nonVeg: true, parking: "none" as const,
  bathrooms: 1, balconies: 1, description: "x", saleCondition: "resale" as const,
});

const form = {
  type: "buy", kind: "villa", bhk: "3", carpetSqft: "1800", floor: "0", totalFloors: "2", facing: "North", furnishing: "semi",
  saleCondition: "new", bathrooms: "3", balconies: "1", videoUrl: "", ageYears: "0", locality: "Whitefield", area: "ITPL Road",
  address: "7 Lake View Lane", description: "A bright three bedroom villa with a garden, close to the metro and the school.",
  price: "21000000", maintenance: "", deposit: "", availableFrom: "", tenants: [], pets: "no", food: "any", parking: "car", amenities: [],
};

test("the shared rules accept an edit form and refuse a floor above the top", () => {
  const rules = homeRules(homeFields);
  assert.ok(rules.safeParse(form).success);
  const bad = rules.safeParse({ ...form, floor: "9" });
  assert.ok(!bad.success && bad.error.issues[0].path[0] === "floor");
});

test("listings are found, filtered, corrected, moved and deleted by the team", async () => {
  const t = `test-adm-${Date.now()}`;
  const owner = `${t}-owner`;
  await db.insert(user).values({ id: owner, name: "Zed Owner", email: `${owner}@test.invalid` });
  try {
    await db.insert(listings).values([home(`${t}-a`, owner), home(`${t}-b`, owner, "pending_review")]);

    const found = await listAllListings({ q: t });
    assert.deepEqual(found.rows.map((r) => r.id).sort(), [`${t}-a`, `${t}-b`]);
    assert.deepEqual((await listAllListings({ q: t, status: "pending_review" })).rows.map((r) => r.id), [`${t}-b`]);
    assert.equal((await listAllListings({ q: "Zed Owner" })).rows.some((r) => r.id === `${t}-a`), true, "found by the owner's name");
    assert.ok((await listingStatusCounts()).all >= 2);

    const parsed = homeRules(homeFields).parse(form);
    assert.equal(await updateListingDetails(`${t}-a`, parsed), true);
    const edited = await listingForEdit(`${t}-a`);
    assert.deepEqual([edited?.title, edited?.price, edited?.addressPrivate, edited?.saleCondition], ["3 BHK villa in ITPL Road, Whitefield", 21_000_000, "7 Lake View Lane", "new"]);

    assert.equal(await moveListing(`${t}-b`, "expired"), null, "a waiting listing is decided in the review queue, not taken down");
    assert.ok(await moveListing(`${t}-a`, "expired"));
    assert.equal(await moveListing(`${t}-a`, "rented"), null, "only a live listing can be marked sold");
    assert.ok(await moveListing(`${t}-a`, "active"), "relisting");
    assert.ok(await moveListing(`${t}-a`, "pending_review"), "sent back to the queue");
    assert.equal((await listingForEdit(`${t}-a`))?.status, "pending_review");

    assert.equal(await deleteListing(`${t}-b`), true);
    assert.equal(await listingForEdit(`${t}-b`), null);
  } finally {
    await db.delete(user).where(eq(user.id, owner)); // cascades to listings
  }
});

test("photos are added for the owner, reordered, kept at one on a live listing, and deleted with the listing", async () => {
  const t = `test-adm-ph-${Date.now()}`;
  const owner = `${t}-owner`;
  await db.insert(user).values({ id: owner, name: "Owner", email: `${owner}@test.invalid` });
  try {
    await db.insert(listings).values(home(`${t}-a`, owner));
    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#7a8" } }).png().toBuffer();

    assert.equal(await addPhoto(`${t}-a`, png, "living"), "ok");
    assert.equal(await addPhoto(`${t}-a`, png, "kitchen"), "ok");
    assert.equal(await addPhoto("no-such-home", png, "living"), "gone");
    let { photos } = (await listingForEdit(`${t}-a`))!;
    assert.deepEqual(photos.map((p) => p.room), ["living", "kitchen"]);
    const keys = photos.map((p) => p.src.replace("/media/", ""));
    assert.equal((await db.select().from(uploads).where(inArray(uploads.key, keys))).every((u) => u.ownerId === owner), true, "recorded under the owner");

    await shiftPhoto(`${t}-a`, photos[1].id, -1);
    ({ photos } = (await listingForEdit(`${t}-a`))!);
    assert.deepEqual(photos.map((p) => p.room), ["kitchen", "living"]);
    await setPhotoRoom(`${t}-a`, photos[0].id, "bedroom");
    assert.equal((await listingForEdit(`${t}-a`))!.photos[0].room, "bedroom");

    assert.equal(await removePhoto(`${t}-a`, photos[0].id), "ok");
    await assert.rejects(access(join(MEDIA_DIR, "public", `${photos[0].src.replace("/media/", "")}-480.webp`)), "the file went too");
    assert.equal(await removePhoto(`${t}-a`, photos[1].id), "last", "a live listing keeps a photo");
    assert.equal(await removePhoto(`${t}-a`, 0), "gone");

    assert.equal(await deleteListing(`${t}-a`), true);
    assert.equal((await db.select().from(listingPhotos).where(eq(listingPhotos.listingId, `${t}-a`))).length, 0);
    assert.equal((await db.select().from(uploads).where(inArray(uploads.key, keys))).length, 0);
  } finally {
    await db.delete(user).where(eq(user.id, owner));
  }
});
