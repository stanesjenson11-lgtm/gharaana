// MapLibre finds its worker next to its own bundle, which Turbopack renames. Serve it from /public instead.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const src = createRequire(import.meta.url).resolve("maplibre-gl/dist/maplibre-gl-worker.mjs");
mkdirSync(new URL("../public/", import.meta.url), { recursive: true }); // a fresh clone has no public/: its one file is ignored
copyFileSync(src, new URL("../public/maplibre-gl-worker.mjs", import.meta.url));
