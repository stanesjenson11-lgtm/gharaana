// Shared headless-Chrome driver for shoot.mjs and record.mjs.
// Poly Haven downloads stall inside headless Chrome, so every dl.polyhaven.org request is intercepted and served from
// a local cache (.asset-cache), filled with plain fetches (6 at a time, with retries) the first time a file is asked for.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const HERE = import.meta.dirname;
const CACHE = join(HERE, ".asset-cache");
mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { gltf: "model/gltf+json", bin: "application/octet-stream", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

let active = 0;
const queue = [];
const slot = () => (active < 6 ? (active++, Promise.resolve()) : new Promise((r) => queue.push(r)));
const free = () => { const next = queue.shift(); if (next) next(); else active--; };

async function cached(url) {
  const file = join(CACHE, createHash("sha1").update(url).digest("hex"));
  if (existsSync(file)) return { status: 200, body: readFileSync(file) };
  if (existsSync(file + ".404")) return { status: 404, body: Buffer.alloc(0) };
  await slot();
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(90000) });
        if (r.status === 404) { writeFileSync(file + ".404", ""); return { status: 404, body: Buffer.alloc(0) }; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = Buffer.from(await r.arrayBuffer());
        writeFileSync(file, body);
        return { status: 200, body };
      } catch (e) {
        if (attempt >= 4) { console.log("asset failed", url, e.message); return { status: 502, body: Buffer.alloc(0) }; }
        await sleep(2000 * (attempt + 1));
      }
    }
  } finally { free(); }
}

export async function openTour({ url, width, height, port }) {
  const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${join(HERE, ".chrome-profile")}`,
    `--window-size=${width},${height}`, "--ignore-gpu-blocklist", "--use-angle=d3d11", "--enable-gpu-rasterization", "about:blank",
  ], { stdio: "ignore" });
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  ws.onmessage = async (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); return; }
    if (m.method !== "Fetch.requestPaused") return;
    const u = m.params.request.url;
    const { status, body } = await cached(u);
    const ext = u.split("?")[0].split(".").pop().toLowerCase();
    send("Fetch.fulfillRequest", {
      requestId: m.params.requestId, responseCode: status, body: body.toString("base64"),
      responseHeaders: [{ name: "Content-Type", value: TYPES[ext] ?? "application/octet-stream" }, { name: "Access-Control-Allow-Origin", value: "*" }],
    });
  };
  await send("Fetch.enable", { patterns: [{ urlPattern: "https://dl.polyhaven.org/*" }] });
  const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  for (let i = 0; i < 120; i++) { await sleep(500); if (await evalJs(`!!window.__gh && document.querySelector('.stage')?.dataset.world === 'ready'`)) break; }
  // furniture starts on a 10 s timer; wait until World marks it (and the plaza props) placed, or give up after 6 min
  // the shoot/record scripts need the 3D world, which only mounts when the URL has ?mode=3d
  for (let i = 0; i < 720 && !(await evalJs(`!!(window.__gh && __gh.marks && __gh.marks["furnished@"] && (__gh.q?.plazaProps ? __gh.marks["plaza@"] : 1))`)); i++) await sleep(500);
  console.log("tier", await evalJs("__gh.q.tier"), "furnished", await evalJs(`__gh.marks["furnished@"] ?? "NO"`));
  await sleep(3000); // late textures
  // canvas only: hide the HTML layer (and any dev overlay) so the frames show just the 3D scene
  await evalJs(`document.head.appendChild(Object.assign(document.createElement('style'),{textContent:
    '.stage > :not(canvas), .perf-hud, nextjs-portal {visibility:hidden !important} html{scrollbar-width:none}'})); 1`);
  const shot = async () => Buffer.from((await send("Page.captureScreenshot", { format: "jpeg", quality: 95 })).result.data, "base64");
  const setTick = (t, frames = 2) => evalJs(`new Promise(r => { __gh.setTick(${t}); let n = ${frames}; const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); })`);
  return { send, evalJs, shot, setTick, close: () => { ws.close(); chrome.kill(); } };
}
