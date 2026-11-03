"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { Photo } from "@/lib/search";

const ROOM = { living: "Living room", bedroom: "Bedroom", kitchen: "Kitchen", bathroom: "Bathroom", exterior: "Building", balcony: "Balcony and view" };

export function Gallery({ photos, title, sample = false }: { photos: Photo[]; title: string; sample?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const open = (i: number) => {
    dialog.current?.showModal();
    setIndex(i);
    // Jump without animating so the chosen photo is simply there.
    requestAnimationFrame(() => strip.current?.scrollTo({ left: i * strip.current.clientWidth, behavior: "instant" }));
  };
  const go = (dir: number) => {
    const s = strip.current;
    if (s) s.scrollBy({ left: dir * s.clientWidth, behavior: "smooth" });
  };

  // A home whose photos were all taken down shows a plain panel rather than breaking the page.
  if (photos.length === 0) {
    return <div className="grid aspect-[4/3] place-items-center rounded-xl bg-surface text-muted md:h-[min(58vh,520px)] md:aspect-auto">Photos are being updated.</div>;
  }

  return (
    <>
      {/* Desktop: one large photo and four small ones. Phones: a swipeable strip. */}
      <div className="relative">
        <div className="hidden h-[min(58vh,520px)] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-xl md:grid">
          {photos.slice(0, 5).map((p, i) => (
            <button
              key={p.src}
              type="button"
              onClick={() => open(i)}
              className={`relative cursor-pointer overflow-hidden bg-surface ${i === 0 ? "col-span-2 row-span-2" : ""}`}
            >
              <Image
                src={p.src}
                alt={`${ROOM[p.room]}, ${title}`}
                fill
                preload={i === 0}
                sizes={i === 0 ? "(min-width: 1200px) 600px, 50vw" : "(min-width: 1200px) 300px, 25vw"}
                className="object-cover transition-transform duration-300 ease-out-quint hover:scale-[1.02]"
              />
            </button>
          ))}
        </div>
        <div className="-mx-4 flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] md:hidden">
          {photos.map((p, i) => (
            <button key={p.src} type="button" onClick={() => open(i)} className="relative h-full w-full shrink-0 snap-start bg-surface">
              <Image src={p.src} alt={`${ROOM[p.room]}, ${title}`} fill preload={i === 0} sizes="100vw" className="object-cover" />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => open(0)}
          className="absolute right-3 bottom-3 flex h-10 cursor-pointer items-center gap-2 rounded-full bg-canvas px-4 text-[14px] font-semibold text-ink shadow-[0_4px_16px_-6px_oklch(0.22_0.025_266/0.5)] md:right-4 md:bottom-4"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
            <path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          All {photos.length} photos
        </button>
      </div>

      <dialog
        ref={dialog}
        aria-label={`Photos of ${title}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-dusk-deep p-0 text-moonlight backdrop:bg-dusk-deep"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <p className="text-[15px] tabular-nums" aria-live="polite">
              {index + 1} / {photos.length}
              <span className="text-moonlight-dim"> · {ROOM[photos[index].room]}</span>
            </p>
            <form method="dialog">
              <button className="h-10 cursor-pointer rounded-full px-4 text-[15px] font-semibold hover:bg-white/10">Close</button>
            </form>
          </div>
          <div className="relative min-h-0 flex-1">
            <div
              ref={strip}
              onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
              className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
            >
              {photos.map((p) => (
                <figure key={p.src} className="relative h-full w-full shrink-0 snap-center">
                  <Image src={p.src} alt={`${ROOM[p.room]}, ${title}`} fill sizes="100vw" className="object-contain" />
                </figure>
              ))}
            </div>
            {[-1, 1].map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => go(dir)}
                aria-label={dir < 0 ? "Previous photo" : "Next photo"}
                className={`absolute top-1/2 hidden h-12 w-12 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-canvas/90 text-ink sm:grid ${dir < 0 ? "left-4" : "right-4"}`}
              >
                <svg viewBox="0 0 16 16" className={`h-5 w-5 ${dir < 0 ? "rotate-180" : ""}`} aria-hidden="true">
                  <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
          <p className="px-4 py-3 text-center text-[13px] text-moonlight-dim sm:px-6">
            Photo by {photos[index].credit} on Unsplash.{sample && " Sample photo, not this exact home."}
          </p>
        </div>
      </dialog>
    </>
  );
}
