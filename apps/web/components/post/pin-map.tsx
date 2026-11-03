"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibre, Marker } from "maplibre-gl";
import { INDIGO, loadMapLibre, MAP_LIMITS, MAP_STYLE } from "@/lib/maplibre";

/** Click (or drag the pin) to mark the building. `centre` is [lat, lng] of the chosen locality. */
export function PinMap({ pin, onPin, centre }: { pin: [number, number] | null; onPin: (p: [number, number]) => void; centre?: [number, number] }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const marker = useRef<Marker | null>(null);
  const latest = useRef(onPin);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    latest.current = onPin;
  });

  useEffect(() => {
    let cancelled = false;
    loadMapLibre()
      .then((ml) => {
        if (cancelled || !box.current) return;
        const m = new ml.Map({
          container: box.current,
          style: MAP_STYLE,
          center: [77.5946, 12.9716],
          zoom: 11,
          maxBounds: MAP_LIMITS,
          cooperativeGestures: true,
          attributionControl: { compact: true },
        });
        m.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
        const place = (lng: number, lat: number) => {
          if (!marker.current) {
            marker.current = new ml.Marker({ color: INDIGO, draggable: true }).setLngLat([lng, lat]).addTo(m);
            marker.current.on("dragend", () => {
              const ll = marker.current!.getLngLat();
              latest.current([ll.lat, ll.lng]);
            });
          } else marker.current.setLngLat([lng, lat]);
          latest.current([lat, lng]);
        };
        m.on("click", (e) => place(e.lngLat.lng, e.lngLat.lat));
        map.current = m;
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      map.current?.remove();
    };
  }, []);

  // Jump to the locality the owner typed, until they've placed a pin themselves.
  useEffect(() => {
    if (centre && !pin) map.current?.flyTo({ center: [centre[1], centre[0]], zoom: 14.5, duration: 600 });
  }, [centre, pin]);

  return (
    <div className="relative h-80 overflow-hidden rounded-xl border border-hairline bg-surface">
      <div ref={box} className="h-full w-full" />
      {failed && <p className="absolute inset-0 grid place-items-center p-6 text-center text-[14px] text-muted">The map couldn&rsquo;t load. We&rsquo;ll use the locality you typed.</p>}
    </div>
  );
}
