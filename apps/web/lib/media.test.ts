import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), "dn-media-"));
const { dHash, hamming, MediaError, SAME_PHOTO, savePhoto, saveProof } = await import("./media.ts");

// A textured test "photo": smooth gradients plus a few shapes, like a room more than like noise.
async function photo(seed: number, width = 1200) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${(width * 3) / 4}" viewBox="0 0 400 300">
    <rect width="400" height="300" fill="hsl(${seed * 47 % 360},40%,60%)"/>
    <circle cx="${80 + (seed * 37) % 240}" cy="${60 + (seed * 53) % 180}" r="70" fill="hsl(${seed * 91 % 360},50%,30%)"/>
    <rect x="${(seed * 71) % 200}" y="150" width="180" height="120" fill="hsl(${seed * 13 % 360},30%,85%)"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).withExif({ IFD0: { Copyright: "camera-and-gps-data" } }).toBuffer();
}

test("dHash matches the same photo after resizing, recompression and brightening", async () => {
  const original = await photo(1);
  const reworked = await sharp(original).resize(700).modulate({ brightness: 1.1 }).jpeg({ quality: 55 }).toBuffer();
  assert.ok(hamming(await dHash(original), await dHash(reworked)) <= SAME_PHOTO);
  assert.ok(hamming(await dHash(original), await dHash(await photo(2))) > SAME_PHOTO);
});

test("saved photos lose all metadata and come in three widths", async () => {
  const input = await photo(3);
  assert.ok((await sharp(input).metadata()).exif, "test photo should carry EXIF");
  const { key } = await savePhoto(input);
  const files = readdirSync(join(process.env.MEDIA_DIR!, "public")).filter((f) => f.startsWith(key));
  assert.deepEqual(files.sort(), [`${key}-1600.webp`, `${key}-480.webp`, `${key}-960.webp`]);
  const meta = await sharp(join(process.env.MEDIA_DIR!, "public", `${key}-960.webp`)).metadata();
  assert.equal(meta.exif, undefined);
  assert.equal(meta.width, 960);
});

test("bad uploads get a fixable message", async () => {
  await assert.rejects(savePhoto(Buffer.from("not an image")), MediaError);
  await assert.rejects(savePhoto(await photo(4, 400)), /too small/);
  const proof = await saveProof(Buffer.from("%PDF-1.7 fake bill"));
  assert.equal(proof.ext, "pdf");
  await assert.rejects(saveProof(Buffer.from("hello")), MediaError);
});
