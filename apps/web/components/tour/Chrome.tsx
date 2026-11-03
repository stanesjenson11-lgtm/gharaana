"use client";

import type { CSSProperties } from "react";
import { Logo } from "@/components/brand/Logo";
import { authClient } from "@/lib/auth-client";
import { RENTALS } from "@/lib/search";
import { STOPS } from "./config";

type Tone = "ink" | "paper";

/* ---------- Hero: headline + search (the first-viewport action) ---------- */

// Rent shows only once rentals launch (lib/search.ts). Invest is a sale search.
const MODES = RENTALS ? (["Buy", "Rent", "Invest"] as const) : (["Buy", "Invest"] as const);

// --i staggers the CSS intro across the whole title
const words = (s: string, from = 0) => s.split(" ").map((w, i) => (
  <span key={i}><span className="w"><span className="wi" style={{ "--i": from + i } as CSSProperties}>{w}</span></span>{" "}</span>
));
const TITLE = (
  <>
    <span className="hero__line">{words("Step inside")}</span>
    <span className="hero__line">{words("your next address.", 2)}</span>
  </>
);

/** The title on its own layer, so the cut-out of the blocks (Tour.tsx) can sit between it and the search. */
export function HeroTitle() {
  return (
    <div className="hero hero--title" data-hero-title>
      <h1 className="hero__title">{TITLE}</h1>
    </div>
  );
}

export function Hero() {
  return (
    <div className="hero hero--rest" data-hero>

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

export function Nav({ tone, onBook }: { tone: Tone; onBook: () => void }) {
  const { data: session } = authClient.useSession();
  return (
    <header className="nav" data-tone={tone}>
      <a href="#top" className="nav__logo" aria-label="Gharaana, back to the start">
        <Logo tone={tone === "paper" ? "colorOnDark" : "color"} className="nav__mark" />
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
          {s.kicker && <p className="cap__kicker">{s.kicker}</p>}
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
