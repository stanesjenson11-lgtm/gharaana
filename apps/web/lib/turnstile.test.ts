import test from "node:test";
import assert from "node:assert/strict";
import { verifyTurnstileToken } from "./turnstile.ts";

test("turnstile: passes automatically in dev when secret is unset", async () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;
  const originalEnv = process.env.NODE_ENV;
  const envObj = process.env as Record<string, string | undefined>;
  try {
    delete process.env.TURNSTILE_SECRET_KEY;
    envObj.NODE_ENV = "development";
    const res = await verifyTurnstileToken(undefined);
    assert.equal(res.success, true);
  } finally {
    process.env.TURNSTILE_SECRET_KEY = originalSecret;
    envObj.NODE_ENV = originalEnv;
  }
});

test("turnstile: rejects empty token when secret is configured", async () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;
  try {
    process.env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";
    const res = await verifyTurnstileToken("");
    assert.equal(res.success, false);
    assert.match(res.error || "", /token is required/i);
  } finally {
    process.env.TURNSTILE_SECRET_KEY = originalSecret;
  }
});

test("turnstile: calls siteverify endpoint with credentials", async () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;
  const originalFetch = globalThis.fetch;
  try {
    process.env.TURNSTILE_SECRET_KEY = "dummy-secret";
    let capturedBody = "";

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = String(init?.body || "");
      return new Response(JSON.stringify({ success: true, challenge_ts: new Date().toISOString() }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const res = await verifyTurnstileToken("sample-token", "203.0.113.1");
    assert.equal(res.success, true);
    assert.ok(capturedBody.includes("secret=dummy-secret"));
    assert.ok(capturedBody.includes("response=sample-token"));
    assert.ok(capturedBody.includes("remoteip=203.0.113.1"));
  } finally {
    process.env.TURNSTILE_SECRET_KEY = originalSecret;
    globalThis.fetch = originalFetch;
  }
});

test("turnstile: captures error codes on verification failure", async () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;
  const originalFetch = globalThis.fetch;
  try {
    process.env.TURNSTILE_SECRET_KEY = "dummy-secret";

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response", "timeout-or-duplicate"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const res = await verifyTurnstileToken("bad-token");
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("invalid-input-response"));
  } finally {
    process.env.TURNSTILE_SECRET_KEY = originalSecret;
    globalThis.fetch = originalFetch;
  }
});
