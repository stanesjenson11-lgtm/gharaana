const inrFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** ₹45,000 · ₹2,25,000 (Indian digit grouping). */
export const inr = (n: number) => inrFormat.format(n);

/** Compact Indian price: ₹47.5k, ₹85 L, ₹1.45 Cr. */
export function inrShort(n: number) {
  const trim = (x: number) => String(Number(x.toFixed(2)));
  if (n >= 1e7) return `₹${trim(n / 1e7)} Cr`;
  if (n >= 1e5) return `₹${trim(n / 1e5)} L`;
  if (n >= 1e3) return `₹${trim(n / 1e3)}k`;
  return `₹${n}`;
}

/** +919845012345 → +91 98450 12345 */
export const phone = (n: string) => n.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2");

/** The 11-character video id from any common YouTube link (watch, youtu.be, shorts, embed, live), or null. */
export function youtubeId(link: string) {
  try {
    const u = new URL(link);
    const host = u.hostname.replace(/^(www|m)\./, "");
    const id =
      host === "youtu.be" ? u.pathname.slice(1) : ["youtube.com", "youtube-nocookie.com"].includes(host) ? (u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]) : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export const sqft = (n: number) => `${n.toLocaleString("en-IN")} sq ft`;

export const bhkLabel = (bhk: number) => (bhk === 0 ? "1 RK" : `${bhk} BHK`);

export function daysAgo(days: number) {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

export function distance(m: number) {
  return m < 1000 ? `${Math.round(m / 50) * 50} m` : `${(m / 1000).toFixed(1)} km`;
}
