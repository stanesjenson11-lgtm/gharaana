import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MEDIA_DIR } from "@/lib/media";

// Public listing photos only. The strict name check means no path can reach the private proofs folder.
const NAME = /^[0-9a-f-]{36}-(480|960|1600)\.webp$/;

export async function GET(_request: Request, { params }: RouteContext<"/media/[file]">) {
  const { file } = await params;
  if (!NAME.test(file)) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(join(MEDIA_DIR, "public", file));
    return new Response(body, {
      headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
