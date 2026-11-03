// Gives someone access to the review queue. They must have signed in once.
//   pnpm make-admin +919876543210
import { eq } from "drizzle-orm";
import { db, pool } from "../lib/db.ts";
import { user } from "../lib/schema.ts";

const phone = process.argv[2];
if (!phone || !/^\+91[6-9]\d{9}$/.test(phone)) {
  console.error("Usage: pnpm make-admin +91XXXXXXXXXX");
  process.exit(1);
}
const rows = await db.update(user).set({ role: "admin" }).where(eq(user.phoneNumber, phone)).returning({ id: user.id });
console.log(rows.length ? `${phone} can now use /admin.` : `No account with ${phone}. Sign in with it once first.`);
await pool.end();
