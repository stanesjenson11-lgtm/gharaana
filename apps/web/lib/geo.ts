// Deterministic helpers for generated markup. Seeded so server and client render the same thing.

export const r1 = (n: number) => Math.round(n * 10) / 10;

/** Small seeded PRNG (LCG). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
