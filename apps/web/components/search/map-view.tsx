"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibre, Marker } from "maplibre-gl";
import { inr, inrShort } from "@/lib/format";
import type { Card } from "@/lib/listings";
import { INDIGO, loadMapLibre, MAP_LIMITS, MAP_STYLE } from "@/lib/maplibre";

const BENGALURU: [number, number] = [77.5946, 12.9716];

type Props = {
  cards: Card[];
  highlightId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  area?: number[];
  bbox?: number[];
  centre?: [number, number]; // [lat, lng]
  fitKey: string; // camera refits when this changes (a new place was searched)
  onMoved: (bbox: number[]) => void;
  drawing: boolean;
  onDrawn: (area: number[] | null) => void;
  visible: boolean;
};

const pinLabel = (c: Card) => (c.type === "rent" ? inrShort(c.price + c.maintenance) : inrShort(c.price));

export function MapView(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const pins = useRef(new Map<string, { marker: Marker; el: HTMLButtonElement }>());
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const latest = useRef(p);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Event handlers read the newest props without re-binding.
  useEffect(() => {
    latest.current = p;
  });

  useEffect(() => {
    let cancelled = false;
    loadMapLibre()
      .then((ml) => {
        if (cancelled || !box.current) return;
        lib.current = ml;
        const m = new ml.Map({
          container: box.current,
          style: MAP_STYLE,
          center: BENGALURU,
          zoom: 11,
          minZoom: 9.5,
          maxBounds: MAP_LIMITS,
          attributionControl: { compact: true },
        });
        m.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");
        m.on("load", () => {
          m.addSource("area", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          m.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": INDIGO, "fill-opacity": 0.08 } });
          m.addLayer({
            id: "area-line",
            type: "line",
            source: "area",
            paint: { "line-color": INDIGO, "line-width": 2.5, "line-dasharray": [2, 1.5] },
          });
          setReady(true);
        });
        // Only moves the person made (drag, wheel, pinch) count; our own fitBounds calls carry no originalEvent.
        m.on("moveend", (e) => {
          if (!e.originalEvent) return;
          const b = m.getBounds();
          latest.current.onMoved([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
        });
        // Zoomed out, price labels collide; show dots until the person zooms in.
        const far = () => box.current?.parentElement?.classList.toggle("map-far", m.getZoom() < 12.5);
        m.on("zoomend", far);
        m.on("load", far);
        m.on("error", (e) => {
          if (!m.loaded() && /style|fetch|network/i.test(String(e.error?.message))) setFailed(true);
        });
        map.current = m;
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Pins: rebuilt per result set (≤ a few hundred). ponytail: cluster with supercluster past ~300 pins per view.
  useEffect(() => {
    const m = map.current;
    const ml = lib.current;
    if (!ready || !m || !ml) return;
    pins.current.forEach(({ marker }) => marker.remove());
    pins.current.clear();
    for (const c of p.cards) {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = pinLabel(c);
      el.setAttribute("aria-label", `${c.title}, ${c.type === "rent" ? `${inr(c.price + c.maintenance)} a month` : inr(c.price)}`);
      el.className =
        "map-pin cursor-pointer rounded-full border border-hairline bg-canvas px-2 py-0.5 text-[12px] font-semibold text-ink tabular-nums shadow-[0_2px_6px_-2px_oklch(0.22_0.025_266/0.35)] transition-[background-color,color,transform] duration-150 ease-out-quint hover:scale-105 data-[on=true]:scale-110 data-[on=true]:border-streetlight data-[on=true]:bg-streetlight data-[on=true]:text-dusk";
      el.addEventListener("mouseenter", () => latest.current.onHover(c.id));
      el.addEventListener("mouseleave", () => latest.current.onHover(null));
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        latest.current.onSelect(c.id);
      });
      const marker = new ml.Marker({ element: el, anchor: "bottom" }).setLngLat([c.lng, c.lat]).addTo(m);
      pins.current.set(c.id, { marker, el });
    }
  }, [ready, p.cards]);

  useEffect(() => {
    pins.current.forEach(({ el, marker }, id) => {
      const on = id === p.highlightId;
      el.dataset.on = String(on);
      marker.getElement().style.zIndex = on ? "10" : "";
    });
  }, [p.highlightId, p.cards, ready]);

  // Drawn area outline.
  useEffect(() => {
    const src = map.current?.getSource("area") as import("maplibre-gl").GeoJSONSource | undefined;
    if (!ready || !src) return;
    const ring = toRing(p.area);
    src.setData({
      type: "FeatureCollection",
      features: ring ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] : [],
    });
  }, [ready, p.area]);

  // Camera: fit once on load, then again only when a new place is searched.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const { area, bbox, cards, centre } = latest.current;
    const ring = toRing(area);
    const points: [number, number][] = ring ?? (bbox ? [[bbox[0], bbox[1]], [bbox[2], bbox[3]]] : cards.map((c) => [c.lng, c.lat]));
    if (points.length > 1) {
      const lngs = points.map((pt) => pt[0]);
      const lats = points.map((pt) => pt[1]);
      m.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], {
        padding: bbox && !ring ? 0 : { top: 80, bottom: 48, left: 56, right: 56 }, // top clears the map controls
        maxZoom: 14.5,
        duration: 0,
      });
    } else if (points.length === 1) m.jumpTo({ center: points[0], zoom: 14 });
    else if (centre) m.jumpTo({ center: [centre[1], centre[0]], zoom: 13.5 });
  }, [ready, p.fitKey]);

  useEffect(() => {
    if (p.visible) map.current?.resize();
  }, [p.visible]);

  // Freehand drawing: drag a loop, release to search inside it.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !p.drawing) return;
    const surface = m.getCanvasContainer();
    const src = m.getSource("area") as import("maplibre-gl").GeoJSONSource;
    const pts: [number, number][] = [];
    m.dragPan.disable();
    surface.style.cursor = "crosshair";
    surface.style.touchAction = "none";

    const at = (e: PointerEvent): [number, number] => {
      const r = surface.getBoundingClientRect();
      const ll = m.unproject([e.clientX - r.left, e.clientY - r.top]);
      return [ll.lng, ll.lat];
    };
    const down = (e: PointerEvent) => {
      surface.setPointerCapture(e.pointerId);
      pts.length = 0;
      pts.push(at(e));
    };
    const move = (e: PointerEvent) => {
      if (!pts.length) return;
      pts.push(at(e));
      src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts } });
    };
    const up = () => {
      if (pts.length < 8) return latest.current.onDrawn(null);
      const step = Math.max(1, Math.floor(pts.length / 40)); // keep URLs short
      latest.current.onDrawn(pts.filter((_, i) => i % step === 0).flat());
    };
    surface.addEventListener("pointerdown", down);
    surface.addEventListener("pointermove", move);
    surface.addEventListener("pointerup", up);
    return () => {
      surface.removeEventListener("pointerdown", down);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", up);
      surface.style.cursor = "";
      surface.style.touchAction = "";
      m.dragPan.enable();
    };
  }, [ready, p.drawing]);

  return (
    <div className="relative h-full w-full bg-surface">
      {/* h-full, not absolute: maplibre-gl.css forces position: relative on this element. */}
      <div ref={box} className="h-full w-full" />
      {!ready && !failed && (
        <div className="absolute inset-0 grid place-items-center text-[14px] text-muted" aria-live="polite">
          Loading map…
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-[14px] text-muted" role="alert">
          The map couldn&rsquo;t load. The list still shows every home that matches.
        </div>
      )}
    </div>
  );
}

function toRing(flat?: number[]): [number, number][] | null {
  if (!flat || flat.length < 6) return null;
  const ring: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) ring.push([flat[i], flat[i + 1]]);
  return [...ring, ring[0]];
}
