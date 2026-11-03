import assert from "node:assert/strict";
import { test } from "node:test";
import { mfaToken, mfaValid } from "./admin-mfa.ts";

const at = (iso: string) => new Date(iso).getTime();

test("second-factor cookie is valid only for its session, until the day ends in India, untampered", () => {
  const now = at("2026-10-19T09:00:00+05:30");
  const t = mfaToken("s3cret", "sess-1", now);
  assert.ok(mfaValid("s3cret", "sess-1", t, now + 1));
  assert.ok(mfaValid("s3cret", "sess-1", t, at("2026-10-19T23:59:59+05:30")), "all day");
  assert.ok(!mfaValid("s3cret", "sess-1", t, at("2026-10-20T00:00:00+05:30")), "not into the next day");
  assert.ok(!mfaValid("s3cret", "sess-2", t, now + 1), "another session");
  assert.ok(!mfaValid("other", "sess-1", t, now + 1), "another secret");
  assert.ok(!mfaValid("s3cret", "sess-1", `${at("2026-10-22T00:00:00+05:30")}.${t.split(".")[1]}`, now + 1), "expiry edited");
  assert.ok(!mfaValid("s3cret", "sess-1", undefined, now));
  assert.ok(!mfaValid("s3cret", "sess-1", "garbage", now));
});
