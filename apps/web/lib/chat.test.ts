// Runs against the dev database, like listings.test.ts.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { conversationFor, inbox, messagesAfter, sendMessage, startConversation, unreadTotal } from "./chat.ts";
import { db, pool } from "./db.ts";
import { listings, user } from "./schema.ts";
import { SEED } from "./seed.ts";

after(() => pool.end());

test("chat: one thread per buyer and home, private to its two people, with unread counts", async () => {
  const t = `test-chat-${Date.now()}`;
  const [owner, buyer, stranger] = [`${t}-owner`, `${t}-buyer`, `${t}-stranger`];
  await db.insert(user).values([owner, buyer, stranger].map((id, i) => ({ id, name: ["Owner", "Buyer", "Stranger"][i], email: `${id}@test.invalid` })));
  try {
    const s = SEED[0];
    await db.insert(listings).values({ ...s, id: `${t}-home`, ownerId: owner, status: "active", sample: false, addressPrivate: "x", location: { x: s.lng, y: s.lat }, availableFrom: null } as never);

    const first = await startConversation(buyer, `${t}-home`);
    assert.ok(first.ok);
    assert.deepEqual(await startConversation(buyer, `${t}-home`), first, "the same thread again");
    assert.deepEqual(await startConversation(owner, `${t}-home`), { ok: false, reason: "own" });
    assert.deepEqual(await startConversation(buyer, s.id), { ok: false, reason: "sample" });
    const id = first.ok ? first.id : 0;

    assert.deepEqual(await inbox(owner), [], "owners don't see a thread until the buyer writes");
    assert.deepEqual(await sendMessage(id, buyer, "   "), { ok: false, reason: "empty" });
    assert.deepEqual(await sendMessage(id, buyer, "Is the price negotiable?"), { ok: true });
    assert.deepEqual(await sendMessage(id, stranger, "hi"), { ok: false, reason: "gone" });
    assert.equal(await messagesAfter(id, stranger), null);
    assert.equal(await conversationFor(id, stranger), undefined);

    assert.equal(await unreadTotal(owner), 1);
    const [row] = await inbox(owner);
    assert.deepEqual([row.otherName, row.last, row.unread, row.mineIsBuyer], ["Buyer", "Is the price negotiable?", 1, false]);

    const seen = await messagesAfter(id, owner);
    assert.deepEqual(seen?.map((m) => [m.body, m.mine]), [["Is the price negotiable?", false]]);
    assert.equal(await unreadTotal(owner), 0, "opening the thread reads it");

    await sendMessage(id, owner, "A little, yes.");
    assert.equal(await unreadTotal(buyer), 1);
    const newer = await messagesAfter(id, buyer, seen![0].id);
    assert.deepEqual(newer?.map((m) => [m.body, m.mine]), [["A little, yes.", false]]);
    assert.equal((await conversationFor(id, buyer))?.otherName, "Owner");
  } finally {
    await db.delete(user).where(inArray(user.id, [owner, buyer, stranger]));
  }
});
