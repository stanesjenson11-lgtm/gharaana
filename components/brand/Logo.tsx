import { LOGO } from "./logo-paths";

type Tone = "color" | "white" | "ink";

const FILL: Record<Tone, { line: string; base: string; word: string }> = {
  color: { line: "var(--blue)", base: "var(--sun)", word: "var(--ink)" },
  white: { line: "#fff", base: "var(--sun)", word: "#fff" },
  ink: { line: "var(--ink)", base: "var(--ink)", word: "var(--ink)" },
};

/** The contour-line towers on their own. */
export function LogoMark({ tone = "color", className }: { tone?: Tone; className?: string }) {
  const f = FILL[tone];
  return (
    <svg viewBox={`0 0 1000 ${LOGO.markH}`} className={className} aria-hidden="true" focusable="false">
      <path d={LOGO.blue} fill={f.line} />
      <path d={LOGO.yellow} fill={f.base} />
    </svg>
  );
}

// Landscape lockup: wordmark height is 55% of the mark, centred on it (brand kit p.4).
const WORD_S = (LOGO.markH * 0.55) / LOGO.wordH;
const GAP = 150;
const LOCKUP_W = 1000 + GAP + 1000 * WORD_S;

/** Landscape lockup: mark + wordmark. Accessible name "Gharaana". */
export function Logo({ tone = "color", className }: { tone?: Tone; className?: string }) {
  const f = FILL[tone];
  const wy = (LOGO.markH - LOGO.wordH * WORD_S) / 2;
  return (
    <svg
      viewBox={`0 0 ${LOCKUP_W.toFixed(1)} ${LOGO.markH}`}
      className={className}
      role="img"
      aria-label="Gharaana"
    >
      <path d={LOGO.blue} fill={f.line} />
      <path d={LOGO.yellow} fill={f.base} />
      <g transform={`translate(${1000 + GAP} ${wy - LOGO.wordTop * WORD_S}) scale(${WORD_S})`}>
        <path d={LOGO.word} fill={f.word} />
      </g>
    </svg>
  );
}
