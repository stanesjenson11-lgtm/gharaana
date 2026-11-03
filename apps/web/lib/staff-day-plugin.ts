// Signing in with the authenticator alone, for staff who already had today's text-message code in this browser.
// The sign-in page offers it only when lib/staff-day.ts's cookie says so; this checks the cookie again, then the code.
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { symmetricDecrypt } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { MFA_COOKIE, mfaToken } from "./admin-mfa.ts";
import { logAuditEvent } from "./audit.ts";
import { db } from "./db.ts";
import { clearTries, spendTry } from "./mfa-lock.ts";
import { isStaffRole } from "./roles.ts";
import { twoFactor, user } from "./schema.ts";
import { DAY_COOKIE, dayUser, secondsLeftToday, totpValid } from "./staff-day.ts";

export const dayCookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: secondsLeftToday() });

export const staffDay = () =>
  ({
    id: "staff-day",
    endpoints: {
      staffDaySignIn: createAuthEndpoint("/staff-day/sign-in", { method: "POST", body: z.object({ code: z.string().max(12) }) }, async (ctx) => {
        const refuse = (status: "UNAUTHORIZED" | "TOO_MANY_REQUESTS", message: string): never => {
          throw new APIError(status, { message });
        };
        const h = ctx.request?.headers;
        const audit = (action: string, userId: string) => logAuditEvent(action, { userId, ipAddress: h?.get("cf-connecting-ip") || h?.get("x-forwarded-for"), userAgent: h?.get("user-agent"), details: { via: "authenticator only" } });

        const id = dayUser(ctx.context.secret, ctx.getCookie(DAY_COOKIE) ?? undefined);
        if (!id) return refuse("UNAUTHORIZED", "NO_DAY");
        const [person] = await db.select({ role: user.role, banned: user.banned, phoneVerified: user.phoneNumberVerified, on: user.twoFactorEnabled }).from(user).where(eq(user.id, id));
        // Anything that has changed since this morning (role taken away, suspended, authenticator reset) sends them back to a text message.
        if (!person || person.banned || !isStaffRole(person.role) || !person.phoneVerified || !person.on) return refuse("UNAUTHORIZED", "NO_DAY");

        if (!(await spendTry(id))) {
          await audit("ADMIN_MFA_LOCKED", id);
          return refuse("TOO_MANY_REQUESTS", "LOCKED");
        }
        const [row] = await db.select({ secret: twoFactor.secret, verified: twoFactor.verified }).from(twoFactor).where(eq(twoFactor.userId, id));
        const secret = row && row.verified !== false ? await symmetricDecrypt({ key: ctx.context.secretConfig, data: row.secret }) : null;
        if (!secret || !totpValid(secret, ctx.body.code.replace(/\s/g, ""))) {
          await audit("ADMIN_MFA_FAILED", id);
          return refuse("UNAUTHORIZED", "WRONG_CODE");
        }
        await clearTries(id);

        const account = await ctx.context.internalAdapter.findUserById(id);
        const session = account && (await ctx.context.internalAdapter.createSession(id));
        if (!account || !session) return refuse("UNAUTHORIZED", "NO_DAY");
        await setSessionCookie(ctx, { session, user: account });
        // The code just entered also opens the console for this session, so there is nothing more to ask.
        ctx.setCookie(MFA_COOKIE, mfaToken(ctx.context.secret, session.id), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: secondsLeftToday() });
        await audit("ADMIN_MFA_OK", id);
        return ctx.json({ ok: true });
      }),
    },
    rateLimit: [{ pathMatcher: (path: string) => path === "/staff-day/sign-in", window: 600, max: 10 }],
  }) satisfies BetterAuthPlugin;
