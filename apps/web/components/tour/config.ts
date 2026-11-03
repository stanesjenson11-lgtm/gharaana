// The tour is one master timeline measured in "ticks"; the film (apps/web/film/path.py) is keyed in the same ticks.
export const TOTAL = 125;

export type Stop = {
  id: string;
  kicker?: string; // small script line above the title
  title: string;
  line: string;
  tone: "ink" | "paper"; // caption colour
};

// Each line names something the app really does (search, listing checks, photos and video, filters, shortlists, the map).
// ponytail: no prices, stats or addresses; the scene is an illustrative model.
export const STOPS: Stop[] = [
  { id: "sky", kicker: "Bengaluru", title: "From above, the city.", line: "Start with an area, a metro line or a project.", tone: "ink" },
  { id: "tower", kicker: "Verified", title: "Closer, one building.", line: "A person checks every listing before it goes live.", tone: "ink" },
  { id: "inside", kicker: "Living room", title: "Inside, room by room.", line: "Photos and video tours before you visit.", tone: "ink" },
  { id: "kitchen", kicker: "Kitchen", title: "The details that matter.", line: "Filter by BHK, floor, parking and amenities.", tone: "ink" },
  { id: "rooms", kicker: "Bedrooms", title: "Picture yourself here.", line: "Shortlist homes and save your searches.", tone: "ink" },
  { id: "plan", kicker: "Floor plan", title: "The same home, from above.", line: "Every room, seen from above.", tone: "ink" },
  { id: "hood", kicker: "Neighbourhood", title: "Then the neighbourhood.", line: "Schools, hospitals and the metro, on the map.", tone: "ink" },
  { id: "close", title: "", line: "", tone: "paper" },
];

// When each caption is on screen [in, out], in ticks.
export const CAPTIONS: Record<string, [number, number]> = {
  sky: [7, 15], tower: [21, 33], inside: [52, 59.5], kitchen: [60.5, 65], rooms: [66.5, 80], plan: [87, 95], hood: [101, 109.5],
};

// Map pins over the neighbourhood shot fade in and out (positions come from the film, components/tour/film.json).
export const PIN_FADE: [number, number][] = [[0, 0], [101, 0], [103.5, 1], [108.5, 1], [110.5, 0]];

/** Piecewise lookup in a [tick, value] table, eased between rows. */
export function pw(table: [number, number][], t: number) {
  if (t <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (t <= table[i][0]) {
      const [t0, v0] = table[i - 1], [t1, v1] = table[i];
      const k = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * k * k * (3 - 2 * k);
    }
  }
  return table[table.length - 1][1];
}
