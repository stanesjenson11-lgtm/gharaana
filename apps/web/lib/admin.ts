// Staff tools for people: find them, and ban or unban. Admin pages only.
import { and, desc, eq, ilike, notInArray, or, sql } from "drizzle-orm";
import { logAuditEvent } from "./audit.ts";
import { db } from "./db.ts";
import { STAFF_ROLES } from "./roles.ts";
import { session, user } from "./schema.ts";

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Newest first; `q` matches a name or any part of a phone number. */
export async function findUsers(q = "") {
  const term = q.trim().slice(0, 60);
  // A phone search is only a search made of phone-number characters; "Asha 2" is a name.
  const digits = /^[\d\s+()-]+$/.test(term) ? term.replace(/\D/g, "") : "";
  return db
    .select({
      id: user.id,
      name: user.name,
      phone: user.phoneNumber,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
      listings: sql<number>`(select count(*) from listings l where l.owner_id = "user"."id")`.mapWith(Number),
      reveals: sql<number>`(select count(*) from contact_reveals r where r.user_id = "user"."id" and r.created_at > now() - interval '7 days')`.mapWith(Number),
    })
    .from(user)
    .where(term ? or(ilike(user.name, `%${escapeLike(term)}%`), digits ? ilike(user.phoneNumber, `%${digits}%`) : undefined) : undefined)
    .orderBy(desc(user.createdAt))
    .limit(50);
}

/** Banning signs the person out everywhere; the session hook in lib/auth.ts stops them signing back in. Staff can't be banned here: take their role away first. */
export async function setBanned(adminId: string, userId: string, banned: boolean) {
  if (adminId === userId) return false;
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(user)
      .set({ banned, updatedAt: new Date() })
      .where(and(eq(user.id, userId), notInArray(user.role, [...STAFF_ROLES])))
      .returning({ id: user.id });
    if (row && banned) await tx.delete(session).where(eq(session.userId, userId));
    return !!row;
  });

  if (result) {
    await logAuditEvent(banned ? "ADMIN_BAN_USER" : "ADMIN_UNBAN_USER", {
      userId: adminId,
      targetId: userId,
      details: { banned },
    });
  }

  return result;
}
