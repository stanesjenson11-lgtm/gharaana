// Start-up work that needs Node (so it stays out of instrumentation.ts, which is also compiled for the edge runtime):
// fetch the secrets from Vault (lib/vault.ts) before the server answers anything.
import { loadSecrets } from "./lib/vault";

export async function start() {
  const serving = process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build"; // not a build
  try {
    const { from, loaded } = await loadSecrets();
    if (from === "vault") console.log(`[vault] ${loaded.length} secrets loaded`);
    else if (serving) console.warn("[vault] secrets are coming from the server's environment (ALLOW_ENV_SECRETS=1)");
  } catch (e) {
    console.error(`[vault] ${e instanceof Error ? e.message : e}`);
    // Never serve without the secrets. Exiting, rather than throwing, so the process manager restarts it and raises the alarm:
    // a thrown error would leave a server up that answers every request with a 500.
    if (serving) process.exit(1);
  }
}
