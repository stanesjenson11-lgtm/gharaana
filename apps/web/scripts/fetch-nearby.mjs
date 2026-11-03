// Refreshes lib/nearby-places.json: named schools, hospitals and metro stations in Bengaluru from OpenStreetMap (ODbL, credit shown on listings).
//   node scripts/fetch-nearby.mjs
// ponytail: one static snapshot, refreshed by hand a few times a year; a live places API only if the client wants more cities.
import { writeFileSync } from "node:fs";

const BOX = "12.80,77.40,13.25,77.85"; // south,west,north,east around the city
const query = `[out:json][timeout:120];
(nwr["amenity"="school"]["name"](${BOX}); nwr["amenity"="hospital"]["name"](${BOX}); nwr["railway"="station"]["station"="subway"](${BOX}););
out center tags;`;

const res = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Gharaana nearby-places snapshot" },
  body: new URLSearchParams({ data: query }),
});
if (!res.ok) throw new Error(`Overpass answered ${res.status}`);
const { elements } = await res.json();

const out = { source: "© OpenStreetMap contributors (ODbL)", fetched: new Date().toISOString().slice(0, 10), school: [], hospital: [], metro: [] };
const seen = new Set();
for (const e of elements) {
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  const name = e.tags?.["name:en"] ?? e.tags?.name;
  const kind = e.tags?.railway === "station" ? "metro" : e.tags?.amenity;
  if (lat == null || lng == null || !name || !(kind in out)) continue;
  const row = [name.trim(), Number(lat.toFixed(5)), Number(lng.toFixed(5))];
  const key = `${kind}|${row[0].toLowerCase()}|${row[1].toFixed(3)}|${row[2].toFixed(3)}`; // same place mapped as node and area
  if (seen.has(key)) continue;
  seen.add(key);
  out[kind].push(row);
}

writeFileSync(new URL("../lib/nearby-places.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(`${out.school.length} schools, ${out.hospital.length} hospitals, ${out.metro.length} metro stations`);
