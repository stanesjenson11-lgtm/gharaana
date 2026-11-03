// Runs against the dev database: pnpm db:start && pnpm db:migrate && pnpm db:seed, then pnpm test.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, pool } from "./db.ts";
import { photosUsedElsewhere, searchCards, type Card } from "./listings.ts";
import { listingPhotos, listings, user } from "./schema.ts";
import { parseSearch } from "./parse-search.ts";
import { LOCALITIES } from "./places.ts";
import { DEFAULT_TYPE, haversine } from "./search.ts";
import { SEED } from "./seed.ts";

after(() => pool.end());

const search = (raw: Record<string, string>) => searchCards(parseSearch(raw));
const monthly = (c: Pick<Card, "type" | "price" | "maintenance">) => (c.type === "rent" ? c.price + c.maintenance : c.price);
const seedCount = (f: (l: (typeof SEED)[number]) => boolean) => SEED.filter(f).length;
// Real listings can exist alongside the samples, so exact counts compare the sample results only.
const samples = (cards: Card[]) => cards.filter((c) => c.sample).length;

test("the default search returns every sample of the default type", async () => {
  assert.equal(samples(await search({})), seedCount((l) => l.type === DEFAULT_TYPE));
});

test("budget caps the price; 4 BHK means 4 or more", async () => {
  const capped = await search({ max: "10000000" });
  assert.ok(capped.every((c) => monthly(c) <= 10_000_000));
  assert.equal(samples(capped), seedCount((l) => l.type === DEFAULT_TYPE && monthly(l) <= 10_000_000));
  const big = await search({ bhk: "4" });
  assert.ok(big.length > 0 && big.every((c) => c.bhk >= 4));
});

test("new or resale, floor band and amenities filter", async () => {
  const resale = await search({ cond: "resale", bhk: "2,3" });
  assert.equal(samples(resale), seedCount((l) => l.saleCondition === "resale" && (l.bhk === 2 || l.bhk === 3)));
  assert.equal(samples(await search({ floor: "high" })), seedCount((l) => l.type === DEFAULT_TYPE && l.floor > 10));
  const amen = await search({ amen: "Gym,Lift" });
  assert.ok(samples(amen) > 0);
  assert.equal(samples(amen), seedCount((l) => l.type === DEFAULT_TYPE && l.amenities.includes("Gym") && l.amenities.includes("Lift")));
});

test("a locality name searches about 3 km around it", async () => {
  const [lat, lng] = LOCALITIES.Koramangala;
  const near = await search({ q: "Koramangala" });
  assert.ok(near.length >= 3);
  assert.ok(near.every((c) => haversine(lat, lng, c.lat, c.lng) < 3200));
});

test("map box and drawn area", async () => {
  const box = await search({ bbox: "77.7,12.9,77.8,13.0" });
  assert.ok(box.length > 0 && box.every((c) => c.lng >= 77.7 && c.lng <= 77.8 && c.lat >= 12.9 && c.lat <= 13));
  const drawn = await search({ area: "77.6,12.92;77.66,12.92;77.66,12.95;77.6,12.95" });
  assert.ok(drawn.length > 0 && drawn.every((c) => c.lng > 77.6 && c.lng < 77.66 && c.lat > 12.92 && c.lat < 12.95));
});

test("filters combine and sorting holds", async () => {
  const pets = await search({ pets: "1", bhk: "2,3" });
  assert.equal(samples(pets), seedCount((l) => l.type === DEFAULT_TYPE && l.pets && (l.bhk === 2 || l.bhk === 3)));
  const cheapest = (await search({ sort: "price-asc" })).map(monthly);
  assert.deepEqual(cheapest, [...cheapest].sort((a, b) => a - b));
});

test("a photo reused by another owner is caught, even slightly altered", async () => {
  const owner = `test-owner-${Date.now()}`;
  const hash = -0x1234_5678_9abc_def0n;
  await db.insert(user).values({ id: owner, name: "Test", email: `${owner}@test.invalid` });
  try {
    await db.insert(listings).values({
      id: owner, ownerId: owner, type: "rent", kind: "apartment", bhk: 1, title: "t", locality: "x", area: "x",
      addressPrivate: "x", location: { x: 77.6, y: 12.9 }, price: 1, carpetSqft: 500, floor: 1, totalFloors: 2,
      furnishing: "none", facing: "East", ageYears: 1, pets: false, nonVeg: true, parking: "none", bathrooms: 1,
      balconies: 1, description: "x",
    });
    await db.insert(listingPhotos).values({ listingId: owner, position: 0, src: "x", room: "living", dhash: hash });
    const altered = hash ^ 0b101n; // two bits off
    assert.equal(await photosUsedElsewhere([altered], "someone-else", 6), true);
    assert.equal(await photosUsedElsewhere([altered], owner, 6), false, "owners may reuse their own photos");
    assert.equal(await photosUsedElsewhere([~hash], "someone-else", 6), false);
  } finally {
    await db.delete(user).where(eq(user.id, owner)); // cascades to the listing and photo
  }
});

test("a listing past its 30 days drops out of search until the owner confirms it", async () => {
  const owner = `test-expiry-${Date.now()}`;
  await db.insert(user).values({ id: owner, name: "Test", email: `${owner}@test.invalid` });
  try {
    await db.insert(listings).values({
      id: owner, ownerId: owner, status: "active", type: DEFAULT_TYPE, kind: "apartment", bhk: 1, title: "t", locality: "x",
      area: "x", addressPrivate: "x", location: { x: 77.62, y: 12.93 }, price: 1, carpetSqft: 500, floor: 1,
      totalFloors: 2, furnishing: "none", facing: "East", ageYears: 1, pets: false, nonVeg: true, parking: "none",
      bathrooms: 1, balconies: 1, description: "x", expiresAt: new Date(Date.now() - 86_400_000),
    });
    const ids = async () => (await search({ bbox: "77.6,12.9,77.65,12.95" })).map((c) => c.id);
    assert.ok(!(await ids()).includes(owner));
    await db.update(listings).set({ expiresAt: new Date(Date.now() + 86_400_000) }).where(eq(listings.id, owner));
    assert.ok((await ids()).includes(owner));
  } finally {
    await db.delete(user).where(eq(user.id, owner));
  }
});

test("cards say which homes our staff visited", async () => {
  const cards = await search({});
  assert.equal(cards.filter((c) => c.sample && c.visited).length, seedCount((l) => l.type === DEFAULT_TYPE && !!l.visitVerifiedAt));
});

test("results never carry the private address", async () => {
  const [card] = await search({});
  assert.ok(card && !("addressPrivate" in card));
});
