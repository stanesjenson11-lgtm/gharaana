import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync } from "node:fs";
import { can, canHandOff, CONSOLE_PAGE_ROUTES, consoleNeeds, homeFor, meetsNeed, SECTIONS, STAFF_ROLES } from "./roles.ts";

test("each role opens only its own sections; nobody else opens any", () => {
  for (const s of SECTIONS) assert.ok(can("admin", s), `super admin opens ${s}`);
  assert.ok(can("reviewer", "queue") && !can("reviewer", "plans") && !can("reviewer", "staff"));
  assert.ok(can("support", "support") && !can("support", "leads") && !can("support", "queue"));
  assert.ok(can("sales", "leads") && can("sales", "users") && !can("sales", "queue") && !can("sales", "support") && !can("sales", "listings"));
  assert.ok(can("reviewer", "listings") && !can("support", "listings"));
  for (const not of ["member", "", "Admin", null, undefined]) for (const s of SECTIONS) assert.ok(!can(not, s), `${String(not)} opens ${s}`);
});

test("a role's landing page is one it can open, so a wrong-section redirect can't loop", () => {
  // Everyone lands on the dashboard, which every role may open.
  for (const r of STAFF_ROLES) {
    assert.equal(homeFor(r), "/admin");
    assert.ok(can(r, "overview"), `${r} opens the dashboard`);
  }
});

test("everyone on the team opens the dashboard and the docket", () => {
  for (const r of STAFF_ROLES) assert.ok(can(r, "docket") && can(r, "overview"));
  assert.ok(!can("member", "docket"));
});

test("work moves between roles the way the team works, and only the super admin hands it to anyone", () => {
  for (const r of STAFF_ROLES) assert.ok(canHandOff(r, r), `${r} keeps work in its own role`);
  for (const r of STAFF_ROLES) assert.ok(canHandOff("admin", r));
  assert.ok(canHandOff("support", "reviewer") && canHandOff("support", "sales") && canHandOff("sales", "support") && canHandOff("reviewer", "support"));
  assert.ok(!canHandOff("sales", "reviewer") && !canHandOff("reviewer", "sales") && !canHandOff("sales", "admin") && !canHandOff("support", "admin"));
  assert.ok(!canHandOff("member", "sales") && !canHandOff("sales", "member"));
});

test("console URLs: each needs its own section, unlisted ones need the super admin, and other URLs are not the console's", () => {
  assert.equal(consoleNeeds("/admin"), "overview");
  assert.equal(consoleNeeds("/admin/clients/abc"), "users");
  assert.equal(consoleNeeds("/admin/docket/12"), "docket");
  assert.equal(consoleNeeds("/admin/verify"), "any");
  assert.equal(consoleNeeds("/api/admin/photo"), "listings");
  assert.equal(consoleNeeds("/api/admin/proof/abc"), "queue");
  assert.equal(consoleNeeds("/admin/brand-new-page"), "admin", "a page nobody listed is for the super admin only");
  assert.equal(consoleNeeds("/api/admin/whatever"), "admin");
  assert.equal(consoleNeeds("/api/admin"), "admin");
  for (const open of ["/", "/homes/x", "/account", "/api/auth/get-session", "/administrator", "/api/uploads"]) assert.equal(consoleNeeds(open), null, open);

  assert.ok(meetsNeed("sales", consoleNeeds("/admin/leads")!) && !meetsNeed("sales", consoleNeeds("/admin/queue")!));
  assert.ok(meetsNeed("admin", "admin") && !meetsNeed("reviewer", "admin"));
  assert.ok(meetsNeed("support", "any") && !meetsNeed("member", "any") && !meetsNeed(undefined, "overview"));
});

test("every folder under the console has a rule, so a new page can't be left open by accident", () => {
  const folders = readdirSync(new URL("../app/(console)/admin", import.meta.url), { withFileTypes: true }).filter((d) => d.isDirectory() && !/^[._(]/.test(d.name)).map((d) => d.name);
  for (const f of folders) assert.ok(CONSOLE_PAGE_ROUTES.includes(f), `/admin/${f} needs an entry in PAGE_ROUTES (lib/roles.ts)`);
});
