// The tour is one master timeline measured in "ticks". Everything below is in ticks.
export const TOTAL = 110;

export type Stop = {
  id: string;
  rail: string; // label in the stop rail
  at: number; // where a click on the rail lands
  title: string;
  line: string;
  tone: "ink" | "paper"; // caption colour
};

// ponytail: copy is placeholder-safe (no prices, stats, or addresses); swap in real lines when they exist.
export const STOPS: Stop[] = [
  { id: "sky", rail: "Skyline", at: 12, title: "From above, the skyline.", line: "Start wide, then come down to one address.", tone: "ink" },
  { id: "tower", rail: "Tower", at: 27, title: "Closer, one tower.", line: "Every floor is a line, and every line is somewhere to live.", tone: "ink" },
  { id: "inside", rail: "Inside", at: 58, title: "Inside, the light is on.", line: "Step through the window and into a home.", tone: "ink" },
  { id: "plan", rail: "Plan", at: 76, title: "Room by room.", line: "The same home, seen from above.", tone: "ink" },
  { id: "hood", rail: "Neighbourhood", at: 90, title: "Then the neighbourhood.", line: "The tower and its plaza, the park next door, the river in front.", tone: "ink" },
  { id: "close", rail: "Evening", at: 109, title: "", line: "", tone: "paper" },
];

// Where the nav and rail switch between ink and white, in ticks.
export const TONE_BREAKS: [number, "ink" | "paper"][] = [
  [0, "ink"],
  [100, "paper"],
];
