// The docket against the dev database: who sees what, who may hand work to whom, the shared pool, repeats and reminders.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { db, pool } from "./db.ts";
import {
  addNote, assignees, claim, createItem, deleteItem, editItem, itemDetail, listItems, reassign, resolveSubjects, scopeCounts, sendDueReminders, setStatus, summary, workload, type Viewer,
} from "./docket.ts";
import { notifications, docketItems, listings, user } from "./schema.ts";

after(() => pool.end());

const rand = () => Math.random().toString(36).slice(2, 8);

/** A small team: a super admin, a reviewer, two in support and one in sales, plus a client and a suspended support person. */
async function team() {
  const t = `dk-${rand()}`;
  const make = (key: string, role: string, banned = false) => ({ id: `${t}-${key}`, name: `${key} ${t}`, email: `${t}-${key}@test.invalid`, role, banned });
  const rows = [make("admin", "admin"), make("rev", "reviewer"), make("sup1", "support"), make("sup2", "support"), make("sales", "sales"), make("client", "member"), make("gone", "support", true)];
  await db.insert(user).values(rows);
  const v = (key: string, role: Viewer["role"]): Viewer => ({ id: `${t}-${key}`, role, name: `${key} ${t}` });
  return {
    t,
    admin: v("admin", "admin"), rev: v("rev", "reviewer"), sup1: v("sup1", "support"), sup2: v("sup2", "support"), sales: v("sales", "sales"),
    clientId: `${t}-client`, bannedId: `${t}-gone`,
    ids: rows.map((r) => r.id),
    async clean() {
      await db.delete(docketItems).where(or(...this.ids.flatMap((id) => [eq(docketItems.createdBy, id), eq(docketItems.assigneeId, id)]), like(docketItems.title, `%${t}%`)));
      await db.delete(notifications).where(like(notifications.text, `%${t}%`)); // pool alerts also reach real dev accounts
      await db.delete(user).where(inArray(user.id, this.ids));
    },
  };
}

