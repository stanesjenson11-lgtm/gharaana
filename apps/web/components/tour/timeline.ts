import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { STOPS, TONE_BREAKS, TOTAL } from "./config";

type Tone = "ink" | "paper";
type Vars = gsap.TweenVars;

export type TourHooks = {
  reduced: boolean;
  onTone: (t: Tone) => void;
  onStop: (i: number) => void;
  onTick: (tick: number) => void; // drives the 3D camera
};

const FADE = new Set(["opacity", "autoAlpha"]);

/** The HTML layer over the 3D world: hero, captions, close, rail. The camera itself lives in components/world. */
export function buildTour(root: HTMLElement, o: TourHooks) {
  gsap.registerPlugin(ScrollTrigger);
  const q = gsap.utils.selector(root);
  const one = (s: string) => q(s)[0] as HTMLElement;

  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: root,
      start: "top top",
      end: "bottom bottom",
      scrub: o.reduced ? true : 0.6,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        const tick = self.progress * TOTAL;
        o.onTick(tick);
        track(tick, self.progress);
      },
    },
  });

  /** fromTo on the master timeline. With reduced motion, only fades animate; movement snaps. */
  function fx(target: gsap.TweenTarget, from: Vars, to: Vars, at: number, dur: number, ease = "none", later = false) {
    if (!o.reduced) {
      tl.fromTo(target, from, { duration: dur, ease, ...to, immediateRender: !later }, at);
      return;
    }
    const split = (v: Vars) => {
      const fade: Vars = {}, rest: Vars = {};
      for (const k of Object.keys(v)) {
        if (k === "ease") continue;
        (FADE.has(k) || k === "stagger" ? fade : rest)[k] = v[k];
      }
      return { fade, rest };
    };
    const f = split(from), t = split(to);
    if (Object.keys(t.fade).length) tl.fromTo(target, f.fade, { duration: Math.min(dur, 1.5), ease: "none", ...t.fade, immediateRender: !later }, at);
    if (Object.keys(f.rest).length) tl.set(target, f.rest, at);
    if (Object.keys(t.rest).length) tl.set(target, t.rest, at + dur);
  }

  const railFill = one(".rail__fill");
  let tone: Tone = "ink", stop = 0;
  function track(tick: number, p: number) {
    railFill.style.transform = `scaleY(${p})`;
    const nt = [...TONE_BREAKS].reverse().find(([at]) => tick >= at)![1];
    if (nt !== tone) o.onTone((tone = nt));
    const ns = Math.max(0, STOPS.map((s) => s.at - 7).findLastIndex((a) => tick >= a));
    if (ns !== stop) o.onStop((stop = ns));
  }

  fx("[data-hero]", { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -90 }, 1, 6, "power2.in");

  const cap = (id: string, inAt: number, outAt: number) => {
    const s = `[data-cap="${id}"]`;
    fx(s, { autoAlpha: 0 }, { autoAlpha: 1 }, inAt, 0.6);
    fx(`${s} .wi`, { yPercent: 115 }, { yPercent: 0, stagger: 0.18 }, inAt, 1.4, "power3.out");
    fx(`${s} .cap__line`, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1 }, inAt + 0.9, 1.4, "power2.out");
    fx(s, { autoAlpha: 1 }, { autoAlpha: 0 }, outAt, 1.2, "none", true);
  };
  cap("sky", 7, 15);
  cap("tower", 21, 33);
  cap("inside", 53, 63);
  cap("plan", 71, 80);
  cap("hood", 87, 95.5);

  fx(".sc-close", { autoAlpha: 0 }, { autoAlpha: 1 }, 102, 3);
  fx("[data-close] > *", { y: 36, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.35 }, 102.5, 2, "power3.out");

  tl.set({}, {}, TOTAL); // fix total length

  /* ---- magnetic buttons ---- */
  const cleanups: (() => void)[] = [];
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && !o.reduced) {
    for (const b of q("[data-magnet]")) {
      const qx = gsap.quickTo(b, "x", { duration: 0.5, ease: "power3" });
      const qy = gsap.quickTo(b, "y", { duration: 0.5, ease: "power3" });
      const mv = (e: PointerEvent) => {
        const r = b.getBoundingClientRect();
        qx((e.clientX - (r.left + r.width / 2)) * 0.28);
        qy((e.clientY - (r.top + r.height / 2)) * 0.28);
      };
      const lv = () => { qx(0); qy(0); };
      b.addEventListener("pointermove", mv as EventListener);
      b.addEventListener("pointerleave", lv);
      cleanups.push(() => { b.removeEventListener("pointermove", mv as EventListener); b.removeEventListener("pointerleave", lv); });
    }
  }

  /* ---- intro (time-based, once on load) ---- */
  if (!o.reduced) {
    const intro = gsap.timeline({ delay: 0.1, defaults: { ease: "power4.out" } });
    intro
      .fromTo(q(".hero .wi"), { yPercent: 115 }, { yPercent: 0, duration: 1.3, stagger: 0.1 }, 0.35)
      .fromTo(q(".hero__sub"), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 1 }, 1)
      .fromTo(q(".search"), { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 1.1 }, 1.15)
      .fromTo(q(".nav, .rail"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 1 }, 1.3);
    cleanups.push(() => intro.kill());
  }
  document.documentElement.dataset.ready = "1";

  return {
    goto(tick: number) {
      const st = tl.scrollTrigger!;
      return st.start + (tick / TOTAL) * (st.end - st.start);
    },
    destroy() {
      cleanups.forEach((f) => f());
      tl.scrollTrigger?.kill();
      tl.kill();
    },
  };
}
