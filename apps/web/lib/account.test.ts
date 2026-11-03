// Runs against the dev database.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import { deleteAccount, latestConsent, recordConsent } from "./account.ts";
import { db, pool } from "./db.ts";
import { auditLogs, consents, listings, notifications, savedSearches, uploads, user } from "./schema.ts";
import { SEED } from "./seed.ts";

after(() => pool.end());

test("DPDP: consent is recorded with timestamp and version, and account deletion cascades cleanly", async () => {
  const t = `test-dpdp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const phone = `+919${Math.floor(100000000 + Math.random() * 900000000)}`;
  await db.insert(user).values({ id: t, name: "Test DPDP", email: `${t}@test.invalid`, phoneNumber: phone });

  try {
    // 1. Consent recording
    await recordConsent(t, "2026-10-v1");
    const consent = await latestConsent(t);
    assert.equal(consent?.policyVersion, "2026-10-v1");
    assert.ok(consent?.consentedAt);

    // 2. Attach data across tables
    const s = SEED[0];
    const home = `${t}-home`;
    await db.insert(listings).values({
      ...s,
      id: home,
      ownerId: t,
      status: "active",
      sample: false,
      addressPrivate: "private street",
      location: { x: s.lng, y: s.lat },
      availableFrom: null,
    } as never);

    await db.insert(uploads).values([
      { key: `${t}-upload-photo`, ownerId: t, kind: "photo", ext: "webp" },
      { key: `${t}-upload-proof`, ownerId: t, kind: "proof", ext: "pdf" },
    ]);

    await db.insert(savedSearches).values({ userId: t, query: "q=DpdpTestArea", label: "DpdpTestArea" });
    await db.insert(notifications).values({ userId: t, text: "Welcome", href: "/account" });

    // 3. Delete account
    const res = await deleteAccount(t);
    assert.equal(res.ok, true);
    assert.deepEqual(res.deletedListings, [home]);

    // 4. Verify cascade deletion across tables
    const [foundUser] = await db.select().from(user).where(eq(user.id, t));
    assert.equal(foundUser, undefined, "user is deleted");

    const [foundListing] = await db.select().from(listings).where(eq(listings.id, home));
    assert.equal(foundListing, undefined, "listings are cascade deleted");

    const userUploads = await db.select().from(uploads).where(eq(uploads.ownerId, t));
    assert.equal(userUploads.length, 0, "uploads are cascade deleted");

    const userSearches = await db.select().from(savedSearches).where(eq(savedSearches.userId, t));
    assert.equal(userSearches.length, 0, "saved searches are cascade deleted");

    const userNotes = await db.select().from(notifications).where(eq(notifications.userId, t));
    assert.equal(userNotes.length, 0, "notifications are cascade deleted");

    const userConsents = await db.select().from(consents).where(eq(consents.userId, t));
    assert.equal(userConsents.length, 0, "consents are cascade deleted");

    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "ACCOUNT_DELETED"), eq(auditLogs.targetId, t)));
    assert.ok(log, "the audit log still says whose account was deleted");
  } finally {
    await db.delete(auditLogs).where(eq(auditLogs.targetId, t));
    await db.delete(user).where(inArray(user.id, [t]));
  }
});
