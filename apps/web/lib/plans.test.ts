// Runs against the dev database, like listings.test.ts.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, pool } from "./db.ts";
import { searchCards } from "./listings.ts";
import { parseSearch } from "./parse-search.ts";
import { featureListing, readPlan, savePlan, activePlans } from "./plans.ts";
import { plans } from "./schema.ts";
import { SEED } from "./seed.ts";

after(() => pool.end());

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

test("a featured home comes first in the default sort, flagged, until featuring stops", async () => {
  const last = SEED.at(-1)!;
  try {
    assert.equal(await featureListing(last.id, 15), true);
    const [first] = await searchCards(parseSearch({}));
    assert.deepEqual([first.id, first.featured], [last.id, true]);
    const cheapest = await searchCards(parseSearch({ sort: "price-asc" }));
    assert.ok(cheapest.every((c, i) => i === 0 || cheapest[i - 1].price <= c.price), "other sorts stay honest");
    assert.equal(await featureListing("no-such-home", 15), false);
  } finally {
    await featureListing(last.id, 0);
  }
  const [first] = await searchCards(parseSearch({}));
  assert.equal(first.featured, false);
});

test("plans: checked in plain words, and only active ones are offered", async () => {
  assert.deepEqual(readPlan(form({ name: "X", price: "999", days: "15" })), { error: "Give the plan a name (up to 60 characters)." });
  assert.match((readPlan(form({ name: "Boost", price: "abc", days: "15" })) as { error: string }).error, /Price/);
  const ok = readPlan(form({ name: "Boost 15", price: "₹1,999", days: "15", perks: "Featured for 15 days\n\n Staff visit and badge ", active: "on" }));
  assert.ok("plan" in ok);
  assert.deepEqual(ok.plan, { name: "Boost 15", price: 1999, days: 15, perks: ["Featured for 15 days", "Staff visit and badge"], active: true, position: 0 });

  const name = `test-plan-${Date.now()}`;
  try {
    await savePlan(null, { ...ok.plan, name });
    await savePlan(null, { ...ok.plan, name: `${name}-hidden`, active: false });
    const names = (await activePlans()).map((p) => p.name);
    assert.ok(names.includes(name) && !names.includes(`${name}-hidden`));
  } finally {
    await db.delete(plans).where(eq(plans.name, name));
    await db.delete(plans).where(eq(plans.name, `${name}-hidden`));
  }
});
