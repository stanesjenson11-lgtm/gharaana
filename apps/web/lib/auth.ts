import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber, twoFactor } from "better-auth/plugins";
import { db } from "./db.ts";
import { otpThrottle } from "./otp-throttle.ts";
import { isStaffRole } from "./roles.ts";
import * as schema from "./schema.ts";
import { sendOtpSms, smsConfigured } from "./sms.ts";
import { DAY_COOKIE, dayToken, skipPhoneOtp } from "./staff-day.ts";
import { dayCookieOptions, staffDay } from "./staff-day-plugin.ts";

const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  user: {
    additionalFields: {
      // "member" for everyone; "admin" is set by hand for the review team.
      role: { type: "string", defaultValue: "member", input: false },
      banned: { type: "boolean", defaultValue: false, input: false },
    },
  },
  // A session lasts at most 7 days from sign-in, and is never extended by use. Its updatedAt therefore means "last seen"
  // (moved only by /api/session/touch), which is what idle sign-out reads (lib/idle.ts).
  session: { expiresIn: 60 * 60 * 24 * 7, disableSessionRefresh: true },
  databaseHooks: {
    session: {
      create: {
        // Banning also deletes a person's sessions (admin action); this stops them signing back in.
        before: async (s) => {
          if (skipPhoneOtp()) await db.update(schema.user).set({ phoneNumberVerified: true }).where(eq(schema.user.id, s.userId));
          const [u] = await db.select({ banned: schema.user.banned }).from(schema.user).where(eq(schema.user.id, s.userId));
          if (u?.banned) throw new APIError("FORBIDDEN", { message: "This account has been suspended. Call us if you think this is a mistake." });
        },
      },
    },
  },
  // Google and Apple are how most people sign in. Each shows up on the sign-in page only once its keys are set; both then
  // send people on to confirm their mobile number (/verify-phone), which owners and staff rely on.
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } }),
    // APPLE_CLIENT_SECRET is a signed token that lasts six months: pnpm apple-secret prints a fresh one.
    ...(process.env.APPLE_CLIENT_ID && {
      apple: { clientId: process.env.APPLE_CLIENT_ID, clientSecret: process.env.APPLE_CLIENT_SECRET!, appBundleIdentifier: process.env.APPLE_APP_BUNDLE_ID },
    }),
  },
  // Apple sends people back by posting to our callback from its own site.
  trustedOrigins: process.env.APPLE_CLIENT_ID ? ["https://appleid.apple.com"] : [],
  // SMS costs money and invites abuse. Limits are per client IP, counted in Postgres; 5 sends leaves room for
  // carrier-grade NAT, where many Jio/Airtel users share one IP.
  // Per-number limits are in lib/otp-throttle.ts.
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/phone-number/send-otp": { window: 600, max: 5 },
      "/phone-number/verify": { window: 600, max: 10 },
    },
  },
  // Behind Cloudflare and Caddy the socket IP is the proxy's; without this every visitor would share one limit.
  // Only trust these once the VPS firewall accepts web traffic from Cloudflare alone. Vercel overwrites x-forwarded-for
  // but passes a visitor's own cf-connecting-ip through, so there only x-forwarded-for is trusted.
  advanced: { ipAddress: { ipAddressHeaders: process.env.VERCEL ? ["x-forwarded-for"] : ["cf-connecting-ip", "x-forwarded-for"] } },
  // Staff second factor. The plugin's HTTP routes count wrong codes only at sign-in, which our phone-OTP sign-in never
  // passes through, so they are closed; admin/mfa-actions.ts calls the same code server-side with its own lockout.
  disabledPaths: [
    "/two-factor/enable",
    "/two-factor/disable",
    "/two-factor/get-totp-uri",
    "/two-factor/verify-totp",
    "/two-factor/verify-backup-code",
    "/two-factor/generate-backup-codes",
    "/two-factor/send-otp",
    "/two-factor/verify-otp",
  ],
  plugins: [
    twoFactor({ issuer: "Gharaana", allowPasswordless: true }), // phone sign-in has no password to ask for
    staffDay(),
    otpThrottle(), // a few codes per number, on top of the per-connection limit above
    phoneNumber({
      phoneNumberValidator: (n) => INDIAN_MOBILE.test(n),
      allowedAttempts: 3,
      // A staff member's text-message code, checked here, is what lets them sign in with the authenticator alone for the
      // rest of the day (lib/staff-day.ts). Clients get no such cookie. Runs for sign-in and for confirming a number alike.
      callbackOnVerification: async ({ user }, ctx) => {
        if (ctx && isStaffRole((user as { role?: unknown }).role)) ctx.setCookie(DAY_COOKIE, dayToken(ctx.context.secret, user.id), dayCookieOptions());
      },
      signUpOnVerification: {
        getTempEmail: (n) => `${n.slice(1)}@phone.directnest.invalid`,
        getTempName: () => "",
      },
      sendOTP: async ({ phoneNumber, code }) => {
        if (smsConfigured()) return sendOtpSms(phoneNumber, code);
        // OTP_IN_LOGS=1 is for test deploys before MSG91 exists: codes go to the host's log, which only the team can read.
        if (process.env.NODE_ENV === "production" && process.env.OTP_IN_LOGS !== "1") throw new Error("SMS provider is not configured: set MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID");
        console.log(`[dev] OTP for ${phoneNumber}: ${code}`);
      },
    }),
    nextCookies(), // keep last: lets server actions set the session cookie
  ],
});

export type Session = typeof auth.$Infer.Session;
