// For a staff member who lost their phone and backup codes: removes their authenticator so they enrol a new one.
//   pnpm reset-admin-2fa +919876543210
import { eq } from "drizzle-orm";
import { db, pool } from "../lib/db.ts";
import { logAuditEvent } from "../lib/audit.ts";
import { twoFactor, user } from "../lib/schema.ts";

const phone = process.argv[2];
if (!phone || !/^\+91[6-9]\d{9}$/.test(phone)) {
  console.error("Usage: pnpm reset-admin-2fa +91XXXXXXXXXX");
  process.exit(1);
}
const [u] = await db.select({ id: user.id }).from(user).where(eq(user.phoneNumber, phone));
if (!u) console.log(`No account with ${phone}.`);
else {
  await db.transaction(async (tx) => {
    await tx.delete(twoFactor).where(eq(twoFactor.userId, u.id));
    await tx.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, u.id));
  });
  await logAuditEvent("ADMIN_MFA_RESET", { userId: u.id, targetId: u.id, details: { by: "server script" } });
  console.log(`${phone} must set up an authenticator again at /admin/security.`);
}
await pool.end();
