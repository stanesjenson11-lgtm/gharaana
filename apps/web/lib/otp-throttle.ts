// A text message costs money and can be used to pester a stranger, so sending one is capped per number as well as per
// connection (lib/auth.ts limits each connection): from many connections, one number still gets only a few codes.
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { sql } from "drizzle-orm";
import { db } from "./db.ts";

export const OTP_SENDS = 3;
export const OTP_WINDOW_MS = 10 * 60_000;
const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;

/** Counts a send to this number and says whether it may go: OTP_SENDS per window, counted in the rate-limit table. */
export async function allowOtpSend(phone: string, now = Date.now()) {
  const key = `otp:${phone}`;
  const windowStart = now - OTP_WINDOW_MS;
  // One statement, so two sends at the same moment can't both read the old count. last_request is when the window began.
  const result = await db.execute(sql`
    insert into rate_limit (id, key, count, last_request) values (${key}, ${key}, 1, ${now})
    on conflict (key) do update set
      count = case when rate_limit.last_request <= ${windowStart} then 1 else rate_limit.count + 1 end,
      last_request = case when rate_limit.last_request <= ${windowStart} then ${now} else rate_limit.last_request end
    returning count`);
  return Number((result.rows[0] as { count: number }).count) <= OTP_SENDS;
}

export const otpThrottle = () =>
  ({
    id: "otp-throttle",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/phone-number/send-otp",
          handler: createAuthMiddleware(async (ctx) => {
            const phone = String((ctx.body as { phoneNumber?: unknown } | undefined)?.phoneNumber ?? "");
            if (INDIAN_MOBILE.test(phone) && !(await allowOtpSend(phone))) {
              throw new APIError("TOO_MANY_REQUESTS", { message: "We've already sent several codes to this number. Wait ten minutes and try again." });
            }
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