const must = <T extends { ok: boolean }>(r: T) => {
  assert.ok(r.ok, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

test("work is handed only the ways the roles allow, and only to people who can take it", async () => {
  const w = await team();
  try {
    const mine = must(await createItem(w.sup1, { title: `Call back ${w.t}`, dueAt: null, target: { userId: w.sup1.id } }));
    assert.ok(mine.id > 0);
    must(await createItem(w.sup1, { title: `Look at photos ${w.t}`, dueAt: null, target: { userId: w.rev.id } }));
    must(await createItem(w.sup1, { title: `Warm client ${w.t}`, dueAt: null, target: { userId: w.sales.id } }));
    must(await createItem(w.admin, { title: `Anything ${w.t}`, dueAt: null, target: { userId: w.sales.id } }));

    const refused = (r: { ok: boolean; reason?: string }) => (r.ok ? "ok" : r.reason);
    assert.equal(refused(await createItem(w.sales, { title: `x ${w.t}`, dueAt: null, target: { userId: w.rev.id } })), "target", "sales can't hand to a reviewer");
    assert.equal(refused(await createItem(w.rev, { title: `x ${w.t}`, dueAt: null, target: { role: "sales" } })), "target");
    assert.equal(refused(await createItem(w.sup1, { title: `x ${w.t}`, dueAt: null, target: { userId: w.admin.id } })), "target", "nobody but the super admin hands work up to them");
    assert.equal(refused(await createItem(w.admin, { title: `x ${w.t}`, dueAt: null, target: { userId: w.clientId } })), "target", "a client isn't staff");
    assert.equal(refused(await createItem(w.admin, { title: `x ${w.t}`, dueAt: null, target: { userId: w.bannedId } })), "target", "nor is a suspended account");
    assert.equal(refused(await createItem(w.admin, { title: `x ${w.t}`, dueAt: null, target: { userId: "nobody" } })), "target");
    assert.equal(refused(await createItem(w.sup1, { title: "   ", dueAt: null, target: { userId: w.sup1.id } })), "title");
    assert.equal(refused(await createItem(w.sup1, { title: "t".repeat(161), dueAt: null, target: { userId: w.sup1.id } })), "title");
    assert.equal(refused(await createItem(w.sup1, { title: `x ${w.t}`, priority: "whenever", dueAt: null, target: { userId: w.sup1.id } })), "bad");

    const { people, pools } = await assignees(w.sales);
    assert.ok(people.every((p) => p.role === "sales" || p.role === "support"));
    assert.deepEqual(pools.map((p) => p.role), ["sales", "support"]);
    assert.ok(!people.some((p) => p.id === w.bannedId));
  } finally {
    await w.clean();
  }
});

test("each person sees their own corner; the super admin sees all", async () => {
  const w = await team();
  try {
    const toSales = must(await createItem(w.sup1, { title: `Hand to sales ${w.t}`, dueAt: null, target: { userId: w.sales.id } }));
    const colleague = must(await createItem(w.sup1, { title: `Support only ${w.t}`, dueAt: null, target: { userId: w.sup2.id } }));
    const seen = async (v: Viewer, id: number) => !!(await itemDetail(v, id));

    assert.ok(await seen(w.sales, toSales.id), "the one it was given to");
    assert.ok(await seen(w.sup1, toSales.id), "the one who gave it");
    assert.ok(await seen(w.admin, toSales.id));
    assert.ok(!(await seen(w.rev, toSales.id)), "someone with no part in it");
    assert.ok(!(await seen(w.sales, colleague.id)));
    assert.ok(await seen(w.sup2, colleague.id));

    const handedOff = await listItems(w.sup1, { scope: "made" });
    assert.ok(handedOff.items.some((i) => i.id === toSales.id) && handedOff.items.some((i) => i.id === colleague.id));
    assert.ok(!(await listItems(w.sup1, { scope: "mine" })).items.some((i) => i.id === toSales.id));
    assert.ok((await listItems(w.sales, { scope: "mine" })).items.some((i) => i.id === toSales.id));
    // Only the super admin has the team list; asking for it as anyone else shows their own.
    assert.ok(!(await listItems(w.rev, { scope: "team" })).items.some((i) => i.id === toSales.id));
    assert.ok((await listItems(w.admin, { scope: "team", q: w.t })).items.length >= 2);
    assert.equal((await listItems(w.admin, { scope: "team", q: `${w.t.toUpperCase()}` })).items.length >= 2, true, "search ignores case");

    const counts = await scopeCounts(w.sales);
    assert.equal(counts.mine, 1);
    // Anything waiting in the sales pool is also theirs to see, and other tests (and real data) put items there.
    assert.ok(counts.team >= counts.mine, "counted as what it can see");
    // Nobody but the maker and the super admin may delete it.
    assert.deepEqual(await deleteItem(w.sales, toSales.id), { ok: false, reason: "forbidden" });
    assert.deepEqual(await deleteItem(w.rev, toSales.id), { ok: false, reason: "gone" });
    assert.ok((await deleteItem(w.sup1, toSales.id)).ok);
    assert.ok(!(await seen(w.admin, toSales.id)));
  } finally {
    await w.clean();
  }
});

test("a role's pool: the whole role is told, and of two people asking at once only one gets it", async () => {
  const w = await team();
  try {
    const item = must(await createItem(w.admin, { title: `Pool ${w.t}`, dueAt: null, target: { role: "support" } }));
    const told = await db.select({ userId: notifications.userId }).from(notifications).where(like(notifications.text, `%Pool ${w.t}%`));
    assert.ok([w.sup1.id, w.sup2.id].every((id) => told.some((n) => n.userId === id)), "everyone in the role hears");
    assert.ok(!told.some((n) => n.userId === w.rev.id || n.userId === w.sales.id || n.userId === w.bannedId || n.userId === w.admin.id));

    assert.equal((await listItems(w.sup2, { scope: "pool" })).items.some((i) => i.id === item.id), true);
    assert.equal((await listItems(w.rev, { scope: "pool" })).items.some((i) => i.id === item.id), false);
    assert.equal((await listItems(w.admin, { scope: "pool" })).items.some((i) => i.id === item.id), true, "the super admin sees every pool");
    assert.deepEqual(await claim(w.rev, item.id), { ok: false, reason: "gone" }, "not their role's pool");
    assert.deepEqual(await claim(w.sales, item.id), { ok: false, reason: "gone" });

    const [a, b] = await Promise.all([claim(w.sup1, item.id), claim(w.sup2, item.id)]);
    assert.equal([a, b].filter((r) => r.ok).length, 1, "exactly one wins");
    const d = (await itemDetail(w.admin, item.id))!;
    assert.deepEqual([d.assigneeRole, d.assigneeId !== null], [null, true]);
    assert.deepEqual(await claim(w.sup2, item.id), { ok: false, reason: "gone" }, "and it's no longer up for grabs");
    // The one who put it there hears who took it.
    assert.ok((await db.select().from(notifications).where(and(eq(notifications.userId, w.admin.id), like(notifications.text, `%took: Pool ${w.t}%`)))).length === 1);
  } finally {
    await w.clean();
  }
});

test("finishing a repeating item opens the next, and the one who gave the work hears it's done", async () => {
  const w = await team();
  try {
    const now = new Date();
    const due = new Date(now.getTime() - 2 * 864e5);
    const item = must(await createItem(w.admin, { title: `Weekly ${w.t}`, repeat: "weekly", dueAt: due, target: { userId: w.sup1.id }, priority: "high" }));
    assert.ok((await setStatus(w.sup1, item.id, "doing")).ok);
    assert.ok((await setStatus(w.sup1, item.id, "done")).ok);
    assert.ok((await setStatus(w.sup1, item.id, "done")).ok, "doing it twice is harmless");

    const all = await db.select().from(docketItems).where(like(docketItems.title, `Weekly ${w.t}`));
    assert.equal(all.length, 2, "exactly one follow-up");
    const next = all.find((i) => i.id !== item.id)!;
    assert.deepEqual([next.status, next.priority, next.assigneeId, next.repeat], ["open", "high", w.sup1.id, "weekly"]);
    assert.ok(next.dueAt!.getTime() > now.getTime(), "due after now, not in the past");
    assert.ok((await db.select().from(notifications).where(and(eq(notifications.userId, w.admin.id), like(notifications.text, `%finished: Weekly ${w.t}%`)))).length === 1);

    const done = (await itemDetail(w.sup1, item.id))!;
    assert.equal(done.status, "done");
    assert.ok(done.doneAt);
    assert.ok(done.notes.some((n) => n.body === "Marked done"));
    assert.ok((await setStatus(w.sup1, item.id, "open")).ok);
    assert.equal((await itemDetail(w.sup1, item.id))!.doneAt, null, "reopening clears it");
    assert.deepEqual(await setStatus(w.rev, item.id, "done"), { ok: false, reason: "gone" }, "someone who can't see it can't touch it");

    // A one-off doesn't repeat.
    const once = must(await createItem(w.sup1, { title: `Once ${w.t}`, dueAt: due, target: { userId: w.sup1.id } }));
    await setStatus(w.sup1, once.id, "done");
    assert.equal((await db.select().from(docketItems).where(like(docketItems.title, `Once ${w.t}`))).length, 1);
  } finally {
    await w.clean();
  }
});

test("handing on, editing, notes and subjects", async () => {
  const w = await team();
  const home = `dk-home-${w.t}`;
  try {
    await db.insert(listings).values({
      id: home, ownerId: w.clientId, status: "active", type: "buy", kind: "apartment", bhk: 2, title: `Home ${w.t}`, locality: "x", area: "x", addressPrivate: "x", location: { x: 77.6, y: 12.9 },
      price: 1, carpetSqft: 900, floor: 1, totalFloors: 4, furnishing: "none", facing: "East", ageYears: 1, pets: false, nonVeg: true, parking: "none", bathrooms: 1, balconies: 1, description: "x",
    });
    const refused = (r: { ok: boolean; reason?: string }) => (r.ok ? "ok" : r.reason);
    // Only what the maker may open can be attached: support can open clients and requests, but not homes or unknown things.
    assert.equal(refused(await createItem(w.sup1, { title: `x ${w.t}`, dueAt: null, target: { userId: w.sup1.id }, subject: { kind: "listing", id: home } })), "subject");
    assert.equal(refused(await createItem(w.rev, { title: `x ${w.t}`, dueAt: null, target: { userId: w.rev.id }, subject: { kind: "listing", id: "no-such-home" } })), "subject");
    const item = must(await createItem(w.rev, { title: `Check ${w.t}`, detail: "Photos look reused", dueAt: null, target: { userId: w.rev.id }, subject: { kind: "listing", id: home } }));
    const sup = must(await createItem(w.sup1, { title: `Ring ${w.t}`, dueAt: null, target: { userId: w.sup1.id }, subject: { kind: "client", id: w.clientId } }));
    assert.equal((await resolveSubjects([{ kind: "listing", id: home }])).get(`listing:${home}`)?.label, `Home ${w.t}`);
    const detail = (await itemDetail(w.rev, item.id))!;
    assert.deepEqual([detail.subject?.href, detail.canOpenSubject], [`/admin/listings/${home}`, true]);
    assert.equal((await itemDetail(w.sup1, sup.id))!.canOpenSubject, true);

    assert.equal(refused(await reassign(w.rev, item.id, { userId: w.sales.id })), "target");
    assert.ok((await reassign(w.rev, item.id, { userId: w.sup2.id })).ok);
    assert.ok((await itemDetail(w.rev, item.id)), "the one who gave it still sees it");
    assert.ok((await db.select().from(notifications).where(and(eq(notifications.userId, w.sup2.id), like(notifications.text, `%gave you: Check ${w.t}%`)))).length === 1);
    // The new owner may see a listing item but not open its subject without access to that section.
    assert.equal((await itemDetail(w.sup2, item.id))!.canOpenSubject, false);

    const due = new Date(Date.now() + 864e5);
    assert.ok((await editItem(w.sup2, item.id, { priority: "urgent", dueAt: due, title: `Check again ${w.t}` })).ok);
    assert.equal(refused(await editItem(w.sup2, item.id, { title: "" })), "title");
    assert.equal(refused(await editItem(w.sup2, item.id, { priority: "now" })), "bad");
    const after = (await itemDetail(w.sup2, item.id))!;
    assert.deepEqual([after.priority, after.title], ["urgent", `Check again ${w.t}`]);
    assert.ok(after.notes.some((n) => n.body.startsWith("Priority set to urgent")) && after.notes.some((n) => n.body.startsWith("Due date moved")));

    assert.ok((await addNote(w.sup2, item.id, "call", "Rang the owner, no answer")).ok);
    assert.equal(refused(await addNote(w.sup2, item.id, "email", "x")), "bad");
    assert.equal(refused(await addNote(w.sup2, item.id, "note", "  ")), "bad");
    assert.equal(refused(await addNote(w.sales, item.id, "note", "hello")), "gone");
    assert.equal((await itemDetail(w.sup2, item.id))!.notes[0].kind, "call", "newest first");

    const summ = await summary(w.sup2);
    assert.equal(summ.open, 1);
    assert.equal(summ.overdue, 0);
  } finally {
    await w.clean();
    await db.delete(listings).where(eq(listings.id, home));
  }
});

test("reminders go out once per due date, to the owner or the whole pool", async () => {
  const w = await team();
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 6 * 3_600_000);
    const late = new Date(now.getTime() - 3 * 864e5);
    const far = new Date(now.getTime() + 10 * 864e5);
    const a = must(await createItem(w.admin, { title: `Soon ${w.t}`, dueAt: soon, target: { userId: w.sup1.id } }));
    must(await createItem(w.admin, { title: `Late pool ${w.t}`, dueAt: late, target: { role: "sales" } }));
    must(await createItem(w.admin, { title: `Far ${w.t}`, dueAt: far, target: { userId: w.sup1.id } }));
    must(await createItem(w.admin, { title: `Undated ${w.t}`, dueAt: null, target: { userId: w.sup1.id } }));
    const finished = must(await createItem(w.admin, { title: `Finished ${w.t}`, dueAt: soon, target: { userId: w.sup1.id } }));
    await setStatus(w.sup1, finished.id, "done");

    const heard = async (text: string) => (await db.select({ userId: notifications.userId }).from(notifications).where(like(notifications.text, `%${text} ${w.t}%`))).map((n) => n.userId);
    await sendDueReminders(now);
    assert.deepEqual(await heard("Due soon: Soon"), [w.sup1.id]);
    assert.ok((await heard("Overdue: Late pool")).includes(w.sales.id), "the pool is told");
    assert.deepEqual(await heard("Due soon: Far"), [], "not due yet");
    assert.deepEqual(await heard("Due soon: Undated"), []);
    assert.deepEqual(await heard("Due soon: Finished"), [], "done is done");

    const sent = (await heard("Due soon: Soon")).length;
    await sendDueReminders(now);
    assert.equal((await heard("Due soon: Soon")).length, sent, "once only");
    // A new date earns a new reminder.
    await editItem(w.sup1, a.id, { dueAt: new Date(now.getTime() + 3 * 3_600_000) });
    await sendDueReminders(now);
    assert.equal((await heard("Due soon: Soon")).length, sent + 1);
  } finally {
    await w.clean();
  }
});

test("the super admin sees each person's load and the pools", async () => {
  const w = await team();
  try {
    const past = new Date(Date.now() - 864e5);
    must(await createItem(w.admin, { title: `A ${w.t}`, dueAt: past, target: { userId: w.sup1.id } }));
    const b = must(await createItem(w.admin, { title: `B ${w.t}`, dueAt: new Date(Date.now() + 864e5), target: { userId: w.sup1.id } }));
    must(await createItem(w.admin, { title: `C ${w.t}`, dueAt: null, target: { role: "reviewer" } }));
    await setStatus(w.sup1, b.id, "done");

    const load = await workload();
    const me = load.people.find((p) => p.id === w.sup1.id)!;
    assert.deepEqual([me.open, me.overdue, me.doneWeek, me.onTimePct], [1, 1, 1, 100]);
    assert.equal(typeof me.hours, "number");
    assert.ok(load.people.some((p) => p.id === w.rev.id) && !load.people.some((p) => p.id === w.clientId || p.id === w.bannedId));
    assert.ok((load.pools.find((p) => p.role === "reviewer")?.n ?? 0) >= 1);
  } finally {
    await w.clean();
  }
});
