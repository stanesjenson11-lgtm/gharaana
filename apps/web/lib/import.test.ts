// Runs against the dev database. Photos are written to a temporary folder and "downloaded" from a stubbed fetch.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

process.env.MEDIA_DIR = join(tmpdir(), `directnest-import-test-${Date.now()}`);
const { eq } = await import("drizzle-orm");
const { parseCsv, toCsv } = await import("./csv.ts");
const { db, pool } = await import("./db.ts");
const { COLUMNS, readImport, runImport, TEMPLATE_CSV } = await import("./import.ts");
const { listingPhotos, listings, user } = await import("./schema.ts");

after(async () => {
  await pool.end();
  await rm(process.env.MEDIA_DIR!, { recursive: true, force: true });
});

test("CSV: quoted commas, quotes and line breaks, CRLF and Excel's byte-order mark", () => {
  const text = '﻿name,note\r\n"Rao, Priya","She said ""hi""\nthen left"\r\n\r\nplain,x\r\n';
  assert.deepEqual(parseCsv(text), [["name", "note"], ["Rao, Priya", 'She said "hi"\nthen left'], ["plain", "x"]]);
  assert.deepEqual(parseCsv(toCsv(parseCsv(text))), parseCsv(text), "round trip");
});

test("the template's example row is valid, and bad rows say exactly what's wrong", () => {
  const ok = readImport(TEMPLATE_CSV);
  assert.deepEqual([ok.errors, ok.rows[0].errors], [[], []]);
  assert.equal(ok.rows[0].data?.ownerPhone, "+919876543210");

  const header = COLUMNS.map((c) => c[0]);
  const bad = Object.fromEntries(COLUMNS.map((c) => [c[0], c[2]])) as Record<string, string>;
  Object.assign(bad, { owner_phone: "12345", kind: "castle", floor: "9", total_floors: "4", amenities: "Lift; Helipad", photo_urls: "http://insecure.example/a.jpg" });
  const { rows } = readImport(toCsv([header, header.map((h) => bad[h])]));
  assert.equal(rows[0].line, 2);
  for (const part of ["owner_phone", "kind", "floor can't be above", "Helipad", "https"]) assert.ok(rows[0].errors.some((e) => e.includes(part)), part);

  assert.match(readImport("owner_name,price\nA,1").errors[0], /columns are missing/);
});

test("import: creates the owner, downloads photos, queues the home for review, and skips it the second time", async () => {
  const phone = `98${String(Date.now()).slice(-8)}`;
  const jpeg = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 120, g: 140, b: 160 } } }).jpeg().toBuffer();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: URL) =>
    String(url).includes("broken") ? new Response("<html>", { headers: { "content-type": "text/html" } }) : new Response(new Uint8Array(jpeg), { headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch;
  const row = Object.fromEntries(COLUMNS.map((c) => [c[0], c[2]])) as Record<string, string>;
  Object.assign(row, { owner_phone: phone, owner_name: "Import Test", photo_urls: "https://photos.example/living.jpg https://photos.example/broken.html https://photos.example/bed.jpg" });
  const header = COLUMNS.map((c) => c[0]);
  const csv = toCsv([header, header.map((h) => row[h])]);
  try {
    const [first] = await runImport(csv);
    assert.equal(first.status, "imported", first.message);
    assert.match(first.message, /photo 2: the link is a web page/);
    const [home] = await db.select().from(listings).where(eq(listings.id, first.id!));
    assert.deepEqual([home.status, home.riskFlags, home.saleCondition, home.type], ["pending_review", ["imported"], "resale", "buy"]);
    assert.equal((await db.select().from(listingPhotos).where(eq(listingPhotos.listingId, home.id))).length, 2);
    const [owner] = await db.select().from(user).where(eq(user.id, home.ownerId));
    assert.deepEqual([owner.name, owner.phoneNumber], ["Import Test", `+91${phone}`]);

    const [again] = await runImport(csv);
    assert.deepEqual([again.status, again.message], ["skipped", "already imported"]);
  } finally {
    globalThis.fetch = realFetch;
    await db.delete(user).where(eq(user.phoneNumber, `+91${phone}`));
  }
});
