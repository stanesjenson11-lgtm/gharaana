import { readMedia } from "@/lib/media";

// Public listing photos only. The strict name check means no path can reach the private proofs folder.
const NAME = /^[0-9a-f-]{36}-(480|960|1600)\.webp$/;

export async function GET(_request: Request, { params }: RouteContext<"/media/[file]">) {
  const { file } = await params;
  if (!NAME.test(file)) return new Response("Not found", { status: 404 });
  const body = await readMedia(`public/${file}`);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body as BodyInit, {
    headers: {
      "content-type": "image/webp",
      "cache-control": "public, max-age=31536000, immutable",
      // a photo's key never changes, so Vercel's CDN keeps the copy too and the store is read once per photo and size
      "cdn-cache-control": "public, max-age=31536000, immutable",
    },
  });
}
