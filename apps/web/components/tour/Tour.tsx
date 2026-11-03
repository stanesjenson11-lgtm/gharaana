"use client";

import { useEffect, useRef, useState } from "react";
import type { buildTour } from "./timeline";
import { Captions, Close, Hero, HeroTitle, Nav } from "./Chrome";
import { PIN_FADE, TOTAL, pw } from "./config";
import film from "./film.json";
import "./tour.css";

type Tone = "ink" | "paper";

const PINS = [
  { id: "home", label: "Your home" },
  { id: "metro", label: "Metro" },
  { id: "lake", label: "Lake" },
  { id: "school", label: "School" },
  { id: "hospital", label: "Hospital" },
  { id: "supermarket", label: "Supermarket" },
] as const;

// The tour is a film path-traced in Blender (apps/web/film): frame 1 is tick 0, the last frame is tick TOTAL.
const DURATION = (film.frames - 1) / film.fps;
// Phones held upright get a portrait cut from the centre of the frame (encode.py PHONE: x 656..1264 of 1920).
const PHONE = "(orientation: portrait) and (max-width: 699px)";
const PHONE_CROP = { x0: 656 / 1920, w: 608 / 1920 };
const SRC = {
  av1: "/tour/film-1080-av1.mp4", hevc: "/tour/film-1080-hevc.mp4", h264: "/tour/film-1080.mp4",
  phoneHevc: "/tour/film-phone-hevc.mp4", phone: "/tour/film-phone.mp4",
};

// The tour's one steady pace (a wheel glide, and the tour's own glide after a swipe), in film seconds per second, by where
// the tour is (ticks): brisk outside, a little slower inside the flat (through the balcony door at 51 until the camera
// rises to the plan at 84).
const PACE: [number, number][] = [[0, 3.2], [47, 3.2], [51, 2.1], [82, 2.1], [86, 3.2], [TOTAL, 3.2]];

/** While the title is up the film holds its first frame (the cut-out of the blocks lines up with it); it catches up by tick 22. */
const filmTick = (t: number) => (t < 4 ? 0 : t < 22 ? ((t - 4) * 22) / 18 : t);

