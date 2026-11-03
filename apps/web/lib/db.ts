import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Run `pnpm db:start` and copy .env.example to .env.local.");

// One pool per server process; dev hot reloads reuse it instead of leaking connections.
const g = globalThis as unknown as { pgPool?: Pool };
export const pool = (g.pgPool ??= new Pool({ connectionString: url, max: 10 }));

export const db = drizzle(pool, { schema, casing: "snake_case" });
