"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { bhkLabel, inr, inrShort } from "@/lib/format";
import imageLoader from "@/lib/image-loader";
import type { Card } from "@/lib/listings";
import { SORTS, toQuery, type SearchParams } from "@/lib/search";
import { FilterBar } from "./filter-bar";
import { ListingTile } from "./listing-tile";
import { MapView } from "./map-view";
import { SaveSearch } from "./save-search";

const SORT_LABEL: Record<(typeof SORTS)[number], string> = {
  relevant: "Recently confirmed",
  newest: "Newest listed",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
};

export function SearchView({
  params: p,
  cards,
  centre,
  sample,
}: {
  params: SearchParams;
  cards: Card[];
  centre?: [number, number];
  sample: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [mapWanted, setMapWanted] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [follow, setFollow] = useState(true);

  // The map's JS (~250 KB) only loads on wide screens, or once a phone user opens the map.
  useEffect(() => {
    const wide = matchMedia("(min-width: 1024px)");
    const sync = () => wide.matches && setMapWanted(true);
    sync();
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
  }, []);

  const go = (patch: Partial<SearchParams>) =>
    start(() => router.replace(`/search?${toQuery({ ...p, ...patch })}`, { scroll: false }));

  const select = (id: string) => {
    setSelectedId(id);
    document.getElementById(`tile-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const place = p.area ? "in your drawn area" : p.bbox ? "in this map area" : p.q ? `near ${p.q}` : "in Bengaluru";
  const what = p.type === "rent" ? "for rent" : "for sale";
  const selected = cards.find((c) => c.id === selectedId);
  const fitKey = `${p.type}|${p.q ?? ""}|${p.area?.join(",") ?? ""}`;

  return (
    <div className="flex h-[calc(100svh-4rem)] flex-col">
      <FilterBar p={p} go={go} />
      <div className="relative grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section
          aria-labelledby="results-title"
          aria-busy={pending}
          className={`min-h-0 overflow-y-auto px-3 pt-5 pb-24 transition-opacity duration-200 sm:px-5 ${pending ? "opacity-60" : ""} ${view === "map" ? "hidden lg:block" : ""}`}
        >
          <div className="flex flex-wrap items-end justify-between gap-3 px-1.5">
            <div>
              <h1 id="results-title" className="text-[1.375rem] leading-tight font-semibold">
                Homes {what} {place}
              </h1>
              <p className="mt-1 text-[14px] text-muted" aria-live="polite">
                {cards.length === 1 ? "1 home" : `${cards.length} homes`}, every one listed by its owner
                {sample && <span className="block">Includes sample listings for the demo.</span>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SaveSearch query={toQuery(p)} />
              <label className="flex items-center gap-2 text-[14px] text-muted">
                Sort
                <select
                  value={p.sort}
                  onChange={(e) => go({ sort: e.target.value as SearchParams["sort"] })}
                  className="h-9 cursor-pointer rounded-lg border border-hairline bg-canvas px-2 text-[14px] font-medium text-ink"
                >
                  {SORTS.map((s) => (
                    <option key={s} value={s}>
                      {SORT_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {cards.length ? (
            <div className="mt-4 grid gap-x-3 gap-y-4 sm:grid-cols-2 2xl:grid-cols-3">
              {cards.map((c, i) => (
                <ListingTile key={c.id} card={c} active={c.id === (hoverId ?? selectedId)} onHover={setHoverId} preload={i < 2} />
              ))}
            </div>
          ) : (
            <div className="mx-1.5 mt-10 max-w-md border-t border-hairline pt-8">
              <h2 className="text-xl font-semibold">No homes match all of that</h2>
              <p className="mt-2 text-muted">
                Try fewer filters, a wider budget, or a bigger part of the map. New homes are approved every day, so a saved
                search is worth keeping.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => go({ bhk: undefined, min: undefined, max: undefined, furnishing: undefined, tenants: undefined, avail: undefined, kind: undefined, pets: undefined, parking: undefined, cond: undefined, floor: undefined, amen: undefined })}
                  className="h-10 cursor-pointer rounded-full bg-indigo px-5 font-semibold text-canvas hover:bg-indigo-deep"
                >
                  Clear filters
                </button>
                {(p.area || p.bbox || p.q) && (
                  <button
                    type="button"
                    onClick={() => go({ area: undefined, bbox: undefined, q: undefined })}
                    className="h-10 cursor-pointer rounded-full border border-hairline px-5 font-semibold hover:border-muted"
                  >
                    Search all of Bengaluru
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <div className={`relative min-h-0 border-hairline lg:border-l ${view === "list" ? "hidden lg:block" : ""}`}>
          {mapWanted && (
            <MapView
              cards={cards}
              highlightId={hoverId ?? selectedId}
              onHover={setHoverId}
              onSelect={select}
              area={p.area}
              bbox={p.bbox}
              centre={centre}
              fitKey={fitKey}
              onMoved={(bbox) => follow && !p.area && go({ bbox })}
              drawing={drawing}
              onDrawn={(area) => {
                setDrawing(false);
                if (area) go({ area, bbox: undefined });
              }}
              visible={view === "map"}
            />
          )}

          <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
            <div className="pointer-events-auto flex gap-2">
              {drawing ? (
                <>
                  <p className="rounded-full bg-ink px-4 py-2 text-[14px] font-medium text-canvas">Drag a loop around where you&rsquo;d like to live</p>
                  <button type="button" onClick={() => setDrawing(false)} className="h-9 cursor-pointer rounded-full bg-canvas px-4 text-[14px] font-semibold shadow">
                    Cancel
                  </button>
                </>
              ) : p.area ? (
                <button type="button" onClick={() => go({ area: undefined })} className="h-9 cursor-pointer rounded-full bg-canvas px-4 text-[14px] font-semibold shadow">
                  Remove drawn area
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setDrawing(true)}
                  className="flex h-9 cursor-pointer items-center gap-2 rounded-full bg-canvas px-4 text-[14px] font-semibold shadow"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4 text-indigo" aria-hidden="true">
                    <path d="M3 11c1-4 4-7 7-7 2 0 3 1.5 2.4 3.2C11.6 9.6 7 9 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Draw an area
                </button>
              )}
            </div>
            {!p.area && !drawing && (
              <label className="pointer-events-auto flex h-9 cursor-pointer items-center gap-2 rounded-full bg-canvas px-4 text-[14px] font-medium shadow">
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="h-4 w-4 accent-indigo" />
                Search as I move the map
              </label>
            )}
          </div>

          {/* On phones, tapping a pin shows the home here instead of jumping to the list. */}
          {selected && view === "map" && (
            <Link
              href={`/homes/${selected.id}`}
              className="absolute inset-x-3 bottom-20 flex gap-3 rounded-xl bg-canvas p-2 shadow-[0_12px_32px_-12px_oklch(0.22_0.025_266/0.5)] lg:hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny thumbnail; next/image adds nothing here */}
              <img src={imageLoader({ src: selected.photos[0], width: 240 })} alt="" className="aspect-[4/3] w-28 shrink-0 rounded-lg object-cover" />
              <span className="min-w-0 py-1 text-[14px]">
                <span className="block text-[17px] font-semibold tabular-nums">
                  {selected.type === "rent" ? `${inr(selected.price + selected.maintenance)} /month` : inrShort(selected.price)}
                </span>
                <span className="block text-muted">
                  {bhkLabel(selected.bhk)}, {selected.area}
                </span>
                <span className="block truncate text-muted">{selected.locality}</span>
              </span>
            </Link>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setMapWanted(true);
            setView(view === "list" ? "map" : "list");
          }}
          className="fixed bottom-5 left-1/2 z-20 flex h-12 -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full bg-ink px-6 font-semibold text-canvas shadow-lg lg:hidden"
        >
          {view === "list" ? "Map" : "List"}
        </button>
      </div>
    </div>
  );
}
