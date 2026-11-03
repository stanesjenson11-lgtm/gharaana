// Runs against the dev database. Counts depend on what else is in it, so this checks the shape of every dashboard query:
// that the SQL runs, and that each chart gets exactly the points it draws.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { attention, clientsPerWeek, clientStats, leadsByWeekday, leadStats, listingsByStatus, listingsPerDay, recentActivity, reviewStats, ticketStats } from "./dashboard.ts";
import { pool } from "./db.ts";

after(() => pool.end());

test("every dashboard query runs and hands each chart the points it draws", async () => {
  const [perDay, perWeek, weekday] = await Promise.all([listingsPerDay(14), clientsPerWeek(8), leadsByWeekday()]);
  assert.equal(perDay.length, 14, "one bar per day, zero-filled");
  assert.equal(perWeek.length, 8, "one bar per week");
  assert.deepEqual(weekday.map((p) => p.label), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  for (const p of [...perDay, ...perWeek, ...weekday]) assert.ok(Number.isInteger(p.value) && p.value >= 0, `${p.label} is a whole count`);

  const review = await reviewStats();
  for (const n of [review.pending, review.live, review.visited, review.expiring, review.approvedWeek, review.rejectedWeek]) assert.ok(Number.isInteger(n) && n >= 0);
  assert.ok(review.visited <= review.live, "visited homes are a subset of live ones");

  const [status, clients, leads, tickets, attn, activity] = await Promise.all([listingsByStatus(), clientStats(), leadStats(), ticketStats(), attention(), recentActivity(5)]);
  assert.ok(status.every((s) => s.n > 0));
  assert.ok(clients.total >= clients.week && clients.total >= clients.banned);
  assert.ok(leads.byStage.every((s) => s.n > 0) && leads.week >= 0);
  assert.ok(tickets.byStatus.every((s) => ["open", "answered", "closed"].includes(s.status)));
  for (const list of Object.values(attn)) assert.ok(list.rows.length <= 5 && list.rows.length <= list.total || list.total === 0);
  assert.ok(activity.length <= 5 && activity.every((a) => a.who && a.text));
});
