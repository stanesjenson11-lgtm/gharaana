// One-time copy of the photos and ownership proofs on this machine's disk (lib/media.ts MEDIA_DIR) into the Vercel Blob
// store, under the same paths, so listings and the review queue keep working once the site reads from Blob.
// Needs the store's read-write token: BLOB_READ_WRITE_TOKEN=... node scripts/media-to-blob.ts   (safe to run again)
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { put } from "@vercel/blob";
import { MEDIA_DIR } from "../lib/media.ts";

if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Set BLOB_READ_WRITE_TOKEN (Vercel: Storage > the Blob store > .env.local)");
const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", pdf: "application/pdf" };

let copied = 0;
for (const folder of ["public", "private"]) {
  const names = await readdir(join(MEDIA_DIR, folder)).catch(() => [] as string[]);
  for (const name of names) {
    const ext = name.split(".").pop() ?? "";
    if (!TYPES[ext]) continue;
    await put(`${folder}/${name}`, await readFile(join(MEDIA_DIR, folder, name)), {
      access: "private", contentType: TYPES[ext], addRandomSuffix: false, allowOverwrite: true,
    });
    copied++;
    if (copied % 50 === 0) console.log(`${copied} files…`);
  }
}
console.log(`copied ${copied} files from ${MEDIA_DIR} to Vercel Blob`);