/** The scroll tour: a sticky stage with the film, played by scroll, and the HTML layer on top. */
export default function Tour() {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const api = useRef<ReturnType<typeof buildTour> | null>(null);
  const jump = useRef<(tick: number) => void>(() => {});
  const [tone, setTone] = useState<Tone>("ink");
  const [ready, setReady] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const v = video.current!;
    const phone = matchMedia(PHONE).matches;
    const onReady = () => setReady("ready");
    const onFail = () => setReady("failed");
    v.addEventListener("loadeddata", onReady);
    v.addEventListener("error", onFail);
    // The film, and the HTML layer's timeline (with GSAP), start downloading when the visitor first scrolls or touches
    // the page (or 3 s after it has loaded): they never compete with the first view, which is plain HTML and CSS, and
    // someone who leaves at once never pays for them.
    let dead = false, stop = () => {}, loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      for (const e of WAKE) removeEventListener(e, load);
      clearTimeout(idle);
      import("./timeline").then(({ buildTour }) => { if (!dead) stop = start(buildTour); });
      // desktops: HEVC where it plays (43.6 MB, decoded in hardware), else AV1 (47.1), else H.264 (77.5);
      // phones: HEVC at the crop's full 608x1080 (9.5; iPhones decode it in hardware: sharper for the same download),
      // else H.264 at 540x960 (10.1)
      const hevc = v.canPlayType('video/mp4; codecs="hvc1.1.6.L120.90"');
      v.src = phone ? (hevc ? SRC.phoneHevc : SRC.phone)
        : hevc ? SRC.hevc
        : v.canPlayType('video/mp4; codecs="av01.0.08M.08"') ? SRC.av1
        : SRC.h264;
      v.load();
    };
    const WAKE = ["wheel", "touchstart", "pointerdown", "keydown", "scroll"] as const;
    for (const e of WAKE) addEventListener(e, load, { passive: true });
    let idle = 0;
    if (scrollY > 2) load(); // a reload mid-tour: the browser restored the scroll before these listeners were here
    const later = () => { idle = window.setTimeout(load, 3000); };
    if (document.readyState === "complete") later();
    else addEventListener("load", later, { once: true });

    return () => {
      dead = true;
      stop();
      removeEventListener("load", later);
      for (const e of WAKE) removeEventListener(e, load);
      clearTimeout(idle);
      v.removeEventListener("loadeddata", onReady);
      v.removeEventListener("error", onFail);
    };

    function start(build: typeof buildTour) {
      let goal = 0; // the tick the scroll asks for (the tour itself glides there: step, below)
      const glides = !reduced && matchMedia("(pointer: fine)").matches; // mouse or trackpad (touch keeps its native scroll)
      api.current = build(root.current!, { reduced, onTick: (t) => { goal = t; } });

      // Mouse and trackpad: the tour runs at one steady pace whatever the wheel does. A wheel move only says "keep going"
      // (and which way); the page then glides at a constant pace (a little slower inside the flat), easing in, and easing
      // out a moment after the last move, so every scene takes the same time however fast or slow the scroll. Nothing
      // snaps: it stops where you stop. Past either end of the tour the page scrolls as usual.
      // Touch keeps the phone's own (native) scroll (scrolling a touch screen from JavaScript lagged and floated on iPhone
      // Safari); the tour glides after it at the same pace (step, below).
      let teardown = () => {};
      if (glides) {
        let dir = 0, until = 0, pxVel = 0, pos = 0, last = 0, glide = 0;
        const ends = () => [api.current!.goto(0), api.current!.goto(TOTAL)] as const;
        const run = (ms: number) => {
          if (Math.abs(scrollY - pos) > 2) pos = scrollY; // something else scrolled (Book, keys, scrollbar): go on from there
          const dt = Math.min(0.05, (ms - last) / 1000);
          last = ms;
          const [top, end] = ends();
          const full = ((end - top) / DURATION) * pw(PACE, ((pos - top) / (end - top)) * TOTAL); // px per second here
          const want = ms < until ? dir * full : 0;
          pxVel += (want - pxVel) * (1 - Math.exp(-dt / (want ? 0.12 : 0.2))); // quick to start, a short ease to rest
          // no slow crawl at the end: once down to a fifth of full pace, it has arrived
          if (want === 0 && Math.abs(pxVel) < full / 5) {
            pxVel = 0;
            glide = 0;
            return;
          }
          pos = Math.min(end, Math.max(top, pos + pxVel * dt));
          window.scrollTo(0, pos);
          glide = requestAnimationFrame(run);
        };
        /** Asks the glide to keep going in direction d; false when that way is past the tour (let the page scroll). */
        const nudge = (d: number) => {
          const [top, end] = ends();
          if ((d > 0 && scrollY >= end - 1) || (d < 0 && scrollY <= top + 1)) return false;
          if (d !== dir) pxVel = 0; // turning round: no backwards momentum
          dir = d;
          until = performance.now() + 250; // a wheel's notches come ~100-250 ms apart while it turns
          if (!glide) {
            pos = scrollY;
            last = performance.now();
            glide = requestAnimationFrame(run);
          }
          return true;
        };
        const onWheel = (e: WheelEvent) => {
          if (e.ctrlKey || !e.deltaY) return; // pinch-zoom, sideways swipes
          if (nudge(Math.sign(e.deltaY))) e.preventDefault();
        };
        addEventListener("wheel", onWheel, { passive: false });
        teardown = () => {
          removeEventListener("wheel", onWheel);
          cancelAnimationFrame(glide);
        };
      }

      // One clock, the tour's own: the scroll only sets a goal, and the tour moves towards it at the steady PACE, easing in
      // and out; the film and the HTML layer (captions, hero, close) both show where the tour is, so they never drift apart.
      // A wheel glide moves the page at that same pace, so there goal and tour stay together; a swipe moves the page at once
      // and the tour glides after it, so a flick plays at the same speed as a slow swipe and the film plays, never seeks.
      // Moving forward, the film plays (frames decode in order, no seeking) at the tour's speed, plus a gentle correction
      // for any gap. It pauses once caught up; a frame or two of overshoot is held rather than sought back. Going back seeks,
      // and so do the tour's only jumps: Book, the backlog cap (step, below) and reduced motion.
      const pins = PINS.map((p) => root.current!.querySelector<HTMLElement>(`[data-wpin="${p.id}"]`)!);
      const FRAME = 1 / (phone ? 30 : 60); // desktop films are 60 fps, phone films 30 (film/encode.py)
      let canPlay = !reduced;
      let frameId = 0;
      let now = goal, vel = 0, shownAt = -1; // the tour's tick, its speed (ticks per second), the tick the HTML layer shows
      let speed = 0, lastTarget = 0, lastMs = performance.now(); // how fast the film should move (s per s)
      jump.current = (tick) => { // the nav's "Book a viewing": straight there, not a glide through the whole tour
        window.scrollTo(0, api.current!.goto(tick));
        goal = now = tick;
        vel = 0;
      };
      // The nav goes white where the film is dark behind the logo, navy where it is light (per frame, from film/tone.py).
      const shade = film.logo[phone ? "phone" : "desk"];
      let shown: Tone = "ink";
      const step = () => {
        frameId = requestAnimationFrame(step);
        const t = shade[Math.min(shade.length - 1, Math.round(v.currentTime * film.fps))] === "D" ? "paper" : "ink";
        if (t !== shown) setTone((shown = t));
        const ms = performance.now();
        const dt = Math.min(0.1, (ms - lastMs) / 1000);
        lastMs = ms;
        if (reduced) now = goal;
        else if (now !== goal) {
          // a big jump (scrollbar, End, a hard flick, scroll restoration) is not glided all the way: the tour skips to
          // 15 ticks short of it (6 film seconds, about 2 s at PACE) and glides the rest
          if (Math.abs(goal - now) > 15) now = goal - Math.sign(goal - now) * 15;
          const gap = goal - now;
          const pace = (pw(PACE, now) * TOTAL) / DURATION; // ticks per second (DURATION film seconds span TOTAL ticks)
          const want = Math.sign(gap) * Math.min(pace, Math.abs(gap) / 0.25); // full pace, slowing over the last 1/4 s
          vel += (want - vel) * (1 - Math.exp(-dt / 0.12));
          const next = Math.min(TOTAL, Math.max(0, now + vel * dt));
          // arrived; never past the goal and back, which would step the film backwards
          if ((goal - next) * gap <= 0 || (Math.abs(goal - next) < 0.01 && Math.abs(vel) < 0.05)) {
            now = goal;
            vel = 0;
          } else now = next;
        }
        placePins(v, pins, phone); // before the timeline writes its styles: no second style recalc
        if (now !== shownAt) api.current!.seek((shownAt = now));
        const target = (filmTick(now) / TOTAL) * DURATION;
        if (dt > 0) speed = (target - lastTarget) / dt; // the tour moves smoothly: no need to smooth this
        lastTarget = target;
        if (v.readyState < 2) return;
        const ahead = target - v.currentTime;
        const going = !v.paused;
        // a quarter second past the tour is held, not sought back (a jump back was the hitch when a glide came to rest);
        // scrolling backwards still follows frame by frame
        const behindOk = speed < -0.05 ? FRAME * 2 : 0.25;
        if (ahead < -behindOk || ahead > 1.5) {
          if (!v.seeking) {
            if (going) v.pause();
            v.currentTime = target;
          }
        } else if (canPlay && !v.ended && (going ? speed > 0.3 || ahead > 0.12 : speed > 0.3 || ahead > 0.25)) {
          // (play() on an ended film would restart it from frame 1)
          // play at the tour's own speed, nudged towards it; only touch the rate when it really changes. Once the tour
          // has stopped, a gap of a few frames is left as it is (creeping through them slowly read as a stutter), and a
          // bigger gap is closed at a normal pace, never a crawl.
          const rate = Math.min(6, Math.max(speed > 0.3 ? 0.25 : 0.9, Math.max(0, speed) + ahead * 2));
          if (Math.abs(rate - v.playbackRate) > 0.05) v.playbackRate = rate;
          if (!going) v.play().catch(() => { canPlay = false; }); // e.g. iOS low-power mode: seeking still works
        } else if (going) {
          v.pause(); // at rest: hold this frame
        }
      };
      frameId = requestAnimationFrame(step);

      return () => {
        teardown();
        cancelAnimationFrame(frameId);
        api.current?.destroy();
        api.current = null;
      };
    }
  }, []);

  return (
    <section className="tour" ref={root} aria-label="Gharaana tour">
      <div className="stage" data-world={ready}>
        {/* the film's first frame, shown at once (it is the largest paint), then the film itself over it */}
        <picture>
          <source media={PHONE} srcSet="/tour/film-poster-phone.webp" />
          <img className="film" src="/tour/film-poster.webp" alt="" fetchPriority="high" />
        </picture>
        <video ref={video} className="film film--video" muted playsInline preload="auto" aria-hidden="true"
          disablePictureInPicture disableRemotePlayback />
        <HeroTitle />
        {/* the community's blocks cut from frame 1, laid over the title so it sits behind them */}
        <picture>
          <source media={PHONE} srcSet="/tour/hero-cutout-phone.webp" />
          <img className="film film--cutout" data-cutout src="/tour/hero-cutout.webp" alt="" decoding="async" />
        </picture>
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
        <Nav tone={tone} onBook={() => jump.current(TOTAL - 1)} />
      </div>
    </section>
  );
}

