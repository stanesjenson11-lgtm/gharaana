// Loads the sample listings into Postgres, with one owner account per sample owner.
// Safe to re-run: it only replaces rows it created (sample owners cascade to their listings and photos).
//   pnpm db:seed
import { like } from "drizzle-orm";
import { db, pool } from "../lib/db.ts";
import { listingPhotos, listings, user } from "../lib/schema.ts";
import { SEED } from "../lib/seed.ts";

const DAY = 86_400_000;
const SAMPLE_EMAIL = "@sample.directnest.invalid";
const ago = (days: number) => new Date(Date.now() - days * DAY);

await db.transaction(async (tx) => {
  await tx.delete(user).where(like(user.email, `%${SAMPLE_EMAIL}`));

  const owners = new Map<string, string>();
  for (const name of new Set(SEED.map((l) => l.owner.name))) owners.set(name, `sample-owner-${owners.size + 1}`);
  await tx.insert(user).values([...owners].map(([name, id]) => ({ id, name, email: `${id}${SAMPLE_EMAIL}` })));

  await tx.insert(listings).values(
    SEED.map((l) => ({
      id: l.id,
      ownerId: owners.get(l.owner.name)!,
      status: "active" as const,
      sample: true,
      type: l.type,
      kind: l.kind,
      bhk: l.bhk,
      title: l.title,
      locality: l.locality,
      area: l.area,
      addressPrivate: `${l.area}, ${l.locality}, Bengaluru (sample listing, no real address)`,
      location: { x: l.lng, y: l.lat },
      price: l.price,
      maintenance: l.maintenance,
      deposit: l.deposit,
      carpetSqft: l.carpetSqft,
      floor: l.floor,
      totalFloors: l.totalFloors,
      furnishing: l.furnishing,
      facing: l.facing,
      ageYears: l.ageYears,
      availableFrom: l.availableInDays ? ago(-l.availableInDays).toISOString().slice(0, 10) : null,
      tenants: l.tenants,
      pets: l.pets,
      nonVeg: l.nonVeg,
      parking: l.parking,
      bathrooms: l.bathrooms,
      balconies: l.balconies,
      amenities: l.amenities,
      description: l.description,
      saleCondition: l.saleCondition ?? null,
      visitVerifiedAt: l.visitVerifiedAt ?? null,
      ownerVerified: l.owner.verified,
      createdAt: ago(l.listedDaysAgo),
      confirmedAt: ago(l.confirmedDaysAgo),
      expiresAt: ago(l.confirmedDaysAgo - 30),
    })),
  );

  await tx.insert(listingPhotos).values(
    SEED.flatMap((l) => l.photos.map((p, position) => ({ listingId: l.id, position, src: p.src, room: p.room, credit: p.credit }))),
  );
});

console.log(`Seeded ${SEED.length} sample listings.`);
await pool.end();
