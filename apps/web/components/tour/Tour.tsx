"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { buildTour } from "./timeline";
import { Captions, Close, Hero, Nav, StopRail } from "./Chrome";
import { STOPS, TOTAL } from "./config";
import type { World } from "@/components/world/World";
import "./tour.css";

type Tone = "ink" | "paper";

const noop = () => () => {};

const PINS = [
  { id: "tower", label: "This tower" },
  { id: "park", label: "Park" },
  { id: "river", label: "Riverside" },
] as const;

/** The scroll tour: default = photoreal video scrubbed by scroll; `?mode=3d` = live three.js (used by record.mjs). */
export default function Tour() {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<ReturnType<typeof buildTour> | null>(null);
  const smooth = useRef<Lenis | null>(null);
  const [tone, setTone] = useState<Tone>("ink");
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState<"loading" | "ready" | "failed">("loading");
  // browser-only values, read without a setState-in-effect (server render: video mode, no src yet)
  const mode = useSyncExternalStore(noop, () => (new URLSearchParams(location.search).get("mode") === "3d" ? "3d" : "video"), () => "video");
  // both files are all-intra (every frame a keyframe) so scroll seeks are instant; small screens get the lighter one
  const src = useSyncExternalStore(noop, () => (innerWidth >= 1280 ? "/tour-1080.mp4?v=11" : "/tour-720.mp4?v=11"), () => null);

  useEffect(() => {
    if (mode === "video" && !src) return; // wait until the file for this screen size is chosen
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.registerPlugin(ScrollTrigger);

    let lenis: Lenis | null = null;
    const raf = (t: number) => lenis?.raf(t * 1000);
    if (!reduced) {
      lenis = new Lenis({ lerp: 0.09 });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
    }
    smooth.current = lenis;

    let onTick: (t: number) => void = () => undefined;
    const cleanups: (() => void)[] = [];
    let world: World | null = null;
    let lastTick = 0;
    let disposed = false;

    if (mode === "video") {
      const v = video.current!;
      v.muted = true; v.playsInline = true;
      const prime = () => { v.play().then(() => v.pause()).catch(() => undefined); };
      const onLoaded = () => { prime(); setReady("ready"); };
      const onError = () => setReady("failed");
      v.addEventListener("loadedmetadata", onLoaded, { once: true });
      v.addEventListener("error", onError, { once: true });
      if (v.readyState >= 1) onLoaded();
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
      // tick -> video time: the recording spends different seconds per tick, so look the frame up in its tick table
      // (binary search over a rising list); until the table loads, fall back to a straight proportion
      let ticks: number[] | null = null, fps = 24;
      fetch("/tour-timing.json?v=11").then((r) => r.json()).then((j: { fps: number; ticks: number[] }) => { ticks = j.ticks; fps = j.fps; }).catch(() => undefined);
      const timeAt = (t: number) => {
        if (!ticks) return (t / TOTAL) * (v.duration || 0);
        let lo = 0, hi = ticks.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (ticks[mid] < t) lo = mid + 1; else hi = mid; }
        return lo / fps;
      };
      onTick = (t) => { want = timeAt(t); seek(); };
      cleanups.push(() => { v.removeEventListener("loadedmetadata", onLoaded); v.removeEventListener("error", onError); v.removeEventListener("seeked", onSeeked); });
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
      api.current = buildTour(root.current!, { reduced, onTone: setTone, onStop: setActive, onTick });
    }, root);

    return () => {
      disposed = true;
      for (const c of cleanups) c();
      api.current?.destroy();
      ctx.revert();
      gsap.ticker.remove(raf);
      lenis?.destroy();
      smooth.current = null;
    };
  }, [mode, src]);

  function goToTick(tick: number) {
    const y = api.current?.goto(tick);
    if (y == null) return;
    if (smooth.current) smooth.current.scrollTo(y, { duration: 2.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else window.scrollTo({ top: y });
  }

  return (
    <section className="tour" ref={root} aria-label="Gharaana tour">
      <div className="stage" data-world={ready}>
        {mode === "video"
          ? <video ref={video} className="world" src={src ?? undefined} muted playsInline preload="auto" aria-hidden="true" />
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
        <StopRail tone={tone} active={active} onGo={(i) => goToTick(STOPS[i].at)} />
      </div>
    </section>
  );
}
