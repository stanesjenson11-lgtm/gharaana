// Bulk import of owners' homes from the client's spreadsheet, saved as CSV. Every row lands in the review queue; nothing goes
// straight onto the site. Owners are matched by phone (or created), so they can later sign in with an OTP and see their homes.
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { parseCsv, toCsv } from "./csv.ts";
import { db } from "./db.ts";
import { bhkLabel, youtubeId } from "./format.ts";
import { savePhoto } from "./media.ts";
import { LOCALITIES } from "./places.ts";
import { listingPhotos, listings, uploads, user } from "./schema.ts";
import { AMENITIES } from "./search.ts";

/** [column, what to put in it, example]. The template the admin page offers is built from this. */
export const COLUMNS = [
  ["owner_name", "Owner's full name", "Priya Sharma"],
  ["owner_phone", "10-digit mobile number", "9876543210"],
  ["kind", "flat, independent house or villa", "flat"],
  ["bhk", "Bedrooms; 0 for a 1 RK", "2"],
  ["condition", "new or resale", "resale"],
  ["price", "Sale price in rupees", "13500000"],
  ["maintenance", "Monthly maintenance in rupees; 0 if none", "3500"],
  ["carpet_sqft", "Carpet area in sq ft", "1150"],
  ["floor", "0 for the ground floor", "3"],
  ["total_floors", "Floors in the building", "5"],
  ["facing", "North, North-East, East, South-East, South, South-West, West or North-West", "East"],
  ["age_years", "Age of the building in years", "4"],
  ["furnishing", "furnished, semi-furnished or unfurnished", "semi-furnished"],
  ["bathrooms", "Number of bathrooms", "2"],
  ["balconies", "Number of balconies", "1"],
  ["parking", "none, bike or car", "car"],
  ["pets", "yes or no (allowed in the society)", "yes"],
  ["locality", `One of: ${Object.keys(LOCALITIES).join(", ")}; any name works if lat and lng are filled`, "HSR Layout"],
  ["area", "Block, sector or street", "Sector 2"],
  ["address", "Full address; never shown on the site", "14, 2nd Cross, Sector 2, HSR Layout, Bengaluru 560102"],
  ["lat", "Optional latitude of the building", ""],
  ["lng", "Optional longitude of the building", ""],
  ["available_from", "YYYY-MM-DD; leave empty if ready to move", ""],
  ["amenities", `Separated by ; from: ${AMENITIES.join(", ")}`, "Lift; Power backup; 24×7 security"],
  ["description", "At least 40 characters about the home", "A bright corner flat with cross-ventilation, five minutes from the Outer Ring Road."],
  ["photo_urls", "One or more direct https links to photos, separated by spaces; living room first", "https://example.com/photos/living.jpg https://example.com/photos/bedroom.jpg"],
  ["video_url", "Optional YouTube link", ""],
] as const;

export const TEMPLATE_CSV = toCsv([COLUMNS.map((c) => c[0]), COLUMNS.map((c) => c[2])]);
export const MAX_ROWS = 500;

const KIND = { flat: "apartment", apartment: "apartment", "independent house": "independent-house", house: "independent-house", villa: "villa" } as const;
const FURNISHING = { furnished: "full", full: "full", "fully furnished": "full", "semi-furnished": "semi", semi: "semi", "semi furnished": "semi", unfurnished: "none", none: "none" } as const;
const CONDITION = { new: "new", "new from builder": "new", resale: "resale" } as const;
const PARKING = { none: "none", no: "none", bike: "bike", "two-wheeler": "bike", car: "car" } as const;
const YES_NO = { yes: true, y: true, true: true, no: false, n: false, false: false } as const;
const FACING = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"];

export type Home = NonNullable<Extract<ReturnType<typeof readRow>, { data: unknown }>["data"]>;
export type ImportRow = { line: number; errors: string[]; data?: Home };

