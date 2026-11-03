// Metro stations, schools and hospitals near a home. Server-only: the snapshot is ~120 KB and must never reach a browser bundle.
// Data: lib/nearby-places.json, an OpenStreetMap snapshot made by scripts/fetch-nearby.mjs.
import places from "./nearby-places.json" with { type: "json" };
import { haversine } from "./search.ts";

type Row = [string, number, number];
export type Place = { name: string; lat: number; lng: number; metres: number };
export const PLACES_SOURCE = places.source;

// ponytail: a linear scan over ~2,600 rows per listing render, on a cached page. Add a grid index if a page ever lists hundreds.
function nearest(rows: Row[], lat: number, lng: number, n: number, within: number): Place[] {
  return rows
    .map(([name, la, ln]) => ({ name, lat: la, lng: ln, metres: haversine(lat, lng, la, ln) }))
    .filter((p) => p.metres <= within)
    .sort((a, b) => a.metres - b.metres)
    .slice(0, n);
}

/** The nearest metro station, however far; for tiles and the listing summary. */
export function nearestMetro(lat: number, lng: number) {
  const [m] = nearest(places.metro as Row[], lat, lng, 1, Infinity);
  return { name: m?.name ?? "", metres: m?.metres ?? Infinity };
}

/** What a buyer checks first: up to 2 metro stations within 3 km, and 3 schools and 3 hospitals within 2 km. */
export function nearbyPlaces(lat: number, lng: number) {
  return {
    metro: nearest(places.metro as Row[], lat, lng, 2, 3000),
    school: nearest(places.school as Row[], lat, lng, 3, 2000),
    hospital: nearest(places.hospital as Row[], lat, lng, 3, 2000),
  };
}
