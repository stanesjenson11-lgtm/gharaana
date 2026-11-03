"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { DANGER, INDIGO, INK, loadMapLibre, MAP_LIMITS, MAP_STYLE, VERIFIED } from "@/lib/maplibre";

type NearbyPlace = { name: string; lat: number; lng: number; kind: "metro" | "school" | "hospital" };

/** Approximate location only: a 400 m circle, never a pin on the building, plus nearby places. Loads when scrolled near. */
export function LocationMap({ lat, lng, places = [] }: { lat: number; lng: number; places?: NearbyPlace[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let map: import("maplibre-gl").Map | undefined;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        try {
          const ml = await loadMapLibre();
          map = new ml.Map({
            container: el,
            style: MAP_STYLE,
            center: [lng, lat],
            zoom: 14.2,
            maxBounds: MAP_LIMITS,
            cooperativeGestures: true,
            attributionControl: { compact: true },
          });
          map.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
          map.on("load", () => {
            map!.addSource("approx", { type: "geojson", data: circle(lng, lat, 400) });
            map!.addLayer({ id: "approx-fill", type: "fill", source: "approx", paint: { "fill-color": INDIGO, "fill-opacity": 0.12 } });
            map!.addLayer({ id: "approx-line", type: "line", source: "approx", paint: { "line-color": INDIGO, "line-width": 2 } });
            if (!places.length) return;
            map!.addSource("places", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: places.map((p) => ({ type: "Feature", properties: { name: p.name, kind: p.kind }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })),
              },
            });
            map!.addLayer({
              id: "places-dot",
              type: "circle",
              source: "places",
              paint: {
                "circle-radius": 6,
                "circle-color": ["match", ["get", "kind"], "metro", INK, "school", VERIFIED, DANGER],
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 2,
              },
            });
            map!.addLayer({
              id: "places-name",
              type: "symbol",
              source: "places",
              layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-offset": [0, 1.1], "text-anchor": "top", "text-max-width": 10 },
              paint: { "text-color": INK, "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
            });
            // Fit the circle and every place, so far-off stations stay on screen.
            const b = new ml.LngLatBounds([lng, lat], [lng, lat]);
            for (const p of places) b.extend([p.lng, p.lat]);
            map!.fitBounds(b, { padding: 48, maxZoom: 14.2, duration: 0 });
          });        } catch {
          setFailed(true);
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      map?.remove();
    };
    // places is derived from lat/lng on the server, so it can't change without them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-surface">
      <div ref={box} className="h-full w-full" />
      {failed && <p className="absolute inset-0 grid place-items-center text-[14px] text-muted">The map couldn&rsquo;t load.</p>}
    </div>
  );
}

function circle(lng: number, lat: number, metres: number) {
  const ring: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    ring.push([
      lng + (metres / (111_320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a),
      lat + (metres / 110_540) * Math.sin(a),
    ]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [ring] } };
}
