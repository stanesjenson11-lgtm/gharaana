import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(".env.local");
} catch {} // CI and production pass DATABASE_URL directly

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
