"use client";

import { useState, type FormEvent } from "react";
import { Logo } from "@/components/brand/Logo";
import { STOPS } from "./config";

type Tone = "ink" | "paper";

/* ---------- Hero: headline + search (the first-viewport action) ---------- */

const MODES = ["Buy", "Rent", "Invest"] as const;

export function Hero() {
  const [mode, setMode] = useState<(typeof MODES)[number]>("Buy");
  const [note, setNote] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // ponytail: no listings backend yet, so say so instead of faking results. Replace with a router push.
    setNote("Search isn't live yet, so nothing was sent. Book a viewing and an advisor will help.");
  }

  const words = (s: string) => s.split(" ").map((w, i) => (
    <span key={i}><span className="w"><span className="wi">{w}</span></span>{" "}</span>
  ));

  return (
    <div className="hero" data-hero>
      <h1 className="hero__title">
        <span className="hero__line">{words("Step inside")}</span>
        <span className="hero__line">{words("your next address.")}</span>
      </h1>
      <p className="hero__sub">Scroll to take the tour.</p>

      <form className="search" role="search" onSubmit={onSubmit} aria-label="Search homes">
        <fieldset className="search__modes">
          <legend className="sr-only">I want to</legend>
          {MODES.map((m) => (
            <label key={m} className="search__mode">
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              <span>{m}</span>
            </label>
          ))}
        </fieldset>
        <label className="search__field">
          <span className="sr-only">City, area or project</span>
          <input type="text" name="place" placeholder="City, area or project" autoComplete="off" />
        </label>
        <button type="submit" className="btn btn--sun">Search homes</button>
        <p className="search__note" role="status" aria-live="polite">{note}</p>
      </form>
    </div>
  );
}

/* ---------- Nav ---------- */

export function Nav({ tone, onBook }: { tone: Tone; onBook: () => void }) {
  return (
    <header className="nav" data-tone={tone}>
      <a href="#top" className="nav__logo" aria-label="Gharaana, back to the start">
        <Logo tone={tone === "paper" ? "white" : "color"} className="nav__mark" />
      </a>
      <button type="button" className="btn btn--sun btn--sm" data-magnet onClick={onBook}>Book a viewing</button>
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

/* ---------- Stop rail: where you are in the tour; click to jump ---------- */

export function StopRail({ tone, active, onGo }: { tone: Tone; active: number; onGo: (i: number) => void }) {
  return (
    <nav className="rail" data-tone={tone} aria-label="Tour stops">
      <div className="rail__track" aria-hidden="true"><i className="rail__fill" /></div>
      <ol className="rail__list">
        {STOPS.map((s, i) => (
          <li key={s.id}>
            <button type="button" className="rail__btn" aria-current={i === active ? "step" : undefined} onClick={() => onGo(i)}>
              <span className="rail__dot" aria-hidden="true" />
              <span className="rail__label">{s.rail}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* ---------- Close: the last scene and the booking action ---------- */

export function Close() {
  const [note, setNote] = useState("");
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // ponytail: no booking endpoint yet; be honest rather than fake a confirmation.
    setNote("Booking isn't live yet, so your details weren't sent.");
  }
  return (
    <div className="scene sc-close" data-scene="close">
      <div className="close__panel" data-close>
        <h2 className="close__title">
          <span className="close__line">The light&rsquo;s on.</span>
          <span className="close__line">Come in.</span>
        </h2>
        <p className="close__text">Tell us where you&rsquo;d like to live and an advisor will arrange a private viewing.</p>
        <form className="book" onSubmit={onSubmit} id="book" aria-label="Book a viewing">
          <label className="book__field">
            <span className="book__label">Name</span>
            <input type="text" name="name" autoComplete="name" required />
          </label>
          <label className="book__field">
            <span className="book__label">Phone or email</span>
            <input type="text" name="contact" autoComplete="email" required />
          </label>
          <button type="submit" className="btn btn--sun" data-magnet>Book a viewing</button>
          <p className="book__note" role="status" aria-live="polite">{note}</p>
        </form>
      </div>
    </div>
  );
}
