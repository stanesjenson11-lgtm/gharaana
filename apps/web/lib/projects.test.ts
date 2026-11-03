// Runs against the dev database, like listings.test.ts.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "./db.ts";
import { getListing, projectCards } from "./listings.ts";
import { projectFor, projectSummaries, readProject, saveProject, setUnits, unitIds } from "./projects.ts";
import { listings, projects, user } from "./schema.ts";
import { SEED } from "./seed.ts";

after(() => pool.end());

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

test("builder projects: RERA required, units attached by link, only live units counted", async () => {
  const fields = { name: `Test Towers ${Date.now()}`, builder: "Test Builders", rera: "prm/ka/rera/1251/309/pr/171015/000287", possession: "2027-12-01", locality: "whitefield", description: "Two towers of 2 and 3 BHK flats with a clubhouse, ten minutes from the ITPL metro.", published: "on" };
  assert.match((readProject(form({ ...fields, rera: "" })) as { error: string }).error, /RERA/);
  const read = readProject(form(fields));
  assert.ok("project" in read);
  assert.deepEqual([read.project.rera, read.project.locality], ["PRM/KA/RERA/1251/309/PR/171015/000287", "Whitefield"]);

  const t = `test-project-${Date.now()}`;
  await db.insert(user).values({ id: t, name: "Builder", email: `${t}@test.invalid` });
  const id = await saveProject(null, read.project);
  try {
    const s = SEED[0];
    const unit = (n: number, status: "active" | "pending_review") =>
      ({ ...s, id: `${t}-u${n}`, ownerId: t, status, sample: false, price: 9_000_000 + n * 1_000_000, addressPrivate: "x", location: { x: s.lng, y: s.lat }, availableFrom: null, saleCondition: "resale" }) as never;
    await db.insert(listings).values([unit(1, "active"), unit(2, "active"), unit(3, "pending_review")]);

    const unknown = await setUnits(id, `https://example.in/homes/${t}-u1?ref=x\n${t}-u2\n${t}-u3\nno-such-home`);
    assert.deepEqual(unknown, ["no-such-home"]);
    assert.deepEqual(await unitIds(id), [`${t}-u1`, `${t}-u2`, `${t}-u3`]);
    const [u1] = await db.select().from(listings).where(eq(listings.id, `${t}-u1`));
    assert.equal(u1.saleCondition, "new", "units become new from the builder");

    assert.deepEqual((await projectCards(id)).map((c) => c.id), [`${t}-u1`, `${t}-u2`], "live units only, cheapest first");
    const summary = (await projectSummaries()).find((p) => p.id === id);
    assert.deepEqual([summary?.units, summary?.from, summary?.to], [2, 10_000_000, 11_000_000]);
    assert.equal((await getListing(`${t}-u1`))?.project?.rera, "PRM/KA/RERA/1251/309/PR/171015/000287");

    await setUnits(id, `${t}-u2`);
    assert.deepEqual(await unitIds(id), [`${t}-u2`], "units left out of the list are detached");

    await saveProject(id, { ...read.project, published: false });
    assert.equal(await projectFor(id), undefined, "drafts stay hidden");
    assert.equal((await getListing(`${t}-u2`))?.project, null);
  } finally {
    await db.delete(user).where(inArray(user.id, [t]));
    await db.delete(projects).where(eq(projects.id, id));
  }
});
