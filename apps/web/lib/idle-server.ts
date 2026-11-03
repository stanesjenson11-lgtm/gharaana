// The server's side of idle sign-out (lib/idle.ts): a session's last activity is its updatedAt, and nothing else moves it
// (better-auth's own refresh is switched off in lib/auth.ts), so it means "last seen" and no more.
import { eq } from "drizzle-orm";
import { db } from "./db.ts";
import { session } from "./schema.ts";

/** Records that the person with this session is here now. */
export const touchSession = (id: string) => db.update(session).set({ updatedAt: new Date() }).where(eq(session.id, id));
