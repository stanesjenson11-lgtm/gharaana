// Record the 3D tour's real camera path (ticks 0-110) frame by frame into one continuous video.
// Needs the site running with ?debug (exposes __gh.setTick). Usage: node record.mjs [url]
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const URL = process.argv[2] ?? "http://localhost:3125/?debug";
const FPS = 24, TICKS_PER_SEC = 3.5, TOTAL = 110; // 110 ticks -> ~31.4 s
const W = 1280, H = 720, PORT = 9334;
const DIR = join(import.meta.dirname, "videos");
const FRAMES = join(DIR, "frames");
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(DIR, ".prof")}`,
  `--window-size=${W},${H}`, "--ignore-gpu-blocklist", "--use-angle=d3d11", "--enable-gpu-rasterization", "about:blank",
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

  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  for (let i = 0; i < 120; i++) { await sleep(500); if (await evalJs(`!!window.__gh && document.querySelector('.stage')?.dataset.world === 'ready'`)) break; }
  await sleep(16000); // furniture loads on a 10 s timer
  await evalJs(`document.head.appendChild(Object.assign(document.createElement('style'),{textContent:
    '.stage > :not(canvas), .perf-hud, nextjs-portal {visibility:hidden !important} html{scrollbar-width:none}'})); 1`);
  // warm up every part of the path once so shader compiles and env rebuilds don't land in the recording
  for (let t = 0; t <= TOTAL; t += 5) await evalJs(`new Promise(r => { __gh.setTick(${t}); requestAnimationFrame(() => requestAnimationFrame(r)); })`);

  const n = Math.round((TOTAL / TICKS_PER_SEC) * FPS);
  for (let f = 0; f <= n; f++) {
    const tick = (f / n) * TOTAL;
    await evalJs(`new Promise(r => { __gh.setTick(${tick}); requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))); })`);
    const { result } = await send("Page.captureScreenshot", { format: "jpeg", quality: 95 });
    writeFileSync(join(FRAMES, `${String(f).padStart(5, "0")}.jpg`), Buffer.from(result.data, "base64"));
    if (f % 100 === 0) console.log(`frame ${f}/${n}`);
  }
  ws.close();
} finally { chrome.kill(); }

execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", join(FRAMES, "%05d.jpg"),
  "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", join(DIR, "tour-3d.mp4")]);
rmSync(FRAMES, { recursive: true, force: true });
console.log("wrote", join(DIR, "tour-3d.mp4"));
