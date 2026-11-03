import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { readMedia } from "@/lib/media";
import { uploads } from "@/lib/schema";
import { staffGate } from "@/lib/session";

// Ownership proofs, for reviewers who have passed their authenticator this session. Never cached anywhere.
export async function GET(_request: Request, { params }: RouteContext<"/api/admin/proof/[key]">) {
  if ((await staffGate("queue")).gate !== "ok") return new Response("Not found", { status: 404 });
  const { key } = await params;
  const [row] = await db.select({ ext: uploads.ext }).from(uploads).where(eq(uploads.key, key));
  if (!row || !["pdf", "jpg"].includes(row.ext)) return new Response("Not found", { status: 404 });
  const body = await readMedia(`private/${key}.${row.ext}`);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body as BodyInit, {
    headers: {
      "content-type": row.ext === "pdf" ? "application/pdf" : "image/jpeg",
      "cache-control": "private, no-store",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
    },
  });
}
