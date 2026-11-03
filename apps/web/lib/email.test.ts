import assert from "node:assert/strict";
import test from "node:test";
import { emailConfigured, sendOtpEmail } from "./email.ts";

test("email: configured only with a Resend key", () => {
  const key = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  assert.equal(emailConfigured(), false);
  process.env.RESEND_API_KEY = "re_test";
  assert.equal(emailConfigured(), true);
  if (key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = key;
});

test("email: posts the code to Resend and fails loudly on an error", async () => {
  const realFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "re_test";
  let sent: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => { sent = { url, init }; return new Response("{}", { status: 200 }); }) as typeof fetch;
  try {
    await sendOtpEmail("a@example.com", "123456");
    assert.equal(sent!.url, "https://api.resend.com/emails");
    assert.equal((sent!.init.headers as Record<string, string>).Authorization, "Bearer re_test");
    const body = JSON.parse(String(sent!.init.body));
    assert.deepEqual(body.to, ["a@example.com"]);
    assert.match(body.subject, /123456/);
    assert.match(body.text, /123456/);

    globalThis.fetch = (async () => new Response("bad from", { status: 422 })) as unknown as typeof fetch;
    await assert.rejects(sendOtpEmail("a@example.com", "123456"), /Resend answered 422/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.RESEND_API_KEY;
  }
});
