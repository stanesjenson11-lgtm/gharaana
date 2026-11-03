"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { ShortlistButton } from "@/components/shortlist";
import { bhkLabel, daysAgo, distance, inr, inrShort, sqft } from "@/lib/format";
import type { Card } from "@/lib/listings";

const FURNISHING = { full: "Furnished", semi: "Semi-furnished", none: "Unfurnished" } as const;

export function ListingTile({
  card,
  active,
  onHover,
  preload = false,
}: {
  card: Card;
  active?: boolean;
  onHover?: (id: string | null) => void;
  preload?: boolean;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const href = `/homes/${card.id}`;
  const scroll = (dir: number) => strip.current?.scrollBy({ left: dir * strip.current.clientWidth, behavior: "smooth" });
  const rent = card.type === "rent";

  return (
    <article
      id={`tile-${card.id}`}
      onMouseEnter={() => onHover?.(card.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`group relative scroll-mt-4 rounded-xl p-1.5 transition-colors duration-200 ease-out-quint ${active ? "bg-surface" : ""}`}
    >
      <div className="relative">
        <div
          ref={strip}
          className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-lg bg-surface [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {card.photos.map((src, i) => (
            <Link key={src} href={href} tabIndex={-1} aria-hidden="true" className="relative h-full w-full shrink-0 snap-start">
              <Image
                src={src}
                alt=""
                fill
                sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 92vw"
                preload={preload && i === 0}
                className="object-cover"
              />
            </Link>
          ))}
        </div>
        <ShortlistButton id={card.id} title={card.title} className="absolute top-1.5 right-1.5" />
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-ink/70 px-2 py-0.5 text-[12px] font-medium text-canvas">
          {card.photos.length} photos
        </span>
        {[-1, 1].map((dir) => (
          <button
            key={dir}
            type="button"
            onClick={() => scroll(dir)}
            aria-label={dir < 0 ? "Previous photo" : "Next photo"}
            className={`absolute top-1/2 hidden h-8 w-8 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-canvas/90 text-ink opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 md:grid ${dir < 0 ? "left-2" : "right-2"}`}
          >
            <svg viewBox="0 0 16 16" className={`h-4 w-4 ${dir < 0 ? "rotate-180" : ""}`} aria-hidden="true">
              <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>

      <div className="relative px-1 pt-3 pb-2">
        <p className="tabular-nums">
          <span className="text-[1.375rem] leading-none font-semibold">
            {rent ? inr(card.price + card.maintenance) : inrShort(card.price)}
          </span>
          {rent && <span className="text-muted"> /month</span>}
        </p>
        <p className="mt-1 text-[14px] text-muted tabular-nums">
          {rent
            ? card.maintenance
              ? `${inr(card.price)} rent + ${inr(card.maintenance)} maintenance`
              : "No maintenance charge"
            : `${inr(Math.round(card.price / card.carpetSqft))} per sq ft`}
          {rent && card.deposit > 0 && <span className="block">Deposit {inr(card.deposit)}</span>}
        </p>
        <p className="mt-2 flex flex-wrap gap-x-2 text-[15px]">
          {[bhkLabel(card.bhk), sqft(card.carpetSqft), FURNISHING[card.furnishing]].map((f, i) => (
            <span key={f} className={i ? "border-l border-hairline pl-2" : ""}>
              {f}
            </span>
          ))}
        </p>
        <h3 className="mt-1 truncate text-[15px] text-muted">
          <Link
            href={href}
            className="after:absolute after:inset-0 after:rounded-lg hover:text-ink focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-indigo"
          >
            {card.area}, {card.locality}
          </Link>
        </h3>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          {card.featured && <span className="rounded bg-streetlight/40 px-1.5 py-0.5 font-semibold text-ink">Featured</span>}
          {card.visited && <span className="rounded bg-verified-wash px-1.5 py-0.5 font-medium text-verified">Visited by our team</span>}
          <span className="rounded bg-verified-wash px-1.5 py-0.5 font-medium text-verified">
            Owner confirmed {daysAgo(card.confirmedDaysAgo)}
          </span>
          {card.metro.metres < 2000 && (
            <span className="text-muted">
              Metro {distance(card.metro.metres)}
            </span>
          )}
        </p>
      </div>
    </article>
  );
}
