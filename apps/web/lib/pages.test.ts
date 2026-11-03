// Runs against the dev database, like listings.test.ts.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, pool } from "./db.ts";
import { publishedPage, publishedPosts, readPage, savePage } from "./pages.ts";
import { slugify, toBlocks } from "./prose.ts";
import { pages } from "./schema.ts";

after(() => pool.end());

test("plain-text pages become headings, lists and paragraphs, with no HTML", () => {
  assert.deepEqual(toBlocks("## Getting around\r\n\r\nTwo metro lines\nmeet here.\n\n- Lift\n- <b>Gym</b>\n\n"), [
    { type: "h2", text: "Getting around" },
    { type: "p", text: "Two metro lines meet here." },
    { type: "ul", items: ["Lift", "<b>Gym</b>"] },
  ]);
  assert.equal(slugify("  HSR Layout: 2026 guide! "), "hsr-layout-2026-guide");
});

test("pages: checked, unique per address, and hidden until published", async () => {
  const f = (o: Record<string, string>) => {
    const d = new FormData();
    for (const [k, v] of Object.entries(o)) d.set(k, v);
    return d;
  };
  assert.match((readPage(f({ kind: "area", area: "atlantis", title: "Atlantis guide", body: "x".repeat(50) })) as { error: string }).error, /which area/);
  const read = readPage(f({ kind: "post", title: `Test post ${Date.now()}`, body: "Stamp duty in Karnataka is 5 per cent for most buyers in the city." }));
  assert.ok("page" in read);
  const slug = read.page.slug;
  try {
    assert.deepEqual(await savePage(null, read.page, null), { ok: true });
    assert.equal(await publishedPage("post", slug), undefined, "drafts stay hidden");
    assert.deepEqual(await savePage(null, read.page, null), { ok: false, error: "Another post already uses that web address." });

    const [row] = await db.select().from(pages).where(eq(pages.slug, slug));
    await savePage(row.id, { ...read.page, published: true }, null);
    const live = await publishedPage("post", slug);
    assert.ok(live?.publishedAt);
    assert.ok((await publishedPosts()).some((p) => p.slug === slug));
  } finally {
    await db.delete(pages).where(eq(pages.slug, slug));
  }
});
