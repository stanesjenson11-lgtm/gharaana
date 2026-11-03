// Writes the landscape logo lockup as static SVG files (public/brand/), the same drawing as components/brand/Logo.tsx.
// The home page shows these as <img>, so the 22 KB of path data is fetched once and cached instead of being inlined
// into the HTML twice, the page's server payload and the hero's script. Usage: node scripts/logo-svg.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { LOGO } from "../components/brand/logo-paths.ts";

const BLUE = "#1560bd", SUN = "#ffda1a", INK = "#001238";
const TONES = {
  color: { line: BLUE, base: SUN, word: INK },
  "on-dark": { line: BLUE, base: SUN, word: "#fff" },
  white: { line: "#fff", base: SUN, word: "#fff" },
};
const WORD_S = (LOGO.markH * 0.55) / LOGO.wordH, GAP = 150; // as in Logo.tsx
const W = 1000 + GAP + 1000 * WORD_S, wy = (LOGO.markH - LOGO.wordH * WORD_S) / 2;

mkdirSync("public/brand", { recursive: true });
for (const [name, f] of Object.entries(TONES)) {
  writeFileSync(`public/brand/logo-${name}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${LOGO.markH}">` +
    `<path d="${LOGO.blue}" fill="${f.line}"/><path d="${LOGO.yellow}" fill="${f.base}"/>` +
    `<g transform="translate(${1000 + GAP} ${wy - LOGO.wordTop * WORD_S}) scale(${WORD_S})"><path d="${LOGO.word}" fill="${f.word}"/></g></svg>`);
}
console.log(`public/brand/logo-{${Object.keys(TONES).join(",")}}.svg, ${W.toFixed(1)} x ${LOGO.markH}`);
