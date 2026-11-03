"use server";

import { APIError } from "better-auth/api";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { MFA_COOKIE, mfaToken } from "@/lib/admin-mfa";
import { logAuditEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { homeFor, type StaffRole } from "@/lib/roles";
import { clearTries, spendTry } from "@/lib/mfa-lock";
import { requireAdminRole } from "@/lib/session";
import { secondsLeftToday } from "@/lib/staff-day";

/** Six digits = authenticator code, anything else = a backup code (single use). */
async function checkCode(userId: string, raw: string): Promise<"ok" | "wrong" | "locked"> {
  if (!(await spendTry(userId))) return "locked";
  const code = raw.replace(/\s/g, "");
  const h = await headers();
  try {
    if (/^\d{6}$/.test(code)) await auth.api.verifyTOTP({ body: { code }, headers: h });
    else await auth.api.verifyBackupCode({ body: { code }, headers: h });
  } catch (e) {
    if (e instanceof APIError) return "wrong";
    throw e;
  }
  await clearTries(userId);
  return "ok";
}

const audit = async (action: string, userId: string) => {
  const h = await headers();
  await logAuditEvent(action, { userId, ipAddress: h.get("cf-connecting-ip") || h.get("x-forwarded-for"), userAgent: h.get("user-agent") });
};

/** Records that this session has passed the second factor, until the day ends. */
async function openConsole(sessionId: string) {
  const { secret } = await auth.$context;
  (await cookies()).set(MFA_COOKIE, mfaToken(secret, sessionId), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: secondsLeftToday(),
  });
}

/** Step 1 of enrolling: a secret for the authenticator app and single-use backup codes. Shown once. */
export async function startEnrollment() {
  const { user } = await requireAdminRole();
  if (user.twoFactorEnabled) return null;
  const r = await auth.api.enableTwoFactor({ body: { method: "totp" }, headers: await headers() });
  if (r.method !== "totp") return null;
  // The app would label the entry with the placeholder email phone sign-in made up; the number is what staff recognise.
  const uri = user.phoneNumber ? r.totpURI.replace(encodeURIComponent(user.email), encodeURIComponent(user.phoneNumber)) : r.totpURI;
  return { uri, codes: r.backupCodes };
}

/** Step 2: the first code from the app turns it on and opens the console: the code just entered is today's second factor. */
export async function confirmEnrollment(code: string) {
  const { user } = await requireAdminRole();
  if (user.twoFactorEnabled || !/^\d{6}$/.test(code.trim())) return "Enter the 6-digit code from your authenticator app.";
  const result = await checkCode(user.id, code);
  if (result === "locked") return "Too many wrong codes. Try again in 15 minutes.";
  if (result === "wrong") return "That code doesn't match. Check the time on your phone and try again.";
  await audit("ADMIN_MFA_ENROLLED", user.id);
  // Turning it on replaced the session. Read the new one from the cookies just set, and open the console for it.
  const fresh = await auth.api.getSession({ headers: new Headers({ cookie: (await cookies()).toString() }) });
  if (!fresh) redirect("/admin/verify");
  await openConsole(fresh.session.id);
  return "ok"; // the page then opens the console itself: a redirect from here would be followed with the old session's cookies
}

/** Once per session: a code, or a backup code, then the console is open until the day ends. */
export async function verifyMfa(_: string | null, form: FormData) {
  const { user, session } = await requireAdminRole();
  if (!user.twoFactorEnabled) redirect("/admin/security");
  const result = await checkCode(user.id, String(form.get("code") ?? ""));
  if (result === "locked") {
    await audit("ADMIN_MFA_LOCKED", user.id);
    return "Too many wrong codes. Try again in 15 minutes.";
  }
  if (result === "wrong") {
    await audit("ADMIN_MFA_FAILED", user.id);
    return "That code doesn't match. Try again, or use a backup code.";
  }
  await audit("ADMIN_MFA_OK", user.id);
  await openConsole(session.id);
  redirect(homeFor(user.role as StaffRole));
}
