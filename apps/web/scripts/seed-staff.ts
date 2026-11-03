// Local development only: one account for each role, so every part of the console and the client site can be tried.
//   pnpm seed-staff
// Sign in at /sign-in with a number. The six-digit code is printed in the dev server's log ("[dev] OTP for +91...").
// Team accounts then set up an authenticator the first time they open the console. There are no passwords anywhere:
// a number plus a code (plus the authenticator for staff) is the whole sign-in.
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, pool } from "../lib/db.ts";
import { user } from "../lib/schema.ts";

if (process.env.NODE_ENV === "production" || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "")) {
  console.error("seed-staff only runs against a local development database.");
  process.exit(1);
}

const ACCOUNTS = [
  { role: "admin", label: "Super admin", name: "Meera Rao", phone: "+919999900001" },
  { role: "reviewer", label: "Reviewer", name: "Arjun Nair", phone: "+919999900002" },
  { role: "sales", label: "Sales", name: "Kabir Shah", phone: "+919999900003" },
  { role: "support", label: "Support", name: "Divya Menon", phone: "+919999900004" },
  { role: "member", label: "Client (no console)", name: "Ananya Iyer", phone: "+919999900005" },
] as const;

for (const a of ACCOUNTS) {
  const [existing] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.phoneNumber, a.phone));
  if (existing) await db.update(user).set({ role: a.role, banned: false, phoneNumberVerified: true }).where(eq(user.id, existing.id));
  else await db.insert(user).values({ id: randomBytes(16).toString("hex"), name: a.name, email: `${a.phone.slice(1)}@phone.directnest.invalid`, phoneNumber: a.phone, phoneNumberVerified: true, role: a.role });
  console.log(`${a.label.padEnd(20)} ${a.phone}  ${existing?.name ?? a.name}`);
}
await pool.end();
