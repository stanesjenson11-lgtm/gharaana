// Secrets come from HashiCorp Vault, not from files on the server. At start-up (instrumentation.ts) this reads one KV v2
// secret and puts the values into the process's memory; nothing is written to disk. In production the app refuses to
// start without a Vault, so a forgotten .env file can't quietly stand in for it.
//
// Reaching Vault takes one credential, which must not live in a file either. Give the process a short-lived token
// (Vault Agent writes one for you), or an AppRole whose secret id is wrapped and short-lived. Both are removed from the
// environment as soon as they have been used.
type Env = Record<string, string | undefined>;

/** The values that are secrets. IDs, URLs and template names are not, and stay ordinary settings. */
export const VAULT_SECRETS = ["DATABASE_URL", "BETTER_AUTH_SECRET", "GOOGLE_CLIENT_SECRET", "APPLE_CLIENT_SECRET", "MSG91_AUTH_KEY", "WHATSAPP_TOKEN", "TURNSTILE_SECRET_KEY"] as const;
// Without these the app can't run at all; the rest switch features on.
const REQUIRED = ["DATABASE_URL", "BETTER_AUTH_SECRET"];

async function call(fetcher: typeof fetch, url: string, init: RequestInit) {
  // Only the status is reported: a response body could carry a secret.
  const res = await fetcher(url, { ...init, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Vault answered ${res.status} for ${new URL(url).pathname}`);
  return (await res.json()) as { auth?: { client_token?: string }; data?: { data?: Record<string, unknown> } };
}

/** Loads the secrets into `env` (the process's by default). Returns where they came from and which were set. */
export async function loadSecrets(env: Env = process.env, fetcher: typeof fetch = fetch) {
  const addr = env.VAULT_ADDR?.replace(/\/+$/, "");
  if (!addr) {
    // A production build only compiles; running in production is what has to have a Vault.
    const enforce = env.NODE_ENV === "production" && env.NEXT_PHASE !== "phase-production-build" && env.ALLOW_ENV_SECRETS !== "1";
    if (enforce) throw new Error("VAULT_ADDR is not set. In production the secrets come from Vault, not from the server's files.");
    return { from: "env" as const, loaded: [] as string[] };
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.VAULT_NAMESPACE) headers["X-Vault-Namespace"] = env.VAULT_NAMESPACE;
  let token = env.VAULT_TOKEN;
  if (!token) {
    if (!env.VAULT_ROLE_ID || !env.VAULT_SECRET_ID) throw new Error("Set VAULT_TOKEN, or VAULT_ROLE_ID and VAULT_SECRET_ID, so the app can reach Vault.");
    const login = await call(fetcher, `${addr}/v1/auth/approle/login`, { method: "POST", headers, body: JSON.stringify({ role_id: env.VAULT_ROLE_ID, secret_id: env.VAULT_SECRET_ID }) });
    token = login.auth?.client_token;
    if (!token) throw new Error("Vault accepted the login but sent no token.");
  }

  const body = await call(fetcher, `${addr}/v1/${env.VAULT_MOUNT ?? "secret"}/data/${env.VAULT_SECRET_PATH ?? "directnest/web"}`, { headers: { ...headers, "X-Vault-Token": token } });
  const stored = body.data?.data ?? {};
  const loaded: string[] = [];
  for (const name of VAULT_SECRETS) {
    const value = stored[name];
    if (typeof value === "string" && value) {
      env[name] = value;
      loaded.push(name);
    }
  }
  const missing = REQUIRED.filter((n) => !env[n]);
  if (missing.length) throw new Error(`Vault has no value for ${missing.join(", ")}.`);

  // The key to the vault has done its job: take it out of the environment so nothing else can read or print it.
  delete env.VAULT_TOKEN;
  delete env.VAULT_SECRET_ID;
  return { from: "vault" as const, loaded };
}
