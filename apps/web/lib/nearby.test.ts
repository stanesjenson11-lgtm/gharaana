// Run: pnpm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { nearbyPlaces, nearestMetro } from "./nearby.ts";
import { LOCALITIES } from "./places.ts";

test("nearby places are the closest few, nearest first, within range", () => {
  const [lat, lng] = LOCALITIES.Indiranagar;
  const near = nearbyPlaces(lat, lng);
  for (const [kind, max, within] of [["metro", 2, 3000], ["school", 3, 2000], ["hospital", 3, 2000]] as const) {
    const list = near[kind];
    assert.ok(list.length > 0 && list.length <= max, kind);
    assert.ok(list.every((p, i) => p.metres <= within && (i === 0 || list[i - 1].metres <= p.metres)), kind);
  }
  assert.equal(nearestMetro(lat, lng).name, near.metro[0].name);
  assert.ok(nearestMetro(lat, lng).metres < 1500, "Indiranagar has a station close by");
});
