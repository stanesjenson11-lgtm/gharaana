import assert from "node:assert/strict";
import { test } from "node:test";
import { cumulative, donutSlices, niceMax, pctChange, percents } from "./chart.ts";

test("axis tops are round numbers that always fit the data", () => {
  assert.deepEqual([0, 1, 1.2, 2, 3, 7, 11, 130, 4500].map(niceMax), [1, 1, 2, 2, 5, 10, 20, 200, 5000]);
  for (const n of [1, 3, 9, 17, 49, 51, 999]) assert.ok(niceMax(n) >= n);
});

test("percentages always add up to exactly 100, and to 0 when there is nothing", () => {
  assert.deepEqual(percents([1, 1, 1]), [34, 33, 33]);
  assert.equal(percents([5, 3, 9, 1, 7]).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(percents([0, 0]), [0, 0]);
  assert.deepEqual(percents([4]), [100]);
});

test("a donut gives each non-empty value a slice, and a lone value fills the whole ring", () => {
  const some = donutSlices([2, 0, 2], 60, 60, 50, 30);
  assert.equal(some.length, 3);
  assert.ok(some[0].startsWith("M ") && some[1] === "" && some[2].startsWith("M "));
  const whole = donutSlices([7], 60, 60, 50, 30);
  assert.equal(whole[0].match(/ A /g)?.length, 4, "two halves, each with an outer and an inner arc");
  assert.deepEqual(donutSlices([0, 0], 60, 60, 50, 30), ["", ""]);
});

test("running totals and percentage change", () => {
  assert.deepEqual(cumulative([1, 0, 2, 3]), [1, 1, 3, 6]);
  assert.equal(pctChange(4, 5), 25);
  assert.equal(pctChange(5, 4), -20);
  assert.equal(pctChange(0, 3), null, "no base, no percentage");
});
