import { desc, eq } from "drizzle-orm";
import { db } from "./db.ts";
import { auditLogs } from "./schema.ts";

export type AuditAction =
  | "AUTH_SIGN_IN"
  | "AUTH_SIGN_OUT"
  | "AUTH_SESSION_IDLE"
  | "AUTH_OTP_SENT"
  | "ACCOUNT_DELETED"
  | "ADMIN_ROLE_CHANGED"
  | "ADMIN_STAFF_INVITED"
  | "ADMIN_STAFF_INVITE_REVOKED"
  | "ADMIN_MFA_ENROLLED"
  | "ADMIN_MFA_RESET"
  | "ADMIN_MFA_OK"
  | "ADMIN_MFA_FAILED"
  | "ADMIN_MFA_LOCKED"
  | "ADMIN_BAN_USER"
  | "ADMIN_UNBAN_USER"
  | "ADMIN_APPROVE_LISTING"
  | "ADMIN_REJECT_LISTING"
  | "ADMIN_EDIT_LISTING"
  | "ADMIN_LISTING_STATUS"
  | "ADMIN_LISTING_PHOTOS"
  | "ADMIN_DELETE_LISTING"
  | "PHONE_REVEALED"
  | "CONSENT_RECORDED";

export interface LogAuditOptions {
  userId?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown> | null;
}

const REDACTED_KEYS = new Set(["code", "token", "password", "secret", "cookie", "authorization"]);

function sanitizeDetails(details?: Record<string, unknown> | null): string | null {
  if (!details) return null;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      try {
        sanitized[key] = JSON.parse(JSON.stringify(value));
      } catch {
        sanitized[key] = String(value);
      }
    } else {
      sanitized[key] = value;
    }
  }

  return JSON.stringify(sanitized);
}

/** Logs a security or administrative event into the immutable audit table. */
export async function logAuditEvent(action: AuditAction | string, options: LogAuditOptions = {}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      action,
      userId: options.userId ?? null,
      targetId: options.targetId ?? null,
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,
      details: sanitizeDetails(options.details),
    });
  } catch (err) {
    // Audit logging should not crash request paths, but must be surfaced
    console.error("[audit] failed to record audit event:", action, err);
  }
}

/** Retrieve recent audit logs for a specific user or action. */
export async function getRecentAuditLogs(options: { userId?: string; action?: string; limit?: number } = {}) {
  const query = db.select().from(auditLogs);
  if (options.userId) {
    return db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, options.userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(options.limit ?? 50);
  }
  if (options.action) {
    return db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, options.action))
      .orderBy(desc(auditLogs.createdAt))
      .limit(options.limit ?? 50);
  }
  return query.orderBy(desc(auditLogs.createdAt)).limit(options.limit ?? 50);
}
