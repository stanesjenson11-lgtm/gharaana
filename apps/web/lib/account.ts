// Privacy and user account operations: DPDP consent and right to erasure (account deletion).
import { desc, eq } from "drizzle-orm";
import { logAuditEvent } from "./audit.ts";
import { db } from "./db.ts";
import { deleteMediaFile } from "./media.ts";
import { consents, listings, uploads, user } from "./schema.ts";

/** Logs acceptance of platform terms and privacy notices under DPDP. */
export async function recordConsent(userId: string, policyVersion = "2026-10") {
  const [row] = await db
    .insert(consents)
    .values({ userId, policyVersion })
    .returning();
  await logAuditEvent("CONSENT_RECORDED", { userId, details: { policyVersion } });
  return row;
}

/** The latest recorded consent for a person. */
export async function latestConsent(userId: string) {
  const [row] = await db
    .select()
    .from(consents)
    .where(eq(consents.userId, userId))
    .orderBy(desc(consents.consentedAt))
    .limit(1);
  return row;
}

/**
 * Permanently deletes a user's account and all their personal data.
 * Deletes the user row, then purges their uploaded photos and documents from disk.
 * Postgres cascades the deletion across sessions, listings, chats, tickets, leads, and alerts.
 */
export async function deleteAccount(userId: string): Promise<{ ok: boolean; deletedListings: string[] }> {
  const userListings = await db.select({ id: listings.id }).from(listings).where(eq(listings.ownerId, userId));
  const listingIds = userListings.map((l) => l.id);

  const userUploads = await db.select({ key: uploads.key, kind: uploads.kind, ext: uploads.ext }).from(uploads).where(eq(uploads.ownerId, userId));
  await db.delete(user).where(eq(user.id, userId));
  // Files go only once the rows are gone, so a failed delete never leaves listings with missing photos.
  await Promise.all(userUploads.map((u) => deleteMediaFile(u.key, u.kind, u.ext)));

  // The user row is gone, so the id lives in targetId (userId would be a dangling foreign key).
  await logAuditEvent("ACCOUNT_DELETED", { targetId: userId, details: { deletedListingsCount: listingIds.length } });

  return { ok: true, deletedListings: listingIds };
}
