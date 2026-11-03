// Runs against the dev database, like listings.test.ts.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { findUsers, setBanned } from "./admin.ts";
import { db, pool } from "./db.ts";
import { getListing, searchCards } from "./listings.ts";
import { parseSearch } from "./parse-search.ts";
import { listings, session, user } from "./schema.ts";
import { SEED } from "./seed.ts";

after(() => pool.end());

test("a ban signs the person out and hides their homes until it's lifted; admins can't be banned", async () => {
  const t = `test-ban-${Date.now()}`;
  const [admin, other, broker] = [`${t}-admin`, `${t}-admin2`, `${t}-broker`];
  const phone = `+9196${String(Date.now()).slice(-8)}`;
  await db.insert(user).values([
    { id: admin, name: "Admin", email: `${admin}@test.invalid`, role: "admin" },
    { id: other, name: "Other admin", email: `${other}@test.invalid`, role: "admin" },
    { id: broker, name: "Suspicious", email: `${broker}@test.invalid`, phoneNumber: phone },
  ]);
  try {
    const s = SEED[0];
    await db.insert(listings).values({ ...s, id: `${t}-home`, ownerId: broker, status: "active", sample: false, addressPrivate: "x", location: { x: s.lng, y: s.lat }, availableFrom: null } as never);
    await db.insert(session).values({ id: `${t}-s`, token: `${t}-token`, userId: broker, expiresAt: new Date(Date.now() + 86_400_000), updatedAt: new Date() });
    const visible = async () => (await searchCards(parseSearch({ bbox: `${s.lng - 0.01},${s.lat - 0.01},${s.lng + 0.01},${s.lat + 0.01}` }))).some((c) => c.id === `${t}-home`);

    assert.deepEqual((await findUsers(phone.slice(-6))).map((u) => u.id), [broker], "found by part of the phone number");
    assert.ok(await visible());

    assert.equal(await setBanned(admin, broker, true), true);
    assert.equal(await visible(), false, "hidden from search");
    assert.equal(await getListing(`${t}-home`), undefined, "and from its own page");
    assert.equal((await db.select().from(session).where(eq(session.userId, broker))).length, 0, "signed out");

    assert.equal(await setBanned(admin, broker, false), true);
    assert.ok(await visible(), "unbanning restores the listing");

    assert.equal(await setBanned(admin, other, true), false, "admins can't be banned here");
    assert.equal(await setBanned(admin, admin, true), false);
  } finally {
    await db.delete(user).where(inArray(user.id, [admin, other, broker]));
  }
});
