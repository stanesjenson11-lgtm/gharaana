import { and, count, eq, gt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MediaError, savePhoto, saveProof } from "@/lib/media";
import { uploads } from "@/lib/schema";
import { getMember } from "@/lib/session";

const DAILY_LIMIT = 60; // a few listings' worth of photos; stops anyone filling the disk

export async function POST(request: Request) {
  const session = await getMember();
  if (!session) return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });

  const [{ n }] = await db
    .select({ n: count() })
    .from(uploads)
    .where(and(eq(uploads.ownerId, session.user.id), gt(uploads.createdAt, sql`now() - interval '1 day'`)));
  if (n >= DAILY_LIMIT) return NextResponse.json({ error: "Upload limit reached for today. Try again tomorrow." }, { status: 429 });

  const form = await request.formData();
  const file = form.get("file");
  const kind = form.get("kind");
  if (!(file instanceof File) || (kind !== "photo" && kind !== "proof")) {
    return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (kind === "photo") {
      const { key, dhash } = await savePhoto(bytes);
      await db.insert(uploads).values({ key, ownerId: session.user.id, kind, dhash, ext: "webp" });
      return NextResponse.json({ key, src: `/media/${key}` });
    }
    const { key, ext } = await saveProof(bytes);
    await db.insert(uploads).values({ key, ownerId: session.user.id, kind, ext });
    return NextResponse.json({ key });
  } catch (e) {
    if (e instanceof MediaError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
