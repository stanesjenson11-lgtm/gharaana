import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { appleClientSecret } from "./apple-secret.ts";

test("the Apple client secret is an ES256 token Apple's public key side can verify, good for six months", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const now = Date.UTC(2026, 9, 18);
  const token = appleClientSecret({ team: "TEAM123456", keyId: "KEY1234567", services: "in.directnest.web", key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), now });
  const [head, body, sig] = token.split(".");
  const json = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString());

  assert.deepEqual(json(head), { alg: "ES256", kid: "KEY1234567" });
  const claims = json(body);
  assert.equal(claims.iss, "TEAM123456");
  assert.equal(claims.sub, "in.directnest.web");
  assert.equal(claims.aud, "https://appleid.apple.com");
  assert.equal(claims.exp - claims.iat, 15_777_000, "Apple's six-month ceiling");

  const ok = createVerify("SHA256").update(`${head}.${body}`).verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"));
  assert.ok(ok, "signature verifies");
  assert.ok(!createVerify("SHA256").update(`${head}.${body}x`).verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")), "and fails if the claims change");
});
