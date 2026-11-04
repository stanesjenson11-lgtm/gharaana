// The tour is one master timeline measured in "ticks". Everything below is in ticks.
export const TOTAL = 110;

/** public/brand/logo-*.svg (made by scripts/logo-svg.ts from components/brand/logo-paths.ts); bump with the logo. */
export const LOGO_V = "?v=1";

/** public/tour-* (film, tick table, posters, tower mask); bump with any of them. */
export const FILM_V = "?v=17";

export type Stop = {
  id: string;
  title: string;
  line: string;
  tone: "ink" | "paper"; // caption colour
};

// ponytail: copy is placeholder-safe (no prices, stats, or addresses); swap in real lines when they exist.
export const STOPS: Stop[] = [
  { id: "sky", title: "From above, the skyline.", line: "Start wide, then come down to one address.", tone: "ink" },
  { id: "tower", title: "Closer, one tower.", line: "Every floor is a line, and every line is somewhere to live.", tone: "ink" },
  { id: "inside", title: "Inside, the light is on.", line: "Step through the window and into a home.", tone: "ink" },
  { id: "plan", title: "Room by room.", line: "The same home, seen from above.", tone: "ink" },
  { id: "hood", title: "Then the neighbourhood.", line: "The tower and its plaza, the park next door, the river in front.", tone: "ink" },
];

// Where the nav and rail switch between ink and white, in ticks. The tour now ends back on the bright opening view,
// so the nav stays dark throughout (the closing panel has its own dark scrim for its white text).
export const TONE_BREAKS: [number, "ink" | "paper"][] = [
  [0, "ink"],
];
