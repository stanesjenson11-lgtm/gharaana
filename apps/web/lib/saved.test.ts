// Runs against the dev database, like listings.test.ts.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { db, pool } from "./db.ts";
import { shortlistedCards } from "./listings.ts";
import { deleteSavedSearch, MAX_SAVED_SEARCHES, saveSearch, savedSearchList, setShortlisted, shortlistIds } from "./saved.ts";
import { user } from "./schema.ts";
import { SEED } from "./seed.ts";

after(() => pool.end());

test("shortlist: add, ignore unknown homes, remove", async () => {
  const me = `test-shortlist-${Date.now()}`;
  await db.insert(user).values({ id: me, name: "T", email: `${me}@test.invalid` });
  try {
    await setShortlisted(me, SEED[0].id, true);
    await setShortlisted(me, SEED[0].id, true); // twice is still once
    await setShortlisted(me, "no-such-home", true);
    assert.deepEqual(await shortlistIds(me), [SEED[0].id]);
    assert.deepEqual((await shortlistedCards(me)).map((c) => c.id), [SEED[0].id]);
    await setShortlisted(me, SEED[0].id, false);
    assert.deepEqual(await shortlistIds(me), []);
  } finally {
    await db.delete(user).where(inArray(user.id, [me]));
  }
});

test("saved searches: stored normalised, named, de-duplicated, capped and private", async () => {
  const [me, other] = [`test-saved-${Date.now()}`, `test-saved-other-${Date.now()}`];
  await db.insert(user).values([
    { id: me, name: "T", email: `${me}@test.invalid` },
    { id: other, name: "O", email: `${other}@test.invalid` },
  ]);
  try {
    await saveSearch(me, "bhk=2,3&q=HSR+Layout&max=10000000&sort=relevant&junk=1&amen=Gym");
    await saveSearch(me, "q=HSR+Layout&bhk=2,3&amen=Gym&max=10000000"); // same search, other order
    const [s, ...rest] = await savedSearchList(me);
    assert.equal(rest.length, 0);
    assert.equal(s.query, "q=HSR+Layout&bhk=2%2C3&max=10000000&amen=Gym");
    assert.equal(s.label, "2 BHK, 3 BHK homes for sale near HSR Layout, up to ₹1 Cr, 1 more filter");

    await deleteSavedSearch(other, s.id);
    assert.equal((await savedSearchList(me)).length, 1, "others can't delete it");

    for (let i = 1; i < MAX_SAVED_SEARCHES; i++) await saveSearch(me, `max=${i * 1_000_000}`);
    assert.deepEqual(await saveSearch(me, "bhk=1"), { ok: false, reason: "full" });
  } finally {
    await db.delete(user).where(inArray(user.id, [me, other]));
  }
});
