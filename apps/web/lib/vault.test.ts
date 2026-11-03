// The Vault loader, against a small stand-in for Vault's HTTP API.
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { test } from "node:test";
import { loadSecrets } from "./vault.ts";

type Seen = { path: string; token?: string; namespace?: string; body?: string };

async function withVault(run: (url: string, seen: Seen[]) => Promise<void>, handler?: (req: IncomingMessage) => { status: number; json: unknown } | null) {
  const seen: Seen[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    seen.push({ path: req.url ?? "", token: req.headers["x-vault-token"] as string, namespace: req.headers["x-vault-namespace"] as string, body });
    const custom = handler?.(req);
    if (custom) {
      res.writeHead(custom.status).end(JSON.stringify(custom.json));
    } else if (req.url === "/v1/auth/approle/login") {
      const ok = JSON.parse(body).role_id === "role-1" && JSON.parse(body).secret_id === "secret-1";
      res.writeHead(ok ? 200 : 403).end(JSON.stringify({ auth: { client_token: "tok-1" } }));
    } else if (req.url === "/v1/secret/data/directnest/web" && req.headers["x-vault-token"] === "tok-1") {
      res.writeHead(200).end(JSON.stringify({ data: { data: { DATABASE_URL: "postgres://vault-db", BETTER_AUTH_SECRET: "vault-secret", TURNSTILE_SECRET_KEY: "vault-turnstile", SOMETHING_ELSE: "ignored" } } }));
    } else res.writeHead(403).end(JSON.stringify({ errors: ["permission denied"] }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    await run(`http://127.0.0.1:${(server.address() as { port: number }).port}`, seen);
  } finally {
    server.close();
  }
}

test("without a Vault: fine in development, refused in production unless it is deliberate or only a build", async () => {
  assert.deepEqual(await loadSecrets({ NODE_ENV: "development" }), { from: "env", loaded: [] });
  await assert.rejects(loadSecrets({ NODE_ENV: "production" }), /VAULT_ADDR is not set/);
  assert.equal((await loadSecrets({ NODE_ENV: "production", ALLOW_ENV_SECRETS: "1" })).from, "env");
  assert.equal((await loadSecrets({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).from, "env");
});

test("an AppRole login fetches the secrets into the environment, only the known ones, and the keys are removed", async () => {
  await withVault(async (url, seen) => {
    const env: Record<string, string | undefined> = { VAULT_ADDR: `${url}/`, VAULT_ROLE_ID: "role-1", VAULT_SECRET_ID: "secret-1", VAULT_NAMESPACE: "team-a", TURNSTILE_SECRET_KEY: "from-a-file" };
    const r = await loadSecrets(env);
    assert.deepEqual(r, { from: "vault", loaded: ["DATABASE_URL", "BETTER_AUTH_SECRET", "TURNSTILE_SECRET_KEY"] });
    assert.deepEqual([env.DATABASE_URL, env.BETTER_AUTH_SECRET], ["postgres://vault-db", "vault-secret"]);
    assert.equal(env.TURNSTILE_SECRET_KEY, "vault-turnstile", "Vault wins over a file");
    assert.equal(env.SOMETHING_ELSE, undefined, "only the listed secrets are taken");
    assert.equal(env.VAULT_SECRET_ID, undefined);
    assert.equal(env.VAULT_TOKEN, undefined);
    assert.ok(seen.every((s) => s.namespace === "team-a"));
    assert.equal(seen[1].token, "tok-1");
  });
});

test("a token from the platform skips the login", async () => {
  await withVault(async (url, seen) => {
    const env: Record<string, string | undefined> = { VAULT_ADDR: url, VAULT_TOKEN: "tok-1" };
    assert.equal((await loadSecrets(env)).from, "vault");
    assert.deepEqual(seen.map((s) => s.path), ["/v1/secret/data/directnest/web"]);
    assert.equal(env.VAULT_TOKEN, undefined);
  });
});

test("failures are loud and never print a secret", async () => {
  await assert.rejects(loadSecrets({ VAULT_ADDR: "http://127.0.0.1:1" }), /VAULT_TOKEN, or VAULT_ROLE_ID/);
  await withVault(async (url) => {
    await assert.rejects(loadSecrets({ VAULT_ADDR: url, VAULT_ROLE_ID: "role-1", VAULT_SECRET_ID: "wrong" }), (e: Error) => /Vault answered 403/.test(e.message) && !e.message.includes("wrong"));
  });
  // A secret path that lacks a required value stops the start-up instead of running half-configured.
  await withVault(
    async (url) => {
      await assert.rejects(loadSecrets({ VAULT_ADDR: url, VAULT_TOKEN: "t" }), /no value for BETTER_AUTH_SECRET/);
    },
    (req) => (req.url?.includes("/data/") ? { status: 200, json: { data: { data: { DATABASE_URL: "postgres://x" } } } } : null),
  );
});
