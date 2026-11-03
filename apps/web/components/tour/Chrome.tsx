"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { RENTALS } from "@/lib/search";
import { LOGO_V, STOPS } from "./config";

type Tone = "ink" | "paper";

/* ---------- Birds: a few crows crossing the sky, left to right (CSS only; hidden with reduced motion) ---------- */

// top (% of the stage), seconds to cross, start offset (negative = already on the way), size
const BIRDS = [
  [11, 27, -6, 1], [13, 27, -6.6, 0.8], [9.5, 27, -7.1, 0.85], // a loose three
  [19, 34, -21, 0.65], [7, 23, -15, 0.9],
] as const;

function Birds() {
  return (
    <div className="birds" aria-hidden="true">
      {BIRDS.map(([top, dur, delay, s], i) => (
        <span key={i} className="bird" style={{ "--top": `${top}cqh`, "--dur": `${dur}s`, "--delay": `${delay}s`, "--s": s, "--flap": `${0.42 + i * 0.05}s` } as CSSProperties}>
          <svg viewBox="0 0 40 16">
            <path className="bird__wing" d="M20 8 Q13 1 2 5" />
            <path className="bird__wing" d="M20 8 Q27 1 38 5" />
            <ellipse cx="20" cy="8.4" rx="3.2" ry="1.7" />
          </svg>
        </span>
      ))}
    </div>
  );
}

/* ---------- Hero: headline + search (the first-viewport action) ---------- */

// Rent shows only once rentals launch (lib/search.ts). Invest is a sale search.
const MODES = RENTALS ? (["Buy", "Rent", "Invest"] as const) : (["Buy", "Invest"] as const);

export function Hero() {
  return (
    <div className="hero" data-hero>
      <Birds />
      {/* On wide screens the film's tower stands in the gap between "your next" and "address." (tour.css) */}
      <h1 className="hero__title">
        <span className="hero__line">Step inside</span>
        <span className="hero__line hero__split"><span>your next</span> <span>address.</span></span>
      </h1>

      <form className="search" role="search" action="/search" method="get" aria-label="Search homes">
        <fieldset className="search__modes">
          <legend className="sr-only">I want to</legend>
          {MODES.map((m, i) => (
            <label key={m} className="search__mode">
              <input type="radio" name="type" value={m === "Rent" ? "rent" : "buy"} defaultChecked={i === 0} />
              <span>{m}</span>
            </label>
          ))}
        </fieldset>
        <label className="search__field">
          <span className="sr-only">City, area or project</span>
          <input type="text" name="q" placeholder="City, area or project" autoComplete="off" />
        </label>
        <button type="submit" className="btn btn--sun">Search homes</button>
      </form>
    </div>
  );
}

/* ---------- Nav ---------- */

/** Signed in? Asked a moment after the page has loaded (or on the first scroll or tap, if sooner), so the auth client
 *  stays out of the first load; the nav shows "Sign in" until then. */
function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let live = true, asked = false, timer = 0;
    const ask = () => {
      if (asked) return;
      asked = true;
      import("@/lib/auth-client")
        .then(({ authClient }) => authClient.getSession())
        .then((r) => { if (live) setSignedIn(!!r.data); })
        .catch(() => undefined);
    };
    const later = () => { timer = window.setTimeout(ask, 2000); };
    if (document.readyState === "complete") later(); else addEventListener("load", later, { once: true });
    addEventListener("pointerdown", ask, { once: true, passive: true });
    addEventListener("scroll", ask, { once: true, passive: true });
    return () => {
      live = false;
      clearTimeout(timer);
      removeEventListener("load", later);
      removeEventListener("pointerdown", ask);
      removeEventListener("scroll", ask);
    };
  }, []);
  return signedIn;
}

export function Nav({ tone, onBook, onHome }: { tone: Tone; onBook: () => void; onHome: () => void }) {
  const session = useSignedIn();
  return (
    <header className="nav" data-tone={tone}>
      <a href="#top" className="nav__logo" aria-label="Gharaana, back to the start" onClick={(e) => { e.preventDefault(); onHome(); }}>
        {/* a cached SVG file, not inline paths: keeps 22 KB of path data out of the HTML and this script */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a static vector logo; next/image has nothing to optimise */}
        <img src={tone === "paper" ? `/brand/logo-on-dark.svg${LOGO_V}` : `/brand/logo-color.svg${LOGO_V}`}
          alt="Gharaana" width={4784} height={1013} className="nav__mark" />
      </a>
      <div className="nav__actions">
        <button type="button" className="btn btn--sun btn--sm" data-magnet onClick={onBook}>Book a viewing</button>
        {session
          ? <a href="/account" className="btn btn--ghost btn--sm">My account</a>
          : <a href="/sign-in?next=%2F" className="btn btn--ghost btn--sm">Sign in</a>}
      </div>
    </header>
  );
}

/* ---------- Captions (one per stop, faded by the timeline) ---------- */

export function Captions() {
  return (
    <div className="caps" aria-live="polite">
      {STOPS.filter((s) => s.title).map((s) => (
        <section key={s.id} className="cap" data-cap={s.id} data-tone={s.tone}>
          <h2 className="cap__title">
            {s.title.split(" ").map((w, i) => <span key={i}><span className="w"><span className="wi">{w}</span></span>{" "}</span>)}
          </h2>
          <p className="cap__line">{s.line}</p>
        </section>
      ))}
    </div>
  );
}

/* ---------- Close: the last scene, and the way into a real visit (search, then "Schedule a visit" on a home) ---------- */

export function Close() {
  return (
    <div className="scene sc-close" data-scene="close">
      <div className="close__panel" data-close>
        <h2 className="close__title">
          <span className="close__line">The light&rsquo;s on.</span>
          <span className="close__line">Come in.</span>
        </h2>
        <p className="close__text">Pick a home, then schedule a visit or chat with the owner. Sign in to see their number.</p>
        <form className="find" role="search" action="/search" method="get" id="book" aria-label="Find homes to visit">
          {!RENTALS && <input type="hidden" name="type" value="buy" />}
          <label className="find__field">
            <span className="sr-only">Area, metro or project</span>
            <input type="text" name="q" placeholder="Area, metro or project" autoComplete="off" />
          </label>
          <button type="submit" className="btn btn--sun" data-magnet>Find homes to visit</button>
        </form>
        <ul className="close__links">
          <li><a href="/sign-in?next=%2F">Sign in</a></li>
          <li><a href="/post">List your home</a></li>
        </ul>
      </div>
    </div>
  );
}
