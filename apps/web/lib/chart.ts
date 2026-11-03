// The arithmetic behind the console's charts. Pure functions, so the SVG components stay plain markup.

/** The smallest "round" number (1, 2, 5 times a power of ten) that is at least n: a tidy top for an axis. */
export function niceMax(n: number) {
  if (!(n > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  const f = n / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** Whole-number percentages of `values` that add up to exactly 100 (largest remainders), or all 0 when there is nothing. */
export function percents(values: number[]) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => (v * 100) / total);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - floors[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left-- <= 0) break;
    floors[i]++;
  }
  return floors;
}

const point = (cx: number, cy: number, r: number, a: number) => `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy - r * Math.cos(a)).toFixed(2)}`;

/**
 * Path data for each slice of a donut: angles run clockwise from 12 o'clock. A slice that fills the whole ring is
 * drawn as two halves, because one arc from a point back to itself draws nothing.
 */
export function donutSlices(values: number[], cx: number, cy: number, r: number, inner: number) {
  const total = values.reduce((a, b) => a + b, 0);
  let from = 0;
  return values.map((v) => {
    const sweep = total > 0 ? (v / total) * Math.PI * 2 : 0;
    const a0 = from;
    from += sweep;
    if (sweep <= 0) return "";
    const ring = (s: number, e: number) => `M ${point(cx, cy, r, s)} A ${r} ${r} 0 ${e - s > Math.PI ? 1 : 0} 1 ${point(cx, cy, r, e)} L ${point(cx, cy, inner, e)} A ${inner} ${inner} 0 ${e - s > Math.PI ? 1 : 0} 0 ${point(cx, cy, inner, s)} Z`;
    return sweep >= Math.PI * 2 - 1e-6 ? `${ring(a0, a0 + Math.PI)} ${ring(a0 + Math.PI, a0 + Math.PI * 2 - 1e-4)}` : ring(a0, a0 + sweep);
  });
}

/** Running totals: [1, 0, 2, 3] → [1, 1, 3, 6]. */
export const cumulative = (values: number[]) => values.reduce<number[]>((acc, v) => [...acc, (acc.at(-1) ?? 0) + v], []);

/** Percentage change from `before` to `after`, rounded; null when there is no base to compare with. */
export const pctChange = (before: number, after: number) => (before > 0 ? Math.round(((after - before) * 100) / before) : null);
