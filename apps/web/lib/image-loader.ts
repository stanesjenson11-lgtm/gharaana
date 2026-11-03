// Images are resized at the source, never on demand by our 1-vCPU server:
// owners' photos are pre-built at 480/960/1600 on upload; stock photos resize on Unsplash's CDN.
export default function imageLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  if (src.startsWith("/media/")) return `${src}-${width <= 480 ? 480 : width <= 960 ? 960 : 1600}.webp`;
  if (!src.startsWith("https://")) return src;
  const url = new URL(src);
  url.searchParams.set("w", String(width));
  url.searchParams.set("q", String(quality ?? 70));
  url.searchParams.set("auto", "format");
  return url.toString();
}
