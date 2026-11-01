// Screenshots of the 3D tour at given ticks (default: the six stops). Needs the site on :3125 (next start -p 3125).
// Usage: node shoot.mjs [tick ...]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openTour } from "./cdp.mjs";

const OUT = join(import.meta.dirname, "shots");
mkdirSync(OUT, { recursive: true });
const STOPS = process.argv.length > 2
  ? Object.fromEntries(process.argv.slice(2).map((t) => [`t${t}`, +t]))
  : { sky: 12, tower: 27, inside: 58, plan: 76, hood: 90, evening: 109 };

const tour = await openTour({ url: "http://localhost:3125/?debug&quality=high", width: 1600, height: 900, port: 9333 });
try {
  for (const [name, tick] of Object.entries(STOPS)) {
    await tour.setTick(tick, 30); // let the reflection capture and shadows settle
    writeFileSync(join(OUT, `${name}.jpg`), await tour.shot());
    console.log("shot", name);
  }
} finally { tour.close(); }
