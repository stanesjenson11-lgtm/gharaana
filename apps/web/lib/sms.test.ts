// Run: pnpm test. Talks to a stubbed fetch, never to MSG91.
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { sendOtpSms, smsConfigured } from "./sms.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("the code goes to MSG91 with the template, the number without its +, and the key in a header", async () => {
  process.env.MSG91_AUTH_KEY = "test-key";
  process.env.MSG91_OTP_TEMPLATE_ID = "tmpl-1";
  assert.equal(smsConfigured(), true);
  let seen: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = (async (url: URL, init?: RequestInit) => {
    seen = { url: String(url), init };
    return Response.json({ type: "success", request_id: "abc" });
  }) as typeof fetch;

  await sendOtpSms("+919876543210", "482913");
  const u = new URL(seen!.url);
  assert.equal(u.origin + u.pathname, "https://control.msg91.com/api/v5/otp");
  assert.deepEqual(Object.fromEntries(u.searchParams), { template_id: "tmpl-1", mobile: "919876543210", otp: "482913" });
  assert.equal(seen!.init?.method, "POST");
  assert.equal((seen!.init?.headers as Record<string, string>).authkey, "test-key");
});

test("an MSG91 error stops sign-in with a message that leaks neither the code nor the key", async () => {
  globalThis.fetch = (async () => Response.json({ type: "error", message: "Invalid template" }, { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(sendOtpSms("+919876543210", "482913"), (e: Error) => /Invalid template/.test(e.message) && !/482913|test-key/.test(e.message));
});
