// Headless-Chrome screenshots of each tour stop via the ?debug __gh.setTick hook.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dirname, "shots");
mkdirSync(OUT, { recursive: true });
const URL = "http://localhost:3125/?debug";
const STOPS = { sky: 12, tower: 27, inside: 58, plan: 76, hood: 90, evening: 109 };
const PORT = 9333;

const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(import.meta.dirname, "prof")}`,
  "--window-size=1600,900", "--ignore-gpu-blocklist", "--use-angle=d3d11", "--enable-gpu-rasterization", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let tabs;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).catch(() => null); }
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); };
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  for (let i = 0; i < 120; i++) { await sleep(500); if (await evalJs(`!!window.__gh && document.querySelector('.stage')?.dataset.world === 'ready'`)) break; }
  console.log("ready; waiting for furniture + textures");
  await sleep(16000); // furniture loads on a 10s timer
  // canvas only: hide the HTML layer so the AI sees just the 3D scene
  await evalJs(`document.head.appendChild(Object.assign(document.createElement('style'),{textContent:'.stage > :not(canvas), .perf-hud {visibility:hidden !important}'})); 1`);

  for (const [name, tick] of Object.entries(STOPS)) {
    await evalJs(`__gh.setTick(${tick}); 1`);
    await sleep(3500);
    const { result } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(result.data, "base64"));
    console.log("shot", name);
  }
  ws.close();
} finally { chrome.kill(); }
