// Nightly background maintenance tasks: listing expiry warnings, 30-day proof deletion, and stale session cleanup.
import { and, eq, gt, gte, isNotNull, like, lte, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { deleteMediaFile } from "./media.ts";
import { sendDueReminders } from "./docket.ts";
import { notify } from "./notify.ts";
import { listings, notifications, rateLimit, session, uploads } from "./schema.ts";

export type MaintenanceReport = {
  expiryRemindersSent: number;
  proofsDeleted: number;
  expiredSessionsDeleted: number;
  expiredRateLimitsDeleted: number;
  docketRemindersSent: number;
};

/**
 * Runs the nightly maintenance tasks.
 * 1. Alerts owners of active listings expiring within 3 days (once per 3-day window).
 * 2. Deletes ownership proof files and clears proofKey for listings reviewed >30 days ago.
 * 3. Cleans up expired auth sessions and old rate-limit buckets.
 * 4. Tells staff about docket items due within a day, or already late (once each).
 */
export async function runMaintenance(): Promise<MaintenanceReport> {
  const report: MaintenanceReport = {
    expiryRemindersSent: 0,
    proofsDeleted: 0,
    expiredSessionsDeleted: 0,
    expiredRateLimitsDeleted: 0,
    docketRemindersSent: 0,
  };

  // 1. Expiry warnings for active listings expiring in <= 3 days
  const expiring = await db
    .select({
      id: listings.id,
      title: listings.title,
      ownerId: listings.ownerId,
      expiresAt: listings.expiresAt,
    })
    .from(listings)
    .where(
      and(
        eq(listings.status, "active"),
        gt(listings.expiresAt, sql`now()`),
        lte(listings.expiresAt, sql`now() + interval '3 days'`),
      ),
    );

  for (const home of expiring) {
    const daysLeft = Math.max(1, Math.ceil((home.expiresAt.getTime() - Date.now()) / 86_400_000));
    const recent = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, home.ownerId),
          like(notifications.text, `%${home.title.slice(0, 30)}%expires%`),
          gte(notifications.createdAt, sql`now() - interval '3 days'`),
        ),
      )
      .limit(1);

    if (recent.length === 0) {
      const msg = `Your listing "${home.title}" expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}. Confirm it's still available to keep it live.`;
      await notify(home.ownerId, msg, "/account#homes");
      report.expiryRemindersSent++;
    }
  }

  // 2. Delete ownership proof documents for listings reviewed > 30 days ago
  const oldProofs = await db
    .select({
      id: listings.id,
      proofKey: listings.proofKey,
    })
    .from(listings)
    .where(
      and(
        isNotNull(listings.reviewedAt),
        isNotNull(listings.proofKey),
        lte(listings.reviewedAt, sql`now() - interval '30 days'`),
      ),
    );

  for (const row of oldProofs) {
    if (!row.proofKey) continue;
    const [upload] = await db
      .select({ ext: uploads.ext })
      .from(uploads)
      .where(eq(uploads.key, row.proofKey))
      .limit(1);

    await deleteMediaFile(row.proofKey, "proof", upload?.ext ?? "pdf");
    await db.delete(uploads).where(eq(uploads.key, row.proofKey));
    await db.update(listings).set({ proofKey: null }).where(eq(listings.id, row.id));
    report.proofsDeleted++;
  }

  // 3. Purge expired auth sessions & stale rate limits
  const sessions = await db.delete(session).where(lte(session.expiresAt, sql`now()`)).returning({ id: session.id });
  report.expiredSessionsDeleted = sessions.length;

  const oneHourAgo = Date.now() - 3_600_000;
  const rates = await db.delete(rateLimit).where(lte(rateLimit.lastRequest, oneHourAgo)).returning({ id: rateLimit.id });
  report.expiredRateLimitsDeleted = rates.length;

  // 4. Docket reminders
  report.docketRemindersSent = await sendDueReminders();

  return report;
}
