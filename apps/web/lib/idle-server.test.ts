// Runs against the dev database, like admin.test.ts.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, pool } from "./db.ts";
import { idleTooLong } from "./idle.ts";
import { touchSession } from "./idle-server.ts";
import { session, user } from "./schema.ts";

after(() => pool.end());

test("touching a session moves its last-seen time, and only that session's", async () => {
  const t = `test-idle-${Date.now()}`;
  await db.insert(user).values({ id: t, name: "Idle", email: `${t}@test.invalid` });
  const old = new Date(Date.now() - 30 * 60_000);
  try {
    await db.insert(session).values([
      { id: `${t}-a`, token: `${t}-a`, userId: t, expiresAt: new Date(Date.now() + 864e5), createdAt: old, updatedAt: old },
      { id: `${t}-b`, token: `${t}-b`, userId: t, expiresAt: new Date(Date.now() + 864e5), createdAt: old, updatedAt: old },
    ]);
    const seen = async (id: string) => (await db.select({ at: session.updatedAt }).from(session).where(eq(session.id, id)))[0].at;
    assert.ok(idleTooLong(await seen(`${t}-a`)), "half an hour unused is too long");

    await touchSession(`${t}-a`);
    assert.ok(!idleTooLong(await seen(`${t}-a`)), "touched just now");
    assert.ok(idleTooLong(await seen(`${t}-b`)), "the other session is untouched");
  } finally {
    await db.delete(user).where(eq(user.id, t)); // cascades to sessions
  }
});
