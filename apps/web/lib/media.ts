// Uploaded photos and ownership proofs. Server only.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import sharp from "sharp";

// Where the files live. On Vercel: one private Vercel Blob store (connected to the project, so BLOB_STORE_ID and OIDC,
// or BLOB_READ_WRITE_TOKEN), because a function's disk is wiped and not shared. Without a store (dev, tests, a single
// VPS): local disk, outside the repo so the dev watcher never sees writes. Both use the same paths, "public/<key>-<w>.webp"
// and "private/<key>.<ext>", so keys and URLs (/media/..., the admin proof route) never change.
export const MEDIA_DIR =
  process.env.MEDIA_DIR ?? join(process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share"), "directnest", "media");
const blobStore = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

async function store(path: string, body: Buffer, contentType: string) {
  if (blobStore()) {
    const { put } = await import("@vercel/blob");
    await put(path, body, { access: "private", contentType, addRandomSuffix: false });
    return;
  }
  await mkdir(dirname(join(MEDIA_DIR, path)), { recursive: true });
  await writeFile(join(MEDIA_DIR, path), body);
}

/** A stored file's bytes as a stream (Blob) or buffer (disk), or null when it isn't there. Callers decide who may see it. */
export async function readMedia(path: string): Promise<ReadableStream<Uint8Array> | Buffer | null> {
  if (blobStore()) {
    const { get } = await import("@vercel/blob");
    const res = await get(path, { access: "private" });
    return res?.statusCode === 200 ? res.stream : null;
  }
  return readFile(join(MEDIA_DIR, path)).catch(() => null);
}

async function remove(path: string) {
  if (blobStore()) {
    const { del } = await import("@vercel/blob");
    await del(path).catch(() => {});
    return;
  }
  await unlink(join(MEDIA_DIR, path)).catch(() => {});
}
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
  // sharp drops metadata on output unless asked to keep it, so nothing from the camera survives.
  await Promise.all(
    WIDTHS.map(async (w) =>
      store(`public/${key}-${w}.webp`, await img.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(), "image/webp"),
    ),
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
  await store(`private/${key}.${ext}`, out, isPdf ? "application/pdf" : "image/jpeg");
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
  if (kind === "photo") await Promise.all(WIDTHS.map((w) => remove(`public/${key}-${w}.webp`)));
  else await remove(`private/${key}.${ext}`);
}
