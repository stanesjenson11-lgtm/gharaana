"use client";

import { useState } from "react";

// A thumbnail until someone presses play, so YouTube's player (and its cookies) only load for people who want the video.
export function VideoTour({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative mt-4 aspect-video max-w-2xl overflow-hidden rounded-xl bg-ink">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={`Video tour: ${title}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 cursor-pointer" aria-label={`Play the video tour of ${title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail; not worth routing through the image optimiser */}
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover opacity-90 transition-opacity duration-200 group-hover:opacity-100" />
          <span className="absolute top-1/2 left-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-canvas/95 text-indigo shadow-lg transition-transform duration-200 ease-out-quint group-hover:scale-105">
            <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" aria-hidden="true">
              <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}
