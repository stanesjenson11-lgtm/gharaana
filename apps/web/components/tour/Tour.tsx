"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { buildTour } from "./timeline";
import { Captions, Close, Hero, Nav } from "./Chrome";
import { FILM_V as V, TOTAL } from "./config";
import type { World } from "@/components/world/World";
import "./tour.css";

type Tone = "ink" | "paper";

const noop = () => () => {};

const PINS = [
  { id: "tower", label: "This tower" },
  { id: "park", label: "Park" },
  { id: "river", label: "Riverside" },
] as const;

// The film, its tick table and the scroll engine (GSAP, ScrollTrigger) load on the visitor's first scroll, touch or key
// press: the first paint is the HTML and the poster (frame 0 of the film), with no video bytes and little script.
// Laptops and desktops start as soon as the page has loaded, so the film is usually in memory before they scroll.
const WAKE = ["wheel", "touchstart", "pointerdown", "keydown", "scroll"] as const;
const EARLY = "(min-width: 1024px) and (pointer: fine)";
// a small film (540p, about a fifth of the size) that can be scrubbed within a second or so, until the sharp one is in
const QUICK = `/tour-540.mp4${V}`;

/** The scroll tour: default = photoreal film scrubbed by scroll; `?mode=3d` = live three.js (used by ai-renders). */
export default function Tour() {
  const root = useRef<HTMLElement>(null);
  const quick = useRef<HTMLVideoElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<ReturnType<typeof buildTour> | null>(null);
  const pending = useRef<number | null>(null); // a rail/nav jump asked for before the engine had loaded
  const [tone, setTone] = useState<Tone>("ink");
  const [ready, setReady] = useState<"loading" | "ready" | "failed">("loading");
  const [woke, setWoke] = useState(false);
  // browser-only values, read without a setState-in-effect (server render: video mode, no src yet)
  const mode = useSyncExternalStore(noop, () => (new URLSearchParams(location.search).get("mode") === "3d" ? "3d" : "video"), () => "video");
  // a keyframe every 4 frames and no B-frames, so a scroll seek decodes at most 4 frames. 1080p wherever the screen
  // has the pixels for it (laptops, tablets), 720p on phones, where it is already about the screen's own width.
  const src = useSyncExternalStore(noop, () => (innerWidth >= 1024 || innerWidth * devicePixelRatio >= 1600 ? `/tour-1080.mp4${V}` : `/tour-720.mp4${V}`), () => null);
  const awake = woke || mode === "3d"; // the 3D recorder starts at once

  useEffect(() => {
    const wake = () => {
      for (const e of WAKE) removeEventListener(e, wake);
      setWoke(true);
    };
    const early = () => { if (matchMedia(EARLY).matches) wake(); };
    for (const e of WAKE) addEventListener(e, wake, { passive: true });
    if (document.readyState === "complete") early(); else addEventListener("load", early, { once: true });
    return () => {
      for (const e of WAKE) removeEventListener(e, wake);
      removeEventListener("load", early);
    };
  }, []);

  // Each film comes down whole, as a blob, before it plays. Scrubbing then never waits on the network: Safari stops
  // buffering a paused video and fetches each seek's bytes on demand, which is what made the scroll stall there.
  // The quick film first, then the sharp one, one at a time so the first gets the whole connection.
  useEffect(() => {
    if (!awake || mode !== "video" || !src) return;
    const ctl = new AbortController();
    const urls: string[] = [], offs: (() => void)[] = [];
    const load = (v: HTMLVideoElement, file: string) => {
      const stream = () => { v.src = file; }; // no blob, or the browser would not play it: stream the file instead
      const refused = () => { if (v.src.startsWith("blob:")) stream(); };
      v.addEventListener("error", refused, { once: true });
      offs.push(() => v.removeEventListener("error", refused));
      return fetch(file, { signal: ctl.signal })
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
        .then((b) => { const u = URL.createObjectURL(b); urls.push(u); v.src = u; })
        .catch(() => { if (!ctl.signal.aborted) stream(); });
    };
    load(quick.current!, QUICK).then(() => { if (!ctl.signal.aborted) return load(video.current!, src); });
    return () => { ctl.abort(); for (const f of offs) f(); for (const u of urls) URL.revokeObjectURL(u); };
  }, [awake, mode, src]);

  useEffect(() => {
    if (!awake || (mode === "video" && !src)) return;
    let disposed = false;
    let teardown = () => {};
    // Native scroll, no smooth-scroll library: it stays on the browser's scrolling thread (120 Hz on ProMotion Macs,
    // where Safari holds script-driven scrolling to 60). The timeline's own glide smooths the scene (timeline.ts).
    Promise.all([import("gsap"), import("gsap/ScrollTrigger"), import("./timeline")])
      .then(([{ default: gsap }, { ScrollTrigger }, { buildTour }]) => {
        if (disposed) return;
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        gsap.registerPlugin(ScrollTrigger);

        let onTick: (t: number) => void = () => undefined;
        const cleanups: (() => void)[] = [];
        let world: World | null = null;
        let lastTick = 0;

        if (mode === "video") {
          const lo = quick.current!, hi = video.current!;
          let cur: HTMLVideoElement | null = null; // the film being scrubbed: the quick one, then the sharp one
          let want = 0, shown = -1, seeking = false;
          // tick -> film frame: look the frame up in the film's tick table (binary search over a rising list);
          // until the table loads, fall back to a straight proportion
          let ticks: number[] | null = null, fps = 48;
          fetch(`/tour-timing.json${V}`).then((r) => r.json()).then((j: { fps: number; ticks: number[] }) => { ticks = j.ticks; fps = j.fps; }).catch(() => undefined);
          const frameAt = (t: number) => {
            if (!ticks) return (t / TOTAL) * (cur?.duration || 0) * fps;
            let a = 0, b = ticks.length - 1;
            while (a < b) { const mid = (a + b) >> 1; if (ticks[mid] < t) a = mid + 1; else b = mid; }
            return a;
          };
          // Ask for the playhead's frame once the last seek has landed (the timeline already glides, so no easing here).
          // The seek aims at the middle of the frame, so rounding never lands on its neighbour.
          const seek = () => {
            if (!cur || seeking || !cur.duration) return;
            const f = Math.round(want);
            if (f === shown) return;
            seeking = true; shown = f;
            cur.currentTime = Math.min(cur.duration - 0.001, (f + 0.5) / fps);
          };
          const onSeeked = (e: Event) => {
            const v = cur;
            if (!v || e.target !== v) return;
            seeking = false;
            if (!("on" in v.dataset)) {
              // shown once it holds the right frame. The sharp film swaps in at once over the quick one, which then
              // lets go of its decoder.
              v.dataset.on = "";
              if (v === hi) { lo.removeAttribute("src"); lo.load(); }
            }
            seek();
          };
          const onLoaded = (e: Event) => {
            const v = e.target as HTMLVideoElement;
            // Safari draws a paused video's seeked frames only once it has played
            v.play().then(() => { v.pause(); if (v === cur) { shown = -1; seek(); } }).catch(() => undefined);
            if (cur === hi) return; // the sharp film is already in
            cur = v; seeking = false; shown = -1;
            setReady("ready");
            seek();
          };
          for (const v of [lo, hi]) {
            v.muted = true; v.playsInline = true;
            v.addEventListener("loadeddata", onLoaded);
            v.addEventListener("seeked", onSeeked);
          }
          for (const v of [lo, hi]) if (v.readyState >= 2) v.dispatchEvent(new Event("loadeddata"));
          onTick = (t) => { want = frameAt(t); seek(); };
          cleanups.push(() => {
            for (const v of [lo, hi]) { v.removeEventListener("loadeddata", onLoaded); v.removeEventListener("seeked", onSeeked); }
          });
        } else {
          onTick = (t) => { lastTick = t; world?.setTick(t); };
          import("@/components/world/World").then(({ createWorld, PIN_POINTS }) => {
            if (disposed || !canvas.current) return;
            const pins = PINS.map((p) => ({ el: root.current!.querySelector<HTMLElement>(`[data-wpin="${p.id}"]`)!, at: PIN_POINTS[p.id] }));
            world = createWorld(canvas.current, { reduced, pins, onReady: () => setReady("ready") });
            world.setTick(lastTick);
          }).catch(() => setReady("failed"));
          const onResize = () => world?.resize();
          addEventListener("resize", onResize);
          cleanups.push(() => { removeEventListener("resize", onResize); world?.dispose(); });
        }

        const ctx = gsap.context(() => {
          api.current = buildTour(root.current!, { reduced, onTone: setTone, onTick });
        }, root);
        if (pending.current != null) { const t = pending.current; pending.current = null; goToTick(t); }

        teardown = () => {
          for (const c of cleanups) c();
          api.current?.destroy();
          api.current = null;
          ctx.revert();
        };
      })
      .catch(() => setReady("failed"));
    return () => { disposed = true; teardown(); };
  }, [mode, src, awake]);

  function goToTick(tick: number) {
    const y = api.current?.goto(tick);
    if (y == null) { pending.current = tick; return; } // the click woke the tour; jump once it has loaded
    window.scrollTo({ top: y, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  return (
    <section className="tour" ref={root} aria-label="Gharaana tour">
      <div className="stage" data-world={ready}>
        {mode === "video"
          ? <>
              {/* frame 0 of the film, the page's largest image; phones get the 1280 one */}
              <picture>
                <source type="image/avif" srcSet={`/tour-poster-1280.avif${V} 1280w, /tour-poster-1920.avif${V} 1920w`} sizes="100vw" />
                <img className="poster" src={`/tour-poster-1280.webp${V}`} srcSet={`/tour-poster-1280.webp${V} 1280w, /tour-poster-1920.webp${V} 1920w`}
                  sizes="100vw" alt="" aria-hidden="true" fetchPriority="high" />
              </picture>
              {/* src is set once each film has downloaded (above): the quick one, then the sharp one over it */}
              <video ref={quick} className="world" muted playsInline preload="auto" aria-hidden="true" />
              <video ref={video} className="world world--sharp" muted playsInline preload="auto" aria-hidden="true" />
            </>
          : <>
              <canvas ref={canvas} className="world" aria-hidden="true" />
              <div className="wpins" aria-hidden="true">
                {PINS.map((p) => <div key={p.id} className="wpin" data-wpin={p.id}><span className="wpin__chip">{p.label}</span><i className="wpin__dot" /></div>)}
              </div>
            </>}
        <Close />
        <Hero />
        <Captions />
        <Nav tone={tone} onBook={() => goToTick(TOTAL - 1)} />
      </div>
    </section>
  );
}
