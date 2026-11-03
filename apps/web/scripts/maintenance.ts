// Daily maintenance runner: sends expiry alerts, purges 30-day-old proof files, and clears stale sessions.
// Run via cron on the VPS:
//   node --env-file-if-exists=.env.local scripts/maintenance.ts
import { pool } from "../lib/db.ts";
import { runMaintenance } from "../lib/jobs.ts";

console.log("[maintenance] Starting maintenance run...");
const start = Date.now();
try {
  const report = await runMaintenance();
  console.log(`[maintenance] Completed in ${Date.now() - start}ms:`, JSON.stringify(report, null, 2));
} catch (err) {
  console.error("[maintenance] Failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
