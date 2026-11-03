// The staff sign-in rhythm's building blocks. No database.
import assert from "node:assert/strict";
import { test } from "node:test";
import { dayToken, dayUser, endOfDay, secondsLeftToday, startedToday, totpValid } from "./staff-day.ts";

const at = (iso: string) => new Date(iso);

test("today's text-message record names one person, for this day only, and can't be forged", () => {
  const now = at("2026-10-19T11:30:00+05:30");
  const t = dayToken("s3cret", "user-1", now);
  assert.equal(dayUser("s3cret", t, now), "user-1");
  assert.equal(dayUser("s3cret", t, at("2026-10-19T23:59:00+05:30")), "user-1", "valid to the end of the day");
  assert.equal(dayUser("s3cret", t, at("2026-10-20T00:00:30+05:30")), null, "the next day starts again with a text message");
  assert.equal(dayUser("other", t, now), null, "another secret");
  assert.equal(dayUser("s3cret", t.replace("user-1", "user-2"), now), null, "another person's name on it");
  assert.equal(dayUser("s3cret", `${t}x`, now), null);
  for (const bad of [undefined, "", "garbage", "a.b", "..", "user-1.2026-10-19"]) assert.equal(dayUser("s3cret", bad, now), null, String(bad));
  // User ids may contain dots; the name is whatever comes before the day and the signature.
  assert.equal(dayUser("s3cret", dayToken("s3cret", "a.b.c", now), now), "a.b.c");
});

test("a day runs to midnight in India, and a session belongs to the day it began", () => {
  const now = at("2026-10-19T23:00:00+05:30");
  assert.equal(endOfDay(now).toISOString(), at("2026-10-20T00:00:00+05:30").toISOString());
  assert.equal(secondsLeftToday(now), 3600);
  assert.ok(startedToday(at("2026-10-19T00:05:00+05:30"), now));
  assert.ok(!startedToday(at("2026-10-18T23:59:00+05:30"), now), "yesterday's session is over");
  assert.ok(secondsLeftToday(at("2026-10-19T23:59:59.900+05:30")) >= 1);
});

test("authenticator codes follow RFC 6238 and allow one step of drift, no more", () => {
  const secret = "12345678901234567890"; // the RFC's SHA-1 test key
  const rfc = (seconds: number, code: string) => totpValid(secret, code, seconds * 1000);
  assert.ok(rfc(59, "287082") && rfc(1111111109, "081804") && rfc(1111111111, "050471") && rfc(1234567890, "005924") && rfc(2000000000, "279037"));
  assert.ok(!rfc(59, "287083"));
  assert.ok(rfc(59 + 30, "287082"), "a code one step old");
  assert.ok(rfc(59 - 30, "287082"), "and one step early");
  assert.ok(!rfc(59 + 90, "287082"), "but not three steps old");
  for (const bad of ["", "28708", "2870822", "abcdef", "28 7082"]) assert.ok(!rfc(59, bad), bad);
});
