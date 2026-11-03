import assert from "node:assert/strict";
import { test } from "node:test";
import { IDLE_MS, idlePhase, idleTooLong, SERVER_IDLE_MS, WARN_MS } from "./idle.ts";

test("five idle minutes bring the warning, a minute later the sign-out", () => {
  const t0 = 1_000_000;
  assert.deepEqual(idlePhase(t0, t0), { phase: "active" });
  assert.deepEqual(idlePhase(t0, t0 + IDLE_MS - 1), { phase: "active" });
  assert.deepEqual(idlePhase(t0, t0 + IDLE_MS), { phase: "warning", secondsLeft: 60 });
  assert.deepEqual(idlePhase(t0, t0 + IDLE_MS + 15_000), { phase: "warning", secondsLeft: 45 });
  assert.deepEqual(idlePhase(t0, t0 + IDLE_MS + WARN_MS - 1), { phase: "warning", secondsLeft: 1 });
  assert.deepEqual(idlePhase(t0, t0 + IDLE_MS + WARN_MS), { phase: "expired" });
  assert.deepEqual(idlePhase(t0, t0 + 24 * 3_600_000), { phase: "expired" }, "a laptop that slept all night");
  assert.deepEqual(idlePhase(t0 + 10, t0), { phase: "active" }, "a clock that stepped back");
});

test("the server drops a session unused past the warning, with a minute of slack", () => {
  const seen = new Date("2026-10-19T10:00:00Z");
  const after = (ms: number) => seen.getTime() + ms;
  assert.ok(!idleTooLong(seen, after(IDLE_MS + WARN_MS)), "the browser signs out first");
  assert.ok(!idleTooLong(seen, after(SERVER_IDLE_MS)));
  assert.ok(idleTooLong(seen, after(SERVER_IDLE_MS + 1)));
  assert.ok(idleTooLong(seen.getTime(), after(SERVER_IDLE_MS + 1)), "a timestamp works too");
});
