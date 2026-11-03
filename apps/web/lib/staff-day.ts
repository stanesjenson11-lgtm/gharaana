// The staff sign-in rhythm, in India time:
//   - the first sign-in of a day needs a text-message code to the staff member's mobile number, then an authenticator code;
//   - later sign-ins the same day (after signing out) need only the authenticator code;
//   - the console stays open until the day ends, and the next day starts again with the text message.
// "Today's text message was done in this browser" is a signed cookie that dies at the end of the day. It proves nothing
// by itself: it only lets the sign-in page ask for the authenticator code alone, which is still a second factor.
import { createHmac, timingSafeEqual } from "node:crypto";
import { istDate, todayRange } from "./docket-meta.ts";

export const DAY_COOKIE = "dn_staff_day";

// Test servers only (SKIP_PHONE_OTP=1, never on the real one): no text-message codes. A signed-in person counts as having
// confirmed their number, and staff skip the morning code. Staff still pass the authenticator.
export const skipPhoneOtp = () => process.env.SKIP_PHONE_OTP === "1";

// ponytail: the day ends at midnight in India. A later hour (say 4 am) would suit a team that works past midnight: change it here.
export const endOfDay = (now = new Date()) => todayRange(now)[1];
export const secondsLeftToday = (now = new Date()) => Math.max(1, Math.ceil((endOfDay(now).getTime() - now.getTime()) / 1000));

/** Whether a session began today. A staff session from an earlier day is over: the next sign-in starts with a text message. */
export const startedToday = (began: Date, now = new Date()) => istDate(began) === istDate(now);

const sign = (secret: string, userId: string, day: string) => createHmac("sha256", secret).update(`day:${userId}.${day}`).digest("base64url");

/** "This browser got a text-message code for this person today." */
export function dayToken(secret: string, userId: string, now = new Date()) {
  const day = istDate(now);
  return `${userId}.${day}.${sign(secret, userId, day)}`;
}

/** Whose text-message sign-in today's cookie records, or null when it is missing, forged or from another day. */
export function dayUser(secret: string, token: string | undefined, now = new Date()): string | null {
  const last = (token ?? "").lastIndexOf(".");
  const mid = (token ?? "").lastIndexOf(".", last - 1);
  if (!token || mid < 1) return null;
  const [userId, day, sig] = [token.slice(0, mid), token.slice(mid + 1, last), token.slice(last + 1)];
  if (day !== istDate(now)) return null;
  const want = Buffer.from(sign(secret, userId, day));
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want) ? userId : null;
}

/** An authenticator code (RFC 6238: SHA-1, 30-second steps, 6 digits), allowing a step either side for a phone's clock drift. */
export function totpValid(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  const key = Buffer.from(secret, "utf8"); // the app is given the base32 of these bytes
  const step = Math.floor(now / 30_000);
  let ok = false;
  for (const s of [step - 1, step, step + 1]) {
    if (s < 0) continue;
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(s));
    const h = createHmac("sha1", key).update(counter).digest();
    const o = h[19] & 15;
    const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
    // Every step is compared, so the time taken doesn't say which one nearly matched.
    ok = timingSafeEqual(Buffer.from(String(n % 1e6).padStart(6, "0")), Buffer.from(code)) || ok;
  }
  return ok;
}
