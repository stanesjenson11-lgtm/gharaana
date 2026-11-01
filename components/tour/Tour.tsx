"use client";

import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { buildTour } from "./timeline";
import { Captions, Close, Hero, Nav, StopRail } from "./Chrome";
import { STOPS, TOTAL } from "./config";
import type { World } from "@/components/world/World";
import "./tour.css";

type Tone = "ink" | "paper";

const PINS = [
  { id: "tower", label: "This tower" },
  { id: "park", label: "Park" },
  { id: "river", label: "Riverside" },
] as const;

/** The scroll tour: a sticky stage with one 3D world, one camera, and the HTML layer on top. */
export default function Tour() {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<ReturnType<typeof buildTour> | null>(null);
  const smooth = useRef<Lenis | null>(null);
  const [tone, setTone] = useState<Tone>("ink");
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
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

    let world: World | null = null;
    let lastTick = 0;
    let disposed = false;
    const ctx = gsap.context(() => {
      api.current = buildTour(root.current!, {
        reduced,
        onTone: setTone,
        onStop: setActive,
        onTick: (t) => { lastTick = t; world?.setTick(t); },
      });
    }, root);

    // The 3D world loads after first paint; the hero and search work before it arrives.
    import("@/components/world/World")
      .then(({ createWorld, PIN_POINTS }) => {
        if (disposed || !canvas.current) return;
        const pins = PINS.map((p) => ({ el: root.current!.querySelector<HTMLElement>(`[data-wpin="${p.id}"]`)!, at: PIN_POINTS[p.id] }));
        world = createWorld(canvas.current, { reduced, pins, onReady: () => setReady("ready") });
        world.setTick(lastTick);
      })
      .catch(() => setReady("failed"));

    const onResize = () => world?.resize();
    addEventListener("resize", onResize);

    return () => {
      disposed = true;
      removeEventListener("resize", onResize);
      world?.dispose();
      api.current?.destroy();
      ctx.revert();
      gsap.ticker.remove(raf);
      lenis?.destroy();
      smooth.current = null;
    };
  }, []);

  function goToTick(tick: number) {
    const y = api.current?.goto(tick);
    if (y == null) return;
    if (smooth.current) smooth.current.scrollTo(y, { duration: 2.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else window.scrollTo({ top: y });
  }

  return (
    <section className="tour" ref={root} aria-label="Gharaana tour">
      <div className="stage" data-world={ready}>
        <canvas ref={canvas} className="world" aria-hidden="true" />
        <div className="wpins" aria-hidden="true">
          {PINS.map((p) => (
            <div key={p.id} className="wpin" data-wpin={p.id}>
              <span className="wpin__chip">{p.label}</span>
              <i className="wpin__dot" />
            </div>
          ))}
        </div>
        <Close />
        <Hero />
        <Captions />
        <Nav tone={tone} onBook={() => goToTick(TOTAL - 1)} />
        <StopRail tone={tone} active={active} onGo={(i) => goToTick(STOPS[i].at)} />
      </div>
    </section>
  );
}
