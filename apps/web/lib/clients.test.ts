// Runs against the dev database, like admin.test.ts.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { addNote, clientDetail, listClients } from "./clients.ts";
import { db, pool } from "./db.ts";
import { leads, listings, tickets, user } from "./schema.ts";
import { SEED } from "./seed.ts";

after(() => pool.end());

test("the clients list finds people, counts what they did, filters, keeps staff out, and holds private notes", async () => {
  const t = `test-clients-${Date.now()}`;
  const [owner, asker, staff] = [`${t}-o`, `${t}-a`, `${t}-s`];
  // Random, not timestamp-based: test files run in parallel and phone numbers are unique.
  const rand = () => `+919${Math.floor(100000000 + Math.random() * 900000000)}`;
  const [ownerPhone, askerPhone] = [rand(), rand()];
  await db.insert(user).values([
    { id: owner, name: `Olu ${t}`, email: `${owner}@test.invalid`, phoneNumber: ownerPhone },
    { id: asker, name: `Asha ${t}`, email: `${asker}@test.invalid`, phoneNumber: askerPhone },
    { id: staff, name: `Staffer ${t}`, email: `${staff}@test.invalid`, role: "support" },
  ]);
  try {
    const s = SEED[0];
    await db.insert(listings).values({ ...s, id: `${t}-home`, ownerId: owner, status: "active", sample: false, addressPrivate: "x", location: { x: s.lng, y: s.lat }, availableFrom: null } as never);
    await db.insert(leads).values({ listingId: `${t}-home`, requesterId: asker, kind: "visit" });
    await db.insert(tickets).values({ userId: asker, topic: "other", status: "open" });

    const ids = async (f: Parameters<typeof listClients>[0]) => (await listClients(f)).rows.map((r) => r.id).sort();
    assert.deepEqual(await ids({ q: t }), [owner, asker].sort(), "found by name, and staff are not clients");
    const all = (await listClients({ q: t })).rows;
    assert.equal(all.find((r) => r.id === owner)?.homes, 1);
    assert.deepEqual([all.find((r) => r.id === asker)?.requests, all.find((r) => r.id === asker)?.openTickets], [1, 1]);

    assert.deepEqual(await ids({ q: t, filter: "owners" }), [owner]);
    assert.deepEqual(await ids({ q: t, filter: "requests" }), [asker]);
    assert.deepEqual(await ids({ q: t, filter: "open" }), [asker]);
    assert.deepEqual(await ids({ q: t, filter: "suspended" }), []);
    assert.deepEqual(await ids({ q: askerPhone.slice(-8) }), [asker], "found by part of the number");
    assert.deepEqual(await ids({ q: `Asha ${t} 7` }), [], "a name with a digit is still a name search");

    assert.equal(await addNote(staff, asker, "   "), "empty");
    assert.equal(await addNote(staff, asker, "x".repeat(2001)), "long");
    assert.equal(await addNote(staff, "nobody", "hello"), "gone");
    assert.equal(await addNote(staff, asker, "Called; wants a Saturday visit."), "ok");

    const d = await clientDetail(asker);
    assert.equal(d?.notes[0].body, "Called; wants a Saturday visit.");
    assert.equal(d?.notes[0].author, `Staffer ${t}`);
    assert.deepEqual([d?.support.length, d?.requests.length, d?.requests[0].listingId], [1, 1, `${t}-home`]);
    assert.equal((await clientDetail(owner))?.homes[0].id, `${t}-home`);
    assert.equal(await clientDetail("nobody"), undefined);
  } finally {
    await db.delete(user).where(inArray(user.id, [owner, asker, staff]));
  }
});
