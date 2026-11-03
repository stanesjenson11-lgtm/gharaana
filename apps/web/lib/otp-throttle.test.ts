// Runs against the dev database, like admin.test.ts.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { like } from "drizzle-orm";
import { db, pool } from "./db.ts";
import { allowOtpSend, OTP_SENDS, OTP_WINDOW_MS } from "./otp-throttle.ts";
import { rateLimit } from "./schema.ts";

after(async () => {
  await db.delete(rateLimit).where(like(rateLimit.key, "otp:+91000%"));
  await pool.end();
});

test("a number gets a few codes per ten minutes, however many connections ask, and each number has its own count", async () => {
  const [a, b] = [`+91000${Date.now()}1`, `+91000${Date.now()}2`];
  const t0 = Date.now();
  for (let i = 1; i <= OTP_SENDS; i++) assert.ok(await allowOtpSend(a, t0 + i), `send ${i}`);
  assert.ok(!(await allowOtpSend(a, t0 + 10)), "the next is refused");
  assert.ok(!(await allowOtpSend(a, t0 + OTP_WINDOW_MS - 1)), "and still refused near the end of the window");
  assert.ok(await allowOtpSend(b, t0 + 11), "another number is unaffected");

  assert.ok(await allowOtpSend(a, t0 + OTP_WINDOW_MS + 1), "a new window starts afresh");
  const burst = await Promise.all(Array.from({ length: 8 }, () => allowOtpSend(`+91000${t0}3`, t0 + 2 * OTP_WINDOW_MS)));
  assert.equal(burst.filter(Boolean).length, OTP_SENDS, "eight at once: only the allowed few go");
});
