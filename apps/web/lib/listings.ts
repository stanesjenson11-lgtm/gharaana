// The one seam between pages and data. Public queries only ever return active listings and never the private address.
import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "./db.ts";
import { nearestMetro } from "./nearby.ts";
import { LOCALITIES } from "./places.ts";
import { listingPhotos, listings, shortlists } from "./schema.ts";
import type { Listing, SearchParams } from "./search.ts";

/** What a result tile and a map pin need, and nothing more. */
export type Card = Pick<
  Listing,
  "id" | "type" | "title" | "locality" | "area" | "lat" | "lng" | "price" | "maintenance" | "deposit" | "bhk" | "carpetSqft" | "furnishing" | "confirmedDaysAgo" | "sample" | "saleCondition"
> & { photos: string[]; metro: { name: string; metres: number }; visited: boolean; featured: boolean };

// Paid placement: featured homes come first in the default sort, always with a visible badge.
const isFeatured = sql<boolean>`coalesce(${listings.featuredUntil} > now(), false)`;
const daysSince = (col: typeof listings.confirmedAt | typeof listings.createdAt) => sql<number>`(current_date - (${col})::date)`.mapWith(Number);
const monthly = (type: SearchParams["type"]) => (type === "rent" ? sql`(${listings.price} + ${listings.maintenance})` : sql`${listings.price}`);

const cardColumns = {
  id: listings.id,
  type: listings.type,
  title: listings.title,
  locality: listings.locality,
  area: listings.area,
  location: listings.location,
  price: listings.price,
  maintenance: listings.maintenance,
  deposit: listings.deposit,
  bhk: listings.bhk,
  carpetSqft: listings.carpetSqft,
  furnishing: listings.furnishing,
  sample: listings.sample,
  saleCondition: listings.saleCondition,
  visited: sql<boolean>`(${listings.visitVerifiedAt} is not null)`,
  featured: isFeatured,
  confirmedDaysAgo: daysSince(listings.confirmedAt),
  // Written qualified on purpose: drizzle renders ${listings.id} as a bare "id", which would bind to p.id here.
  photos: sql<string[]>`coalesce((select array_agg(p.src order by p.position) from ${listingPhotos} p
    where p.listing_id = listings.id and p.position < 5), '{}')`,
};

type CardRow = Omit<Card, "lat" | "lng" | "metro"> & { location: { x: number; y: number } };
const toCard = ({ location, ...r }: CardRow): Card => ({ ...r, lng: location.x, lat: location.y, metro: nearestMetro(location.y, location.x) });

// Public = approved, not past its 30-day expiry, and its owner isn't banned. Expiry needs no job: an unconfirmed
// listing just stops matching. A ban hides listings without touching them, so unbanning restores everything.
export const live = sql`${listings.status} = 'active' and ${listings.expiresAt} > now()
  and not exists (select 1 from "user" b where b.id = listings.owner_id and b.banned)`;

