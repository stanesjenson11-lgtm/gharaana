// Runs against the dev database, like listings.test.ts.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { db, pool } from "./db.ts";
import { user } from "./schema.ts";
import { SEED } from "./seed.ts";
import { closeTicket, openTicket, replyToTicket, supportQueue, ticketThread, TICKETS_PER_DAY } from "./support.ts";

after(() => pool.end());

test("tickets: private to their person and staff, status follows who wrote last, capped per day", async () => {
  const t = `test-ticket-${Date.now()}`;
  const [me, other, staff] = [`${t}-me`, `${t}-other`, `${t}-staff`];
  await db.insert(user).values([me, other, staff].map((id) => ({ id, name: id.split("-").at(-1)!, email: `${id}@test.invalid` })));
  const [asMe, asOther, asStaff] = [{ id: me, staff: false }, { id: other, staff: false }, { id: staff, staff: true }];
  try {
    assert.deepEqual(await openTicket(me, "report", "too short"), { ok: false, reason: "short" });
    const opened = await openTicket(me, "report", "This listing is posted by a broker, he asked me for commission.", SEED[0].id);
    assert.ok(opened.ok);
    const id = opened.ok ? opened.id : 0;
    assert.equal((await openTicket(me, "other", "A ticket about a listing that doesn't exist.", "no-such-home")).ok, true, "a bad listing link is just dropped");

    assert.equal(await ticketThread(id, asOther), undefined);
    assert.deepEqual(await replyToTicket(id, asOther, "Let me in on this one please."), { ok: false, reason: "gone" });
    const mine = await ticketThread(id, asMe);
    assert.deepEqual([mine?.status, mine?.listingId, mine?.messages.length], ["open", SEED[0].id, 1]);
    assert.ok((await supportQueue("open")).some((q) => q.id === id));

    await replyToTicket(id, asStaff, "Thanks, we've hidden the listing while we check.");
    assert.equal((await ticketThread(id, asStaff))?.status, "answered");
    await closeTicket(id);
    await replyToTicket(id, asMe, "He listed it again under another name.");
    const back = await ticketThread(id, asMe);
    assert.deepEqual([back?.status, back?.messages.map((m) => m.fromStaff)], ["open", [false, true, false]], "a reply reopens it");

    for (let i = 2; i < TICKETS_PER_DAY; i++) await openTicket(me, "other", `Filling up today's tickets, number ${i}.`);
    assert.deepEqual(await openTicket(me, "other", "One more than allowed today."), { ok: false, reason: "limit" });
  } finally {
    await db.delete(user).where(inArray(user.id, [me, other, staff]));
  }
});
