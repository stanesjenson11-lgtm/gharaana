// Prints the client secret "Sign in with Apple" needs. It lasts six months; run this again before then.
//   pnpm apple-secret <TEAM_ID> <KEY_ID> <SERVICES_ID> <path to AuthKey_XXXX.p8>
import { readFileSync } from "node:fs";
import { appleClientSecret } from "../lib/apple-secret.ts";

const [team, keyId, services, keyPath] = process.argv.slice(2);
if (!team || !keyId || !services || !keyPath) {
  console.error("Usage: pnpm apple-secret <TEAM_ID> <KEY_ID> <SERVICES_ID> <path to AuthKey_XXXX.p8>");
  process.exit(1);
}
console.log(appleClientSecret({ team, keyId, services, key: readFileSync(keyPath, "utf8") }));
