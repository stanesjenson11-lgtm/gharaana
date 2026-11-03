// Run: pnpm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearch } from "./parse-search.ts";
import { DEFAULT_TYPE, RENTALS, toQuery } from "./search.ts";

test("junk params fall back to safe defaults", () => {
  const p = parseSearch({ bhk: "abc", max: "-5", sort: "nope", bbox: "1,2", type: "lease", floor: "attic", amen: "Moat" });
  assert.deepEqual([p.type, p.sort, p.max, p.bbox], [DEFAULT_TYPE, "relevant", undefined, undefined]);
  assert.deepEqual([p.bhk, p.floor, p.amen], [[], [], []]);
});

test("rent links become sale searches while rentals are off", { skip: RENTALS }, () => {
  assert.equal(parseSearch({ type: "rent" }).type, "buy");
});

test("query round-trips and drops defaults", () => {
  const p = parseSearch({ type: "rent", bhk: "2,3", sort: "relevant", q: "HSR Layout" });
  assert.equal(toQuery(p), "q=HSR+Layout&bhk=2%2C3");
  assert.deepEqual(parseSearch(Object.fromEntries(new URLSearchParams(toQuery(p)))), p);
});
