// Runs against the dev database.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "./db.ts";
import { runMaintenance } from "./jobs.ts";
import { latestNotifications } from "./notify.ts";
import { listings, rateLimit, session, uploads, user } from "./schema.ts";
import { SEED } from "./seed.ts";

after(() => pool.end());

test("maintenance: sends expiry warnings without duplicates, purges 30-day-old proofs, and cleans expired sessions", async () => {
  const t = `test-jobs-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const phone = `+919${Math.floor(100000000 + Math.random() * 900000000)}`;
  await db.insert(user).values({ id: t, name: "Jobs Owner", email: `${t}@test.invalid`, phoneNumber: phone });

  const homeExpiring = `${t}-expiring`;
  const homeOldProof = `${t}-oldproof`;
  const proofKey = `${t}-proof-key`;

  try {
    const s = SEED[0];

    // 1. Home expiring in 2 days
    await db.insert(listings).values({
      ...s,
      id: homeExpiring,
      ownerId: t,
      title: "Expiring Luxury Flat",
      status: "active",
      sample: false,
      addressPrivate: "private street",
      location: { x: s.lng, y: s.lat },
      availableFrom: null,
      expiresAt: new Date(Date.now() + 2 * 86_400_000), // in 2 days
    } as never);

    // 2. Home with proof reviewed 35 days ago
    await db.insert(uploads).values({
      key: proofKey,
      ownerId: t,
      kind: "proof",
      ext: "pdf",
    });

    await db.insert(listings).values({
      ...s,
      id: homeOldProof,
      ownerId: t,
      title: "Old Proof Villa",
      status: "active",
      sample: false,
      addressPrivate: "private street",
      location: { x: s.lng, y: s.lat },
      availableFrom: null,
      proofKey,
      reviewedAt: new Date(Date.now() - 35 * 86_400_000), // reviewed 35 days ago
    } as never);

    // 3. Stale session and old rate limit
    const oldSessionToken = `${t}-stale-token`;
    await db.insert(session).values({
      id: `${t}-session`,
      token: oldSessionToken,
      userId: t,
      expiresAt: new Date(Date.now() - 1000), // expired
    });

    await db.insert(rateLimit).values({
      id: `${t}-rate`,
      key: `${t}-rate-key`,
      count: 5,
      lastRequest: Date.now() - 7_200_000, // 2 hours ago
    });

    // Run maintenance pass 1
    const rep1 = await runMaintenance();
    assert.ok(rep1.expiryRemindersSent >= 1, "sent expiry warning");
    assert.ok(rep1.proofsDeleted >= 1, "deleted old proof");
    assert.ok(rep1.expiredSessionsDeleted >= 1, "deleted expired session");
    assert.ok(rep1.expiredRateLimitsDeleted >= 1, "deleted expired rate limit");

    // Check notification text and link
    const notes = await latestNotifications(t);
    const reminder = notes.find((n) => n.text.includes("Expiring Luxury Flat"));
    assert.ok(reminder, "found reminder notification");
    assert.equal(reminder?.href, "/account#homes");
    assert.match(reminder!.text, /expires in 2 days/);

    // Check proof is cleared on listing and upload is gone
    const [updatedListing] = await db.select().from(listings).where(eq(listings.id, homeOldProof));
    assert.equal(updatedListing.proofKey, null, "proofKey cleared after 30 days");

    const [remainingUpload] = await db.select().from(uploads).where(eq(uploads.key, proofKey));
    assert.equal(remainingUpload, undefined, "upload record purged");

    // Run maintenance pass 2 (deduplication check: no duplicate reminder should be sent)
    await runMaintenance();
    const notesAfter = await latestNotifications(t);
    const countReminders = notesAfter.filter((n) => n.text.includes("Expiring Luxury Flat")).length;
    assert.equal(countReminders, 1, "did not send duplicate reminder within 3-day window");
  } finally {
    await db.delete(user).where(inArray(user.id, [t]));
  }
});
