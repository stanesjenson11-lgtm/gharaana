// The staff authenticator's lockout. After MAX_TRIES wrong codes the account is locked for 15 minutes.
import { eq, sql } from "drizzle-orm";
import { db } from "./db.ts";
import { twoFactor } from "./schema.ts";

export const MAX_TRIES = 5;

/**
 * Spends one try before the code is checked, so parallel guesses can't outrun the counter. A lock that has run out
 * restarts the count at 1. False: the account is locked now.
 */
export async function spendTry(userId: string) {
  const next = sql`case when ${twoFactor.lockedUntil} is not null then 1 else ${twoFactor.failedVerificationCount} + 1 end`;
  const rows = await db
    .update(twoFactor)
    .set({
      failedVerificationCount: next,
      lockedUntil: sql`case when ${next} >= ${MAX_TRIES} then now() + interval '15 minutes' else null end`,
    })
    .where(sql`${twoFactor.userId} = ${userId} and (${twoFactor.lockedUntil} is null or ${twoFactor.lockedUntil} <= now())`)
    .returning({ id: twoFactor.id });
  return rows.length > 0;
}

/** A right code clears the count. */
export const clearTries = (userId: string) => db.update(twoFactor).set({ failedVerificationCount: 0, lockedUntil: null }).where(eq(twoFactor.userId, userId));
