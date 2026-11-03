// Staff accounts: who has a role, and giving or taking one. Super admin pages only.
import { asc, eq, inArray, sql } from "drizzle-orm";
import { logAuditEvent } from "./audit.ts";
import { db } from "./db.ts";
import { isStaffRole, STAFF_ROLES, type StaffRole } from "./roles.ts";
import { staffInvites, twoFactor, user } from "./schema.ts";

export const listStaff = () =>
  db
    .select({ id: user.id, name: user.name, phone: user.phoneNumber, role: user.role, authenticator: user.twoFactorEnabled })
    .from(user)
    .where(inArray(user.role, [...STAFF_ROLES]))
    .orderBy(asc(user.role), asc(user.name));

export type RoleResult = "ok" | "bad-phone" | "no-account" | "self" | "banned";

/**
 * Gives someone a staff role, changes it, or ("member") takes it away. They must have signed in once, so the account
 * exists. Nobody changes their own role, so the console can never be left without a super admin. Taking a role away
 * also deletes their authenticator, so a later promotion enrols a fresh one.
 */
export async function setRole(adminId: string, phone: string, role: StaffRole | "member"): Promise<RoleResult> {
  if (!/^\+91[6-9]\d{9}$/.test(phone)) return "bad-phone";
  const [target] = await db.select({ id: user.id, role: user.role, banned: user.banned }).from(user).where(eq(user.phoneNumber, phone));
  if (!target) return "no-account";
  if (target.id === adminId) return "self";
  if (target.banned) return "banned";
  await db.transaction(async (tx) => {
    await tx.update(user).set({ role, updatedAt: new Date(), ...(role === "member" && { twoFactorEnabled: false }) }).where(eq(user.id, target.id));
    if (role === "member") await tx.delete(twoFactor).where(eq(twoFactor.userId, target.id));
  });
  await logAuditEvent("ADMIN_ROLE_CHANGED", { userId: adminId, targetId: target.id, details: { from: target.role, to: role } });
  return "ok";
}

export type InviteResult = "ok" | "bad-email" | "self" | "has-role";

/**
 * Reserves a staff role for an email address. It is claimed when someone signs in with Google or Apple under that
 * address (claimInvite), so it works for people who have never signed in. Phone sign-ups have no real email and can't claim.
 */
export async function inviteStaff(adminId: string, email: string, role: StaffRole): Promise<InviteResult> {
  const e = email.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "bad-email";
  const [existing] = await db.select({ id: user.id, role: user.role }).from(user).where(sql`lower(${user.email}) = ${e}`);
  if (existing?.id === adminId) return "self";
  if (isStaffRole(existing?.role)) return "has-role"; // already staff: change the role from the list instead
  await db.insert(staffInvites).values({ email: e, role, invitedBy: adminId }).onConflictDoUpdate({ target: staffInvites.email, set: { role, invitedBy: adminId } });
  await logAuditEvent("ADMIN_STAFF_INVITED", { userId: adminId, details: { email: e, role } });
  return "ok";
}

export const listInvites = () => db.select({ email: staffInvites.email, role: staffInvites.role, at: staffInvites.createdAt }).from(staffInvites).orderBy(asc(staffInvites.createdAt));

export async function revokeInvite(adminId: string, email: string) {
  const [gone] = await db.delete(staffInvites).where(eq(staffInvites.email, email.trim().toLowerCase())).returning({ email: staffInvites.email });
  if (gone) await logAuditEvent("ADMIN_STAFF_INVITE_REVOKED", { userId: adminId, details: { email: gone.email } });
}

/**
 * Run when someone has just signed in: turns a waiting invite into the role, once. Only an email the provider has
 * verified counts, so nobody can claim a role by typing someone else's address. Returns the role given, or null.
 */
export async function claimInvite(u: { id: string; email: string; emailVerified: boolean; role?: string | null }): Promise<StaffRole | null> {
  if (!u.emailVerified || isStaffRole(u.role)) return null;
  const claimed = await db.transaction(async (tx) => {
    const [invite] = await tx.delete(staffInvites).where(eq(staffInvites.email, u.email.toLowerCase())).returning({ role: staffInvites.role, by: staffInvites.invitedBy });
    if (!invite || !isStaffRole(invite.role)) return null;
    await tx.update(user).set({ role: invite.role, updatedAt: new Date() }).where(eq(user.id, u.id));
    return { role: invite.role, by: invite.by };
  });
  if (!claimed) return null;
  await logAuditEvent("ADMIN_ROLE_CHANGED", { userId: claimed.by, targetId: u.id, details: { from: u.role ?? "member", to: claimed.role, via: "invite" } });
  return claimed.role;
}