let pinsShown = true;
/** Pins sit where Blender projected each place for this frame, mapped through the video's object-fit: cover crop. */
function placePins(v: HTMLVideoElement, els: HTMLElement[], phone: boolean) {
  const frame = Math.round(v.currentTime * film.fps) + 1;
  const tick = (v.currentTime / DURATION) * TOTAL;
  const alpha = pw(PIN_FADE, tick);
  const { from, to, points } = film.pins;
  if (alpha < 0.01 || frame < from || frame > to) {
    if (pinsShown) for (const el of els) el.style.opacity = "0";
    pinsShown = false;
    return;
  }
  pinsShown = true;
  const w = v.clientWidth, h = v.clientHeight;
  const vw = v.videoWidth || 16, vh = v.videoHeight || 9;
  const s = Math.max(w / vw, h / vh);
  const dw = vw * s, dh = vh * s, ox = (w - dw) / 2, oy = (h - dh) / 2;
  PINS.forEach((p, i) => {
    const [fx, y] = points[p.id][frame - from];
    const x = phone ? (fx - PHONE_CROP.x0) / PHONE_CROP.w : fx;
    els[i].style.opacity = String(alpha);
    els[i].style.transform = `translate(${ox + x * dw}px, ${oy + y * dh}px)`;
  });
}
