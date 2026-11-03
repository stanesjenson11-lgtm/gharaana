// For a staff member who lost their phone and backup codes (or whose authenticator was set up under another
// BETTER_AUTH_SECRET, which shows as "invalid tag"): removes their authenticator so they enrol a new one.
//   pnpm reset-admin-2fa +919876543210
//   pnpm reset-admin-2fa name@example.com
import { eq } from "drizzle-orm";
import { db, pool } from "../lib/db.ts";
import { logAuditEvent } from "../lib/audit.ts";
import { twoFactor, user } from "../lib/schema.ts";

const who = (process.argv[2] ?? "").trim();
const byEmail = /^[^\s@]+@[^\s@]+$/.test(who);
if (!byEmail && !/^\+91[6-9]\d{9}$/.test(who)) {
  console.error("Usage: pnpm reset-admin-2fa +91XXXXXXXXXX | name@example.com");
  process.exit(1);
}
const [u] = await db.select({ id: user.id }).from(user).where(byEmail ? eq(user.email, who.toLowerCase()) : eq(user.phoneNumber, who));
if (!u) console.log(`No account with ${who}.`);
else {
  await db.transaction(async (tx) => {
    await tx.delete(twoFactor).where(eq(twoFactor.userId, u.id));
    await tx.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, u.id));
  });
  await logAuditEvent("ADMIN_MFA_RESET", { userId: u.id, targetId: u.id, details: { by: "server script" } });
  console.log(`${who} must set up an authenticator again at /admin/security.`);
}
await pool.end();