// ponytail: planar distance in degrees (1° ≈ 111 km; longitude is ~3% short at Bengaluru's latitude). PostGIS when it matters.
const RADIUS_DEG = 3000 / 111_000;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function conditions(p: SearchParams): SQL {
  const c: (SQL | undefined)[] = [live, eq(listings.type, p.type)];
  const centre = p.q ? Object.entries(LOCALITIES).find(([n]) => n.toLowerCase() === p.q!.toLowerCase())?.[1] : undefined;

  if (p.area) {
    const pts = [];
    for (let i = 0; i < p.area.length; i += 2) pts.push(`(${p.area[i]},${p.area[i + 1]})`);
    c.push(sql`${listings.location} <@ ${`(${pts.join(",")})`}::polygon`);
  } else if (p.bbox) {
    const [w, s, e, n] = p.bbox;
    c.push(sql`${listings.location} <@ box(point(${w}, ${s}), point(${e}, ${n}))`);
  } else if (centre) {
    c.push(sql`${listings.location} <-> point(${centre[1]}, ${centre[0]}) < ${RADIUS_DEG}`);
  } else if (p.q) {
    c.push(sql`(${listings.title} || ' ' || ${listings.locality} || ' ' || ${listings.area}) ilike ${`%${escapeLike(p.q)}%`}`);
  }

  if (p.bhk?.length) {
    const exact = p.bhk.filter((b) => b < 4);
    c.push(or(exact.length ? inArray(listings.bhk, exact) : undefined, p.bhk.includes(4) ? gte(listings.bhk, 4) : undefined));
  }
  if (p.min !== undefined) c.push(sql`${monthly(p.type)} >= ${p.min}`);
  if (p.max) c.push(sql`${monthly(p.type)} <= ${p.max}`);
  if (p.furnishing?.length) c.push(inArray(listings.furnishing, p.furnishing));
  if (p.kind?.length) c.push(inArray(listings.kind, p.kind));
  if (p.tenants) c.push(sql`(cardinality(${listings.tenants}) = 0 or ${p.tenants} = any(${listings.tenants}))`);
  if (p.avail) c.push(sql`coalesce(${listings.availableFrom}, current_date) <= current_date + ${p.avail === "now" ? 0 : Number(p.avail)}::int`);
  if (p.cond) c.push(eq(listings.saleCondition, p.cond));
  if (p.floor?.length) {
    const band = { ground: sql`${listings.floor} = 0`, low: sql`${listings.floor} between 1 and 3`, mid: sql`${listings.floor} between 4 and 10`, high: sql`${listings.floor} > 10` };
    c.push(or(...p.floor.map((f) => band[f])));
  }
  // Must have every chosen amenity; the array literal goes as one parameter.
  if (p.amen?.length) c.push(sql`${listings.amenities} @> ${`{${p.amen.map((a) => `"${a}"`).join(",")}}`}::text[]`);
  if (p.pets) c.push(eq(listings.pets, true));
  if (p.parking) c.push(eq(listings.parking, "car"));
  return and(...c)!;
}

const ORDER: Record<SearchParams["sort"], (t: SearchParams["type"]) => SQL[]> = {
  relevant: () => [desc(isFeatured), desc(listings.confirmedAt), desc(listings.createdAt)],
  newest: () => [desc(listings.createdAt)],
  "price-asc": (t) => [asc(monthly(t))],
  "price-desc": (t) => [desc(monthly(t))],
};

export async function searchCards(p: SearchParams): Promise<Card[]> {
  // ponytail: first 200 matches; paginate when a search can realistically return more.
  const rows = await db
    .select(cardColumns)
    .from(listings)
    .where(conditions(p))
    .orderBy(...ORDER[p.sort](p.type))
    .limit(200);
  return rows.map(toCard);
}

/** Someone's shortlist, newest first. Homes that were sold or expired drop out. */
export async function shortlistedCards(userId: string): Promise<Card[]> {
  const rows = await db
    .select(cardColumns)
    .from(listings)
    .innerJoin(shortlists, and(eq(shortlists.listingId, listings.id), eq(shortlists.userId, userId)))
    .where(live)
    .orderBy(desc(shortlists.createdAt));
  return rows.map(toCard);
}

export async function getListing(id: string): Promise<Listing | undefined> {
  const row = await db.query.listings.findFirst({
    where: and(eq(listings.id, id), live),
    columns: { addressPrivate: false },
    extras: {
      confirmedDaysAgo: daysSince(listings.confirmedAt).as("confirmed_days_ago"),
      listedDaysAgo: daysSince(listings.createdAt).as("listed_days_ago"),
      availableInDays: sql<number>`greatest(coalesce(${listings.availableFrom}, current_date) - current_date, 0)`.mapWith(Number).as("available_in_days"),
    },
    with: {
      photos: { columns: { src: true, room: true, credit: true }, orderBy: asc(listingPhotos.position) },
      owner: { columns: { name: true } },
      project: { columns: { id: true, name: true, builder: true, rera: true, published: true } },
    },
  });
  if (!row) return undefined;
  const { location, owner, ownerVerified, photos, project, ...rest } = row;
  return {
    ...rest,
    lng: location.x,
    lat: location.y,
    tenants: rest.tenants as Listing["tenants"],
    photos: photos.map((ph) => ({ ...ph, credit: ph.credit ?? "" })),
    owner: { name: owner.name, verified: ownerVerified },
    project: project?.published ? { id: project.id, name: project.name, builder: project.builder, rera: project.rera } : null,
  };
}

