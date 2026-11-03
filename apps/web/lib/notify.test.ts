// Runs against the dev database. WhatsApp goes to a stubbed fetch, never to Meta.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { db, pool } from "./db.ts";
import { answerLead, createLead, leadSchema, leadsForOwner } from "./leads.ts";
import { latestNotifications, markAllRead, notify, unreadCount } from "./notify.ts";
import { saveSearch, savedSearchMatches } from "./saved.ts";
import { listings, user } from "./schema.ts";
import { SEED } from "./seed.ts";

after(() => pool.end());

test("alerts: saved-search matches, requests and answers reach the right person, and reading clears them", async () => {
  const t = `test-notify-${Date.now()}`;
  const [owner, buyer, other] = [`${t}-owner`, `${t}-buyer`, `${t}-other`];
  await db.insert(user).values([
    { id: owner, name: "Meena", email: `${owner}@test.invalid`, phoneNumber: `+9195${String(Date.now()).slice(-8)}` },
    { id: buyer, name: "Arjun", email: `${buyer}@test.invalid` },
    { id: other, name: "Other", email: `${other}@test.invalid` },
  ]);
  try {
    const s = SEED[0]; // a 2 BHK in Koramangala
    const home = `${t}-home`;
    await db.insert(listings).values({ ...s, id: home, ownerId: owner, status: "active", sample: false, addressPrivate: "x", location: { x: s.lng, y: s.lat }, availableFrom: null } as never);

    await saveSearch(buyer, "q=Koramangala&bhk=2,3");
    await saveSearch(other, "q=Koramangala&bhk=4");
    await saveSearch(owner, "q=Koramangala");
    assert.deepEqual(await savedSearchMatches(home, owner), [{ userId: buyer, label: "2 BHK, 3 BHK homes for sale near Koramangala" }]);

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await createLead(buyer, leadSchema.parse({ listingId: home, kind: "visit", preferredDate: tomorrow, preferredSlot: "evening" }));
    const [toOwner] = await latestNotifications(owner);
    assert.match(toOwner.text, /^Arjun wants to visit .* on .*Evening/);
    assert.equal(toOwner.href, "/account#requests");

    const [lead] = await leadsForOwner(owner);
    await answerLead(owner, lead.id, "confirmed");
    const [toBuyer] = await latestNotifications(buyer);
    assert.match(toBuyer.text, /^The owner confirmed your visit to /);
    assert.equal(await unreadCount(buyer), 1);
    await markAllRead(buyer);
    assert.equal(await unreadCount(buyer), 0);

    // With WhatsApp configured, the same alert goes out as a template message to the person's number.
    Object.assign(process.env, { WHATSAPP_TOKEN: "test-token", WHATSAPP_PHONE_ID: "123", WHATSAPP_TEMPLATE: "directnest_alert" });
    const realFetch = globalThis.fetch;
    const sent: { url: string; body: { to: string; template: { name: string; components: { parameters: { text: string }[] }[] } } }[] = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return Response.json({ messages: [{ id: "wamid.1" }] });
    }) as unknown as typeof fetch;
    try {
      await notify([owner, buyer], "Test alert", "/account");
    } finally {
      globalThis.fetch = realFetch;
      for (const k of ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_TEMPLATE"]) delete process.env[k];
    }
    assert.equal(sent.length, 1, "only people with a phone number");
    assert.equal(sent[0].url, "https://graph.facebook.com/v21.0/123/messages");
    assert.deepEqual([sent[0].body.to.slice(0, 4), sent[0].body.template.name, sent[0].body.template.components[0].parameters[0].text], ["9195", "directnest_alert", "Test alert"]);
  } finally {
    await db.delete(user).where(inArray(user.id, [owner, buyer, other]));
  }
});
