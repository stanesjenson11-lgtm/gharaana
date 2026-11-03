// Local dev Postgres: a private cluster on port 5440, trusting local connections only.
// Uses an installed PostgreSQL's binaries (PG_BIN) and touches no system service or global config.
//   node scripts/db.mjs start | stop | status
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Kept outside the repo on purpose: Postgres writes constantly, and inside the project the dev server's
// file watcher would rebuild (and reload the browser) on every write.
const root = process.env.PG_DATA ?? join(process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share"), "directnest");
const data = join(root, "pg");
const port = process.env.PG_PORT ?? "5440";
const bin = process.env.PG_BIN ?? (process.platform === "win32" ? "C:\\Program Files\\PostgreSQL\\16\\bin" : "");
const exe = (name) => (bin ? join(bin, name) : name);

function run(name, args, opts = {}) {
  const r = spawnSync(exe(name), args, { encoding: "utf8", ...opts });
  if (r.error) throw new Error(`${name}: ${r.error.message}. Set PG_BIN to your PostgreSQL bin folder.`);
  if (r.status !== 0 && !opts.allowFail) throw new Error(`${name} failed:\n${r.stderr || r.stdout}`);
  return r;
}

const cmd = process.argv[2];
if (cmd === "start") {
  if (!existsSync(join(data, "PG_VERSION"))) {
    mkdirSync(data, { recursive: true });
    run("initdb", ["-D", data, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"]);
    console.log(`Created a dev database cluster in ${data}`);
  }
  if (run("pg_ctl", ["-D", data, "status"], { allowFail: true }).status !== 0) {
    // listen_addresses=localhost keeps it off the network; -w waits until it accepts connections.
    run("pg_ctl", ["-D", data, "-l", join(root, "pg.log"), "-o", `-p ${port} -c listen_addresses=localhost`, "-w", "start"], { stdio: "ignore" });
  }
  const exists = run("psql", ["-h", "localhost", "-p", port, "-U", "postgres", "-tAc", "SELECT 1 FROM pg_database WHERE datname = 'directnest'"]);
  if (!exists.stdout.includes("1")) run("createdb", ["-h", "localhost", "-p", port, "-U", "postgres", "directnest"]);
  console.log(`Postgres is running: postgres://postgres@localhost:${port}/directnest`);
} else if (cmd === "stop") {
  run("pg_ctl", ["-D", data, "-m", "fast", "stop"], { allowFail: true });
  console.log("Postgres stopped.");
} else if (cmd === "status") {
  console.log(run("pg_ctl", ["-D", data, "status"], { allowFail: true }).stdout.trim() || "Not running.");
} else {
  console.log("Usage: node scripts/db.mjs start | stop | status");
}
