// "Sign in with Apple" wants a signed token (ES256) in place of a client secret, and Apple caps it at six months.
// scripts/apple-secret.ts prints a fresh one; put it in APPLE_CLIENT_SECRET and renew it before it runs out.
import { createSign } from "node:crypto";

const SIX_MONTHS = 15_777_000; // seconds: the longest Apple accepts

const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** team: Apple developer Team ID. keyId: the key's ID. services: the Services ID (also APPLE_CLIENT_ID). key: the .p8 file's text. */
export function appleClientSecret({ team, keyId, services, key, now = Date.now() }: { team: string; keyId: string; services: string; key: string; now?: number }) {
  const iat = Math.floor(now / 1000);
  const head = part({ alg: "ES256", kid: keyId });
  const body = part({ iss: team, iat, exp: iat + SIX_MONTHS, aud: "https://appleid.apple.com", sub: services });
  const sig = createSign("SHA256").update(`${head}.${body}`).sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${head}.${body}.${sig}`;
}