function readRow(r: Record<string, string>) {
  const errors: string[] = [];
  const val = (k: string) => (r[k] ?? "").trim();
  const int = (k: string, min: number, max: number, optional = false) => {
    const raw = val(k).replace(/[,\s₹]/g, "");
    if (!raw) {
      if (!optional) errors.push(`${k} is empty`);
      return 0;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) errors.push(`${k} must be a whole number from ${min.toLocaleString("en-IN")} to ${max.toLocaleString("en-IN")}`);
    return n;
  };
  const choice = <T>(k: string, map: Record<string, T>, hint: string): T => {
    const v = map[val(k).toLowerCase()];
    if (v === undefined) errors.push(`${k} must be ${hint}`);
    return v;
  };

  const ownerName = val("owner_name").replace(/\s+/g, " ");
  if (ownerName.length < 2 || ownerName.length > 80) errors.push("owner_name is missing");
  const digits = val("owner_phone").replace(/\D/g, "");
  const ownerPhone = digits.length === 10 ? `+91${digits}` : digits.length === 12 && digits.startsWith("91") ? `+${digits}` : "";
  if (!/^\+91[6-9]\d{9}$/.test(ownerPhone)) errors.push("owner_phone must be a 10-digit Indian mobile number");

  const kind = choice("kind", KIND, "flat, independent house or villa");
  const bhk = int("bhk", 0, 4);
  const saleCondition = choice("condition", CONDITION, "new or resale");
  const price = int("price", 100_000, 1_000_000_000);
  const maintenance = int("maintenance", 0, 1_000_000, true);
  const carpetSqft = int("carpet_sqft", 100, 20_000);
  const floor = int("floor", 0, 80);
  const totalFloors = int("total_floors", 1, 80);
  if (floor > totalFloors) errors.push("floor can't be above total_floors");
  const facing = FACING.find((f) => f.toLowerCase() === val("facing").toLowerCase().replace(/\s+/g, "-"));
  if (!facing) errors.push(`facing must be one of ${FACING.join(", ")}`);
  const ageYears = int("age_years", 0, 100);
  const furnishing = choice("furnishing", FURNISHING, "furnished, semi-furnished or unfurnished");
  const bathrooms = int("bathrooms", 1, 10);
  const balconies = int("balconies", 0, 10, true);
  const parking = choice("parking", PARKING, "none, bike or car");
  const pets = choice("pets", YES_NO, "yes or no");

  // Position: the given coordinates, or the centre of a known locality.
  const knownLocality = Object.keys(LOCALITIES).find((l) => l.toLowerCase() === val("locality").toLowerCase());
  const locality = knownLocality ?? val("locality");
  const [lat, lng] = [Number(val("lat")), Number(val("lng"))];
  const hasPin = val("lat") !== "" && val("lng") !== "" && lat >= 12.7 && lat <= 13.3 && lng >= 77.25 && lng <= 78;
  if ((val("lat") || val("lng")) && !hasPin) errors.push("lat and lng must both be filled and inside Bengaluru");
  if (!hasPin && !knownLocality) errors.push(`locality must be one of ${Object.keys(LOCALITIES).join(", ")}, or fill lat and lng`);
  if (locality.length < 2 || locality.length > 80) errors.push("locality is missing");
  const position: [number, number] = hasPin ? [lat, lng] : (LOCALITIES[knownLocality ?? ""] ?? [0, 0]);

  const area = val("area");
  if (area.length < 2 || area.length > 120) errors.push("area is missing");
  const address = val("address");
  if (address.length < 10 || address.length > 400) errors.push("address needs the full address (at least 10 characters)");
  const availableFrom = val("available_from");
  if (availableFrom && !(/^\d{4}-\d{2}-\d{2}$/.test(availableFrom) && !Number.isNaN(Date.parse(availableFrom)))) errors.push("available_from must look like 2026-12-01");

  const amenityNames = val("amenities").split(";").map((a) => a.trim()).filter(Boolean);
  const amenities = amenityNames.map((a) => AMENITIES.find((x) => x.toLowerCase() === a.toLowerCase())).filter((a) => a !== undefined);
  const unknown = amenityNames.filter((a) => !AMENITIES.some((x) => x.toLowerCase() === a.toLowerCase()));
  if (unknown.length) errors.push(`unknown amenities: ${unknown.join(", ")}`);

  const description = val("description").replace(/\s+/g, " ");
  if (description.length < 40 || description.length > 1500) errors.push("description needs 40 to 1,500 characters");

  const photoUrls = val("photo_urls").split(/[\s;]+/).filter(Boolean);
  if (!photoUrls.length) errors.push("photo_urls needs at least one photo link");
  if (photoUrls.length > 20) errors.push("photo_urls can have at most 20 links");
  if (photoUrls.some((u) => !/^https:\/\/[^\s/]+\.[^\s/]+\//.test(u))) errors.push("photo_urls must be https links");

  const video = val("video_url");
  const videoId = video ? youtubeId(video) : null;
  if (video && !videoId) errors.push("video_url must be a YouTube link");

  if (errors.length) return { errors };
  return {
    errors,
    data: {
      ownerName, ownerPhone, kind, bhk, saleCondition, price, maintenance, carpetSqft, floor, totalFloors, facing: facing!, ageYears,
      furnishing, bathrooms, balconies, parking, pets, locality, area, address, position, availableFrom: availableFrom || null,
      amenities, description, photoUrls, videoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
    },
  };
}

/** Reads and checks the whole file without writing anything. */
export function readImport(text: string): { errors: string[]; rows: ImportRow[] } {
  const [header, ...body] = parseCsv(text);
  if (!header) return { errors: ["The file is empty."], rows: [] };
  const names = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const missing = COLUMNS.filter(([c]) => !["lat", "lng", "available_from", "video_url", "amenities", "maintenance", "balconies"].includes(c) && !names.includes(c)).map(([c]) => c);
  if (missing.length) return { errors: [`These columns are missing: ${missing.join(", ")}. Start from the template.`], rows: [] };
  if (body.length > MAX_ROWS) return { errors: [`That's ${body.length} rows; import at most ${MAX_ROWS} at a time.`], rows: [] };
  return {
    errors: [],
    rows: body.map((cells, i) => ({ line: i + 2, ...readRow(Object.fromEntries(names.map((n, j) => [n, cells[j] ?? ""]))) })),
  };
}

// ponytail: blocks obvious internal addresses only; a hostname that resolves to a private IP still gets through. Admin-only feature.
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/i;

async function fetchPhoto(link: string) {
  const u = new URL(link);
  if (u.protocol !== "https:" || PRIVATE_HOST.test(u.hostname)) throw new Error("only public https links work");
  const res = await fetch(u, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "Gharaana importer" } });
  if (!res.ok) throw new Error(`the link answered ${res.status}`);
  if (!(res.headers.get("content-type") ?? "").startsWith("image/")) throw new Error("the link is a web page, not a photo; use the direct image link");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 15_000_000) throw new Error("the photo is over 15 MB");
  return bytes;
}

