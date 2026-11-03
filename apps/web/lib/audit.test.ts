import test from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import { db } from "./db.ts";
import { auditLogs } from "./schema.ts";
import { logAuditEvent, getRecentAuditLogs } from "./audit.ts";

test("audit: logs security events and sanitizes sensitive fields", async () => {
  const testAction = "TEST_SECURITY_EVENT";

  try {
    await logAuditEvent(testAction, {
      userId: null,
      targetId: "target-123",
      ipAddress: "203.0.113.195",
      userAgent: "Mozilla/5.0 TestAgent",
      details: {
        attempt: 1,
        code: "998811",
        token: "sensitive-token-xyz",
        role: "admin",
      },
    });

    const logs = await getRecentAuditLogs({ action: testAction, limit: 10 });
    assert.ok(logs.length > 0);

    const entry = logs[0];
    assert.equal(entry.action, testAction);
    assert.equal(entry.targetId, "target-123");
    assert.equal(entry.ipAddress, "203.0.113.195");
    assert.equal(entry.userAgent, "Mozilla/5.0 TestAgent");

    const parsedDetails = JSON.parse(entry.details || "{}");
    assert.equal(parsedDetails.attempt, 1);
    assert.equal(parsedDetails.role, "admin");
    assert.equal(parsedDetails.code, "[REDACTED]");
    assert.equal(parsedDetails.token, "[REDACTED]");
  } finally {
    const records = await getRecentAuditLogs({ action: testAction, limit: 20 });
    const ids = records.map((r) => r.id);
    if (ids.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.id, ids));
    }
  }
});
