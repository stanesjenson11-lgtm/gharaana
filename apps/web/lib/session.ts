import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { MFA_COOKIE, mfaValid } from "./admin-mfa.ts";
import { auth } from "./auth.ts";
import { can, homeFor, isStaffRole, type Section } from "./roles.ts";
import { logAuditEvent } from "./audit.ts";
import { idleTooLong } from "./idle.ts";
import { startedToday } from "./staff-day.ts";

// One lookup per request: the header, the page and the console shell all ask.
// A session nobody has touched for longer than the idle limit (lib/idle.ts) is over: the browser signs people out after
// a warning, and this is the backstop for tabs that were closed or devices that slept.
export const getSession = cache(async () => {
  const found = await auth.api.getSession({ headers: await headers() });
  if (!found || !idleTooLong(found.session.updatedAt)) return found;
  await (await auth.$context).internalAdapter.deleteSession(found.session.token);
  await logAuditEvent("AUTH_SESSION_IDLE", { userId: found.user.id, details: { by: "server" } });
  return null;
});

/**
 * Someone signed in who has also confirmed their mobile number. Phone sign-in confirms it on the way in; Google and
 * Apple sign-in add it afterwards (/verify-phone). Everything members do (shortlist, chat, contact, upload) needs it.
 */
export async function getMember() {
  const session = await getSession();
  return session?.user.phoneNumberVerified ? session : null;
}

/** For pages and actions that need a signed-in person. `next` is where to come back to. */
export async function requireUser(next: string) {
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (!session.user.phoneNumberVerified) redirect(`/verify-phone?next=${encodeURIComponent(next)}`);
  return session.user;
}

/**
 * Staff access to one section of the console, without redirecting, so routes that aren't pages can answer 404 themselves.
 *   none      not staff at all.
 *   expired   the session began on an earlier day: a new day starts with a text-message code again (/new-day).
 *   phone     hasn't confirmed their mobile number by a code yet.
 *   forbidden staff, but this isn't a section their role opens.
 *   enrol     hasn't set up an authenticator yet.
 *   verify    hasn't entered a code in this session.
 */
export async function staffGate(section: Section) {
  const session = await getSession();
  const role = session?.user.role;
  if (!session || !isStaffRole(role)) return { gate: "none" } as const;
  if (!startedToday(session.session.createdAt)) return { gate: "expired" } as const;
  if (!session.user.phoneNumberVerified) return { gate: "phone" } as const;
  if (!can(role, section)) return { gate: "forbidden", role } as const;
  if (!session.user.twoFactorEnabled) return { gate: "enrol" } as const;
  const { secret } = await auth.$context;
  if (!mfaValid(secret, session.session.id, (await cookies()).get(MFA_COOKIE)?.value)) return { gate: "verify" } as const;
  return { gate: "ok", user: session.user, role } as const;
}

/** Any staff role, no authenticator needed: the pages that set one up and check it. Everyone else gets a plain 404. */
export async function requireAdminRole() {
  const session = await getSession();
  if (!session || !isStaffRole(session.user.role)) notFound();
  if (!startedToday(session.session.createdAt)) redirect("/new-day");
  if (!session.user.phoneNumberVerified) redirect("/verify-phone?next=%2Fadmin");
  return session;
}

/**
 * Console pages and actions. Not staff: 404, so the console doesn't advertise itself. Staff in the wrong section go to
 * their own. Staff then enrol and pass an authenticator (admin/mfa-actions.ts) once per session.
 */
export async function requireAdmin(section: Section) {
  const g = await staffGate(section);
  if (g.gate === "none") notFound();
  if (g.gate === "expired") redirect("/new-day");
  if (g.gate === "phone") redirect("/verify-phone?next=%2Fadmin");
  if (g.gate === "forbidden") redirect(homeFor(g.role));
  if (g.gate === "enrol") redirect("/admin/security");
  if (g.gate === "verify") redirect("/admin/verify");
  return g.user;
}

/** Only allow same-site paths as a post-sign-in destination. */
export const safeNext = (next: unknown) => (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/");