/** Everything an owner sees on their dashboard, any status. */
export async function ownerListings(ownerId: string) {
  return db
    .select({
      id: listings.id,
      title: listings.title,
      status: listings.status,
      type: listings.type,
      price: listings.price,
      maintenance: listings.maintenance,
      confirmedDaysAgo: daysSince(listings.confirmedAt),
      expiresInDays: sql<number>`(${listings.expiresAt}::date - current_date)`.mapWith(Number),
      rejectReason: listings.rejectReason,
      cover: sql<string | null>`(select p.src from ${listingPhotos} p where p.listing_id = listings.id order by p.position limit 1)`,
    })
    .from(listings)
    .where(eq(listings.ownerId, ownerId))
    .orderBy(desc(listings.createdAt));
}

/** The review queue: oldest first, with everything a reviewer needs, including private fields. Admin pages only. */
export async function pendingListings() {
  return db.query.listings.findMany({
    where: eq(listings.status, "pending_review"),
    orderBy: asc(listings.createdAt),
    extras: { waitingDays: daysSince(listings.createdAt).as("waiting_days") },
    with: {
      photos: { columns: { src: true, room: true }, orderBy: asc(listingPhotos.position) },
      owner: {
        columns: { name: true, phoneNumber: true, createdAt: true },
        // Callback form: the relation is aliased in the generated SQL, so refer to the aliased column.
        extras: (owner) => ({ listingCount: sql<number>`(select count(*) from listings o where o.owner_id = ${owner.id})`.mapWith(Number).as("listing_count") }),
      },
    },
  });
}

/** Live homes our staff haven't visited yet, oldest first, with what a visitor needs. Admin pages only. */
export async function unvisitedListings() {
  return db.query.listings.findMany({
    where: and(live, isNull(listings.visitVerifiedAt), eq(listings.sample, false)),
    columns: { id: true, title: true, addressPrivate: true, createdAt: true },
    with: { owner: { columns: { name: true, phoneNumber: true } } },
    orderBy: asc(listings.createdAt),
    limit: 50,
  });
}

/** Whether any of these photo hashes is within `maxBits` of a photo on someone else's listing. */
export async function photosUsedElsewhere(hashes: bigint[], ownerId: string, maxBits: number) {
  if (!hashes.length) return false;
  const [row] = await db
    .select({ id: listingPhotos.id })
    .from(listingPhotos)
    .innerJoin(listings, eq(listingPhotos.listingId, listings.id))
    .where(
      and(
        ne(listings.ownerId, ownerId),
        // One array literal parameter; drizzle would expand a JS array into a list of separate parameters.
        sql`exists (select 1 from unnest(${`{${hashes.join(",")}}`}::bigint[]) h
              where bit_count((${listingPhotos.dhash} # h)::bit(64)) <= ${maxBits})`,
      ),
    )
    .limit(1);
  return !!row;
}

/** A builder project's live units, cheapest first. */
export async function projectCards(projectId: string): Promise<Card[]> {
  const rows = await db.select(cardColumns).from(listings).where(and(live, eq(listings.projectId, projectId))).orderBy(asc(listings.price));
  return rows.map(toCard);
}

/** Whether a home is among a search's results. Same conditions as the search itself. */
export async function listingMatches(p: SearchParams, listingId: string) {
  const [row] = await db.select({ id: listings.id }).from(listings).where(and(conditions(p), eq(listings.id, listingId))).limit(1);
  return !!row;
}

export async function listingIds() {
  const rows = await db.select({ id: listings.id }).from(listings).where(live);
  return rows.map((r) => r.id);
}

export async function similarListings(l: Listing, limit = 3): Promise<Card[]> {
  const rows = await db
    .select(cardColumns)
    .from(listings)
    .where(and(live, eq(listings.type, l.type), ne(listings.id, l.id), sql`abs(${listings.bhk} - ${l.bhk}) <= 1`))
    .orderBy(sql`${listings.location} <-> point(${l.lng}, ${l.lat})`)
    .limit(limit);
  return rows.map(toCard);
}
