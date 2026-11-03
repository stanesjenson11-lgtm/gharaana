// Listing types and small helpers shared by server and browser. Filtering itself happens in Postgres (lib/listings.ts).

/** The client launches with buying and selling only (requirements form, Oct 2026). Flip when rentals start. */
export const RENTALS = false;
export const DEFAULT_TYPE: ListingType = RENTALS ? "rent" : "buy";

/** One list for the post form, the amenities filter and the listing page, so the words always match. */
export const AMENITIES = [
  "Lift",
  "Power backup",
  "24×7 security",
  "Gym",
  "Swimming pool",
  "Club house",
  "Children's play area",
  "Gas pipeline",
  "Intercom",
  "CCTV",
  "Visitor parking",
  "Rainwater harvesting",
] as const;

/** Floor filter bands; values are what goes in the URL. */
export const FLOORS = [
  ["ground", "Ground floor"],
  ["low", "1st to 3rd"],
  ["mid", "4th to 10th"],
  ["high", "Above 10th"],
] as const;

/** Visit time slots; values are what's stored on a lead. */
export const SLOTS = [
  ["morning", "Morning, 9 to 12"],
  ["afternoon", "Afternoon, 12 to 4"],
  ["evening", "Evening, 4 to 8"],
] as const;

/** "Sat, 18 Oct, Evening, 4 to 8" for a visit request. */
export function visitTime(date: string | null, slot: string | null) {
  const day = date && new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  return [day, SLOTS.find(([v]) => v === slot)?.[1]].filter(Boolean).join(", ");
}

export type ListingType = "rent" | "buy";
export type Furnishing = "full" | "semi" | "none";
export type Tenant = "family" | "bachelors" | "company";
export type PropertyKind = "apartment" | "independent-house" | "villa";
export type Room = "living" | "bedroom" | "kitchen" | "bathroom" | "exterior" | "balcony";

export interface Photo {
  src: string;
  room: Room;
  credit: string;
}

export interface Listing {
  id: string;
  type: ListingType;
  kind: PropertyKind;
  bhk: number; // 0 = 1 RK
  title: string;
  locality: string;
  area: string;
  lat: number; // public, approximate (jittered); exact address is never in this object
  lng: number;
  price: number; // monthly rent, or sale price
  maintenance: number; // monthly
  deposit: number; // rent only
  carpetSqft: number;
  floor: number;
  totalFloors: number;
  furnishing: Furnishing;
  facing: string;
  ageYears: number;
  availableInDays: number;
  tenants: Tenant[]; // empty = anyone
  pets: boolean;
  nonVeg: boolean;
  parking: "none" | "bike" | "car";
  bathrooms: number;
  balconies: number;
  amenities: string[];
  description: string;
  photos: Photo[];
  owner: { name: string; verified: boolean };
  listedDaysAgo: number;
  confirmedDaysAgo: number;
  sample: boolean; // seeded demo listing
  saleCondition?: "new" | "resale" | null;
  videoUrl?: string | null;
  visitVerifiedAt?: Date | null;
  project?: { id: string; name: string; builder: string; rera: string } | null; // a unit of a builder's project
}

export const SORTS = ["relevant", "newest", "price-asc", "price-desc"] as const;

export type { SearchParams } from "./parse-search.ts";
import type { SearchParams } from "./parse-search.ts";
import { inrShort } from "./format.ts";

/** Back to a query string, dropping defaults so URLs stay short and shareable. */
export function toQuery(p: Partial<SearchParams>) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if ((k === "type" && v === DEFAULT_TYPE) || (k === "sort" && v === "relevant")) continue;
    if (k === "area" && Array.isArray(v)) {
      const n = v as number[];
      const pairs: string[] = [];
      for (let i = 0; i < n.length; i += 2) pairs.push(`${n[i].toFixed(5)},${n[i + 1].toFixed(5)}`);
      out.set(k, pairs.join(";"));
    } else if (k === "bbox" && Array.isArray(v)) {
      out.set(k, v.map((n) => Number(n).toFixed(4)).join(","));
    } else out.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return out.toString();
}

/** A short name for a saved search: "2 BHK, 3 BHK homes for sale near HSR Layout, up to ₹1 Cr, 2 more filters". */
export function describeSearch(p: SearchParams) {
  const bhk = p.bhk?.map((b) => (b === 0 ? "1 RK" : `${b === 4 ? "4+" : b} BHK`)).join(", ");
  const place = p.area ? "in a drawn area" : p.bbox ? "in a map area" : p.q ? `near ${p.q}` : "in Bengaluru";
  const budget = p.min && p.max ? `${inrShort(p.min)} to ${inrShort(p.max)}` : p.max ? `up to ${inrShort(p.max)}` : p.min ? `from ${inrShort(p.min)}` : "";
  const more = [p.furnishing?.length, p.tenants, p.kind?.length, p.cond, p.floor?.length, p.amen?.length, p.avail, p.pets, p.parking].filter(Boolean).length;
  const head = `${bhk ? `${bhk} homes` : "Homes"} ${p.type === "rent" ? "for rent" : "for sale"} ${place}`;
  return [head, budget, more && `${more} more ${more === 1 ? "filter" : "filters"}`].filter(Boolean).join(", ");
}

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(a)); // metres
}