const KIND_WORD = { apartment: "flat", "independent-house": "independent house", villa: "villa" } as const;
// ponytail: rooms by position (living room first, as the template asks); reviewers see the photos before approving.
const ROOM_ORDER = ["living", "bedroom", "kitchen", "bathroom"] as const;

export type ImportResult = { line: number; status: "imported" | "skipped" | "failed"; message: string; id?: string };

/** Imports the valid rows, one at a time. Re-importing the same sheet skips homes already imported. */
export async function runImport(text: string): Promise<ImportResult[]> {
  const { rows } = readImport(text);
  const results: ImportResult[] = [];
  for (const { line, data: h } of rows) {
    if (!h) {
      results.push({ line, status: "skipped", message: "has errors; fix them and import again" });
      continue;
    }
    // Same owner, address and size: same home, same id.
    const fingerprint = createHash("sha256").update(`${h.ownerPhone}|${h.address.toLowerCase()}|${h.bhk}|${h.carpetSqft}`).digest("hex").slice(0, 8);
    const id = `${h.bhk === 0 ? "1rk" : `${h.bhk}bhk`}-${h.area}-${h.locality}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) + "-" + fingerprint;
    const [exists] = await db.select({ id: listings.id }).from(listings).where(eq(listings.id, id));
    if (exists) {
      results.push({ line, status: "skipped", message: "already imported", id });
      continue;
    }

    let [owner] = await db.select({ id: user.id }).from(user).where(eq(user.phoneNumber, h.ownerPhone));
    if (!owner) {
      [owner] = await db
        .insert(user)
        .values({ id: randomUUID(), name: h.ownerName, email: `${h.ownerPhone.slice(1)}@phone.directnest.invalid`, phoneNumber: h.ownerPhone })
        .returning({ id: user.id });
    }

    const photos: { key: string; dhash: bigint }[] = [];
    const problems: string[] = [];
    for (const [i, link] of h.photoUrls.entries()) {
      try {
        photos.push(await savePhoto(await fetchPhoto(link)));
      } catch (e) {
        problems.push(`photo ${i + 1}: ${e instanceof Error ? e.message : "couldn't be read"}`);
      }
    }
    if (!photos.length) {
      results.push({ line, status: "failed", message: `no photo could be downloaded (${problems.join("; ")})` });
      continue;
    }

    const jitter = () => (Math.random() - 0.5) * 0.0027; // public position ~150 m off, like posted homes
    const what = h.bhk === 0 ? "1 RK studio" : `${bhkLabel(h.bhk)} ${KIND_WORD[h.kind]}`;
    await db.transaction(async (tx) => {
      await tx.insert(uploads).values(photos.map((p) => ({ key: p.key, ownerId: owner.id, kind: "photo" as const, dhash: p.dhash, ext: "webp" })));
      await tx.insert(listings).values({
        id,
        ownerId: owner.id,
        type: "buy",
        kind: h.kind,
        bhk: h.bhk,
        title: `${what} in ${h.area}, ${h.locality}`,
        locality: h.locality,
        area: h.area,
        addressPrivate: h.address,
        location: { x: h.position[1] + jitter(), y: h.position[0] + jitter() },
        price: h.price,
        maintenance: h.maintenance,
        carpetSqft: h.carpetSqft,
        floor: h.floor,
        totalFloors: h.totalFloors,
        furnishing: h.furnishing,
        facing: h.facing,
        ageYears: h.ageYears,
        availableFrom: h.availableFrom,
        pets: h.pets,
        nonVeg: true,
        parking: h.parking,
        bathrooms: h.bathrooms,
        balconies: h.balconies,
        amenities: h.amenities,
        description: h.description,
        saleCondition: h.saleCondition,
        videoUrl: h.videoUrl,
        riskFlags: ["imported"],
      });
      await tx.insert(listingPhotos).values(
        photos.map((p, position) => ({ listingId: id, position, src: `/media/${p.key}`, room: ROOM_ORDER[position] ?? ("bedroom" as const), dhash: p.dhash })),
      );
    });
    results.push({ line, status: "imported", message: problems.length ? `imported without ${problems.join("; ")}` : "in the review queue", id });
  }
  return results;
}
