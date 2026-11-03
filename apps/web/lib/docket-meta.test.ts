// The docket's date rules and options. No database.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dueBucket, dueInputs, dueText, istDate, nextDue, parseDue, presetDue, scopesFor, todayRange } from "./docket-meta.ts";

const at = (iso: string) => new Date(iso);
// 19 Oct 2026, 11:30 am in India.
const NOW = at("2026-10-19T11:30:00+05:30");

test("a due date is a day in India: the end of it unless a time is given, and never a day that doesn't exist", () => {
  assert.equal(parseDue("2026-10-21")?.toISOString(), at("2026-10-21T23:59:00+05:30").toISOString());
  assert.equal(parseDue("2026-10-21", "09:30")?.toISOString(), at("2026-10-21T09:30:00+05:30").toISOString());
  assert.equal(parseDue(""), null);
  assert.equal(parseDue(undefined), null);
  for (const bad of ["2026-02-31", "21-10-2026", "tomorrow", "2026-13-01"]) assert.equal(parseDue(bad), undefined, bad);
  assert.equal(parseDue("2026-10-21", "9:30"), undefined);
  assert.equal(istDate(at("2026-10-19T23:30:00Z")), "2026-10-20", "late evening UTC is already tomorrow in India");
});

test("quick choices count from today in India", () => {
  assert.equal(istDate(presetDue("today", NOW)!), "2026-10-19");
  assert.equal(istDate(presetDue("tomorrow", NOW)!), "2026-10-20");
  assert.equal(istDate(presetDue("3d", NOW)!), "2026-10-22");
  assert.equal(istDate(presetDue("week", NOW)!), "2026-10-26");
  assert.equal(presetDue("", NOW), null);
  assert.equal(presetDue("someday", NOW), undefined);
});

test("overdue, today, soon and later, with today ending at midnight in India", () => {
  const b = (iso: string) => dueBucket(at(iso), NOW);
  assert.equal(dueBucket(null, NOW), "none");
  assert.equal(b("2026-10-19T09:00:00+05:30"), "overdue", "a time that has passed");
  assert.equal(b("2026-10-19T23:59:00+05:30"), "today", "a date with no time runs to the end of the day");
  assert.equal(b("2026-10-20T00:30:00+05:30"), "soon");
  assert.equal(b("2026-10-26T23:59:00+05:30"), "soon");
  assert.equal(b("2026-10-27T10:00:00+05:30"), "later");
  assert.equal(b("2026-10-18T23:59:00+05:30"), "overdue");
  const [start, end] = todayRange(NOW);
  assert.deepEqual([start.toISOString(), end.toISOString()], [at("2026-10-19T00:00:00+05:30").toISOString(), at("2026-10-20T00:00:00+05:30").toISOString()]);
});

test("repeats fall after now, skipping missed periods, and months keep to the end of short ones", () => {
  assert.equal(nextDue(null, "none", NOW), null);
  assert.equal(istDate(nextDue(at("2026-10-19T23:59:00+05:30"), "daily", NOW)!), "2026-10-20");
  assert.equal(istDate(nextDue(at("2026-10-12T23:59:00+05:30"), "weekly", NOW)!), "2026-10-19", "this week's is still ahead");
  assert.equal(istDate(nextDue(at("2026-10-05T23:59:00+05:30"), "weekly", NOW)!), "2026-10-19");
  assert.equal(istDate(nextDue(at("2026-10-19T23:59:00+05:30"), "weekly", NOW)!), "2026-10-26");
  assert.equal(istDate(nextDue(at("2026-10-01T23:59:00+05:30"), "daily", NOW)!), "2026-10-19", "missed days are skipped");
  assert.equal(istDate(nextDue(at("2026-01-31T23:59:00+05:30"), "monthly", at("2026-01-31T12:00:00+05:30"))!), "2026-02-28");
  assert.equal(istDate(nextDue(at("2026-10-19T23:59:00+05:30"), "monthly", NOW)!), "2026-11-19");
  assert.equal(istDate(nextDue(null, "weekly", NOW)!), "2026-10-26", "no date: counted from now");
  assert.equal(dueInputs(nextDue(at("2026-10-12T09:30:00+05:30"), "weekly", NOW)!).time, "09:30", "a time of day carries over");
});

test("due dates read in plain words", () => {
  assert.equal(dueText(null, NOW), "No date");
  assert.equal(dueText(at("2026-10-19T23:59:00+05:30"), NOW), "Today");
  assert.equal(dueText(at("2026-10-19T17:00:00+05:30"), NOW), "Today, 5:00 pm");
  assert.equal(dueText(at("2026-10-20T23:59:00+05:30"), NOW), "Tomorrow");
  assert.equal(dueText(at("2026-10-18T23:59:00+05:30"), NOW), "Overdue by a day");
  assert.equal(dueText(at("2026-10-14T23:59:00+05:30"), NOW), "Overdue by 5 days");
  assert.equal(dueText(at("2026-10-19T09:00:00+05:30"), NOW), "Overdue, 9:00 am");
  assert.match(dueText(at("2026-10-23T23:59:00+05:30"), NOW), /^Fri,? 23 Oct$|^Fri 23 Oct$/);
  assert.deepEqual(dueInputs(at("2026-10-23T23:59:00+05:30")), { date: "2026-10-23", time: "" });
  assert.deepEqual(dueInputs(null), { date: "", time: "" });
});

test("only the super admin sees everyone's work", () => {
  assert.ok(scopesFor("admin").some(([v]) => v === "team"));
  for (const r of ["reviewer", "support", "sales"]) assert.ok(!scopesFor(r).some(([v]) => v === "team"));
});
