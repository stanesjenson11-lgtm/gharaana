// Uploaded photos and ownership proofs. Server only.
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

// ponytail: local disk serves dev and the single VPS. Cloudflare R2 replaces it when the client's account exists;
// keys and URLs stay the same. Outside the repo so the dev watcher never sees writes.
export const MEDIA_DIR =
  process.env.MEDIA_DIR ?? join(process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share"), "directnest", "media");
export const WIDTHS = [480, 960, 1600] as const;
const MAX_PHOTO = 15 * 1024 * 1024;
const MAX_PROOF = 10 * 1024 * 1024;

/** A problem the uploader can fix; the message is shown to them as is. */
export class MediaError extends Error {}

/** Strips every bit of metadata (EXIF GPS included), applies orientation, saves WebP at three widths. */
export async function savePhoto(input: Buffer) {
  if (input.length > MAX_PHOTO) throw new MediaError("Photos must be under 15 MB.");
  let img: ReturnType<typeof sharp>;
  let width: number;
  try {
    img = sharp(input, { failOn: "error" }).rotate();
    ({ width } = (await img.clone().toBuffer({ resolveWithObject: true })).info);
  } catch {
    throw new MediaError("That file isn't a photo we can read. Use a JPG or PNG.");
  }
  if (width < 600) throw new MediaError("That photo is too small. Use one at least 600 pixels wide.");

  const key = randomUUID();
  const dir = join(MEDIA_DIR, "public");
  await mkdir(dir, { recursive: true });
  // sharp drops metadata on output unless asked to keep it, so nothing from the camera survives.
  await Promise.all(
    WIDTHS.map((w) => img.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(join(dir, `${key}-${w}.webp`))),
  );
  return { key, dhash: await dHash(input) };
}

/** Bills and tax receipts: PDFs kept as uploaded, images re-encoded so their metadata goes. Never public. */
export async function saveProof(input: Buffer) {
  if (input.length > MAX_PROOF) throw new MediaError("Documents must be under 10 MB.");
  const isPdf = input.subarray(0, 5).toString("latin1") === "%PDF-";
  let out = input;
  if (!isPdf) {
    try {
      out = await sharp(input, { failOn: "error" }).rotate().jpeg({ quality: 85 }).toBuffer();
    } catch {
      throw new MediaError("Upload a PDF, JPG or PNG of the bill or receipt.");
    }
  }
  const key = randomUUID();
  const ext = isPdf ? "pdf" : "jpg";
  await mkdir(join(MEDIA_DIR, "private"), { recursive: true });
  await writeFile(join(MEDIA_DIR, "private", `${key}.${ext}`), out);
  return { key, ext };
}

/** 64-bit difference hash: survives resizing, recompression and brightness changes; a fresh photo differs widely. */
export async function dHash(input: Buffer): Promise<bigint> {
  const { data } = await sharp(input).rotate().grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let hash = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) hash = (hash << 1n) | (data[y * 9 + x] > data[y * 9 + x + 1] ? 1n : 0n);
  return BigInt.asIntN(64, hash); // signed so it fits Postgres bigint
}

export function hamming(a: bigint, b: bigint) {
  let x = BigInt.asUintN(64, a ^ b);
  let n = 0;
  for (; x; x >>= 1n) n += Number(x & 1n);
  return n;
}

/** Two photos this close are the same picture. Postgres runs the same test with bit_count over the XOR. */
export const SAME_PHOTO = 6;

/** Deletes an uploaded photo or proof document from storage. */
export async function deleteMediaFile(key: string, kind: "photo" | "proof", ext = "jpg") {
  if (kind === "photo") {
    await Promise.all(WIDTHS.map((w) => unlink(join(MEDIA_DIR, "public", `${key}-${w}.webp`)).catch(() => {})));
  } else {
    await unlink(join(MEDIA_DIR, "private", `${key}.${ext}`)).catch(() => {});
  }
}
