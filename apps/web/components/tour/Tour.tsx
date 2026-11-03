"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type Lenis from "lenis";
import type { buildTour } from "./timeline";
import { Captions, Close, Hero, Nav } from "./Chrome";
import { TOTAL } from "./config";
import type { World } from "@/components/world/World";
import "./tour.css";

type Tone = "ink" | "paper";

const noop = () => () => {};

const PINS = [
  { id: "tower", label: "This tower" },
  { id: "park", label: "Park" },
  { id: "river", label: "Riverside" },
] as const;

const V = "?v=12"; // bump with the film or its tick table (public/tour-*)
// The film, its tick table and the scroll engine (GSAP, ScrollTrigger, Lenis) load on the visitor's first scroll, touch
// or key press: the first paint is the HTML and the poster (frame 0 of the film), with no video bytes and little script.
const WAKE = ["wheel", "touchstart", "pointerdown", "keydown", "scroll"] as const;
// Phones get the 1280 poster (the film they play is 720p too); 1920 from wide screens up.
const POSTER_SIZES = "100vw";

/** The scroll tour: default = photoreal film scrubbed by scroll; `?mode=3d` = live three.js (used by ai-renders). */
export default function Tour() {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<ReturnType<typeof buildTour> | null>(null);
  const smooth = useRef<Lenis | null>(null);
  const pending = useRef<number | null>(null); // a rail/nav jump asked for before the engine had loaded
  const [tone, setTone] = useState<Tone>("ink");
  const [ready, setReady] = useState<"loading" | "ready" | "failed">("loading");
  const [woke, setWoke] = useState(false);
  // browser-only values, read without a setState-in-effect (server render: video mode, no src yet)
  const mode = useSyncExternalStore(noop, () => (new URLSearchParams(location.search).get("mode") === "3d" ? "3d" : "video"), () => "video");
  // both files are all-intra (every frame a keyframe) so scroll seeks are instant; small screens get the lighter one
  const src = useSyncExternalStore(noop, () => (innerWidth >= 1280 ? `/tour-1080.mp4${V}` : `/tour-720.mp4${V}`), () => null);
  const awake = woke || mode === "3d"; // the 3D recorder starts at once

  useEffect(() => {
    const wake = () => {
      for (const e of WAKE) removeEventListener(e, wake);
      setWoke(true);
    };
    for (const e of WAKE) addEventListener(e, wake, { passive: true });
    return () => { for (const e of WAKE) removeEventListener(e, wake); };
  }, []);

  useEffect(() => {
    if (!awake || (mode === "video" && !src)) return;
    let disposed = false;
    let teardown = () => {};
    Promise.all([import("gsap"), import("gsap/ScrollTrigger"), import("lenis"), import("./timeline")])
      .then(([{ default: gsap }, { ScrollTrigger }, { default: LenisCtor }, { buildTour }]) => {
        if (disposed) return;
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        gsap.registerPlugin(ScrollTrigger);

        let lenis: Lenis | null = null;
        const raf = (t: number) => lenis?.raf(t * 1000);
        if (!reduced) {
          lenis = new LenisCtor({ lerp: 0.09 });
          lenis.on("scroll", ScrollTrigger.update);
          gsap.ticker.add(raf);
          gsap.ticker.lagSmoothing(0);
        }
        smooth.current = lenis;

        let onTick: (t: number) => void = () => undefined;
        const cleanups: (() => void)[] = [];
        let world: World | null = null;
        let lastTick = 0;

        if (mode === "video") {
          const v = video.current!;
          v.muted = true; v.playsInline = true;
          const prime = () => { v.play().then(() => v.pause()).catch(() => undefined); };
          const onLoaded = () => { prime(); setReady("ready"); };
          const onError = () => setReady("failed");
          v.addEventListener("loadeddata", onLoaded, { once: true });
          v.addEventListener("error", onError, { once: true });
          if (v.readyState >= 2) onLoaded();
          const FRAME = 1 / 24;
          let want = 0, last = -1, seeking = false;
          const seek = () => {
            if (seeking) return;
            const d = v.duration;
            if (!d || Number.isNaN(d)) return;
            const t = Math.min(d - 0.001, Math.max(0, want));
            if (Math.abs(t - last) < FRAME) return;
            seeking = true; last = t; v.currentTime = t;
          };
          const onSeeked = () => { seeking = false; if (Math.abs(want - last) >= FRAME) seek(); };
          v.addEventListener("seeked", onSeeked);
          // tick -> video time: look the frame up in the film's tick table (binary search over a rising list);
          // until the table loads, fall back to a straight proportion
          let ticks: number[] | null = null, fps = 24;
          fetch(`/tour-timing.json${V}`).then((r) => r.json()).then((j: { fps: number; ticks: number[] }) => { ticks = j.ticks; fps = j.fps; }).catch(() => undefined);
          const timeAt = (t: number) => {
            if (!ticks) return (t / TOTAL) * (v.duration || 0);
            let lo = 0, hi = ticks.length - 1;
            while (lo < hi) { const mid = (lo + hi) >> 1; if (ticks[mid] < t) lo = mid + 1; else hi = mid; }
            return lo / fps;
          };
          onTick = (t) => { want = timeAt(t); seek(); };
          cleanups.push(() => { v.removeEventListener("loadeddata", onLoaded); v.removeEventListener("error", onError); v.removeEventListener("seeked", onSeeked); });
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
          gsap.ticker.remove(raf);
          lenis?.destroy();
          smooth.current = null;
        };
      })
      .catch(() => setReady("failed"));
    return () => { disposed = true; teardown(); };
  }, [mode, src, awake]);

  function goToTick(tick: number) {
    const y = api.current?.goto(tick);
    if (y == null) { pending.current = tick; return; } // the click woke the tour; jump once it has loaded
    if (smooth.current) smooth.current.scrollTo(y, { duration: 2.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else window.scrollTo({ top: y });
  }

  return (
    <section className="tour" ref={root} aria-label="Gharaana tour">
      <div className="stage" data-world={ready}>
        {mode === "video"
          ? <>
              <picture>
                <source type="image/avif" srcSet={`/tour-poster-1280.avif${V} 1280w, /tour-poster-1920.avif${V} 1920w`} sizes={POSTER_SIZES} />
                <img className="poster" src={`/tour-poster-1280.webp${V}`} srcSet={`/tour-poster-1280.webp${V} 1280w, /tour-poster-1920.webp${V} 1920w`}
                  sizes={POSTER_SIZES} alt="" aria-hidden="true" fetchPriority="high" />
              </picture>
              <video ref={video} className="world" src={awake && src ? src : undefined} muted playsInline preload="auto" aria-hidden="true" />
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
        {/* The logo goes back to the hero at once. A plain #top jump moves the page under Lenis, which then glides back to
            where it thought it was. */}
        <Nav tone={tone} onBook={() => goToTick(TOTAL - 1)} onHome={() => (smooth.current ? smooth.current.scrollTo(0, { immediate: true }) : window.scrollTo({ top: 0 }))} />
      </div>
    </section>
  );
}
