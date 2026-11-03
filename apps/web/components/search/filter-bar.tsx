"use client";

import type { CSSProperties, ReactNode } from "react";
import { inrShort } from "@/lib/format";
import { LOCALITIES } from "@/lib/places";
import { AMENITIES, FLOORS, RENTALS, type SearchParams } from "@/lib/search";

type Go = (patch: Partial<SearchParams>) => void;

const BUDGET = {
  rent: [10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000, 150000],
  buy: [2_500_000, 5_000_000, 7_500_000, 10_000_000, 15_000_000, 20_000_000, 30_000_000, 50_000_000, 100_000_000],
};
const BHK = [
  [0, "1 RK"],
  [1, "1 BHK"],
  [2, "2 BHK"],
  [3, "3 BHK"],
  [4, "4+ BHK"],
] as const;
const FURNISHING = [
  ["full", "Furnished"],
  ["semi", "Semi-furnished"],
  ["none", "Unfurnished"],
] as const;

const toggle = <T,>(list: T[] | undefined, v: T) => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v]);

const pill =
  "inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-[15px] font-medium whitespace-nowrap transition-colors duration-150 ease-out-quint";
const pillState = (on: boolean) => (on ? "border-ink bg-surface text-ink" : "border-hairline text-ink hover:border-muted");

function Pop({ id, label, on, children }: { id: string; label: string; on: boolean; children: ReactNode }) {
  return (
    <>
      <button type="button" popoverTarget={id} className={`${pill} ${pillState(on)}`} style={{ anchorName: `--${id}` } as CSSProperties}>
        {label}
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div id={id} popover="auto" className="filter-pop" style={{ positionAnchor: `--${id}` } as CSSProperties}>
        {children}
      </div>
    </>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-[15px] hover:bg-surface">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-indigo" />
      {children}
    </label>
  );
}

function Radio({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-[15px] hover:bg-surface">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="h-4 w-4 accent-indigo" />
      {children}
    </label>
  );
}

const legend = "px-2 pb-1 text-[13px] font-semibold text-muted";

export function FilterBar({ p, go }: { p: SearchParams; go: Go }) {
  const steps = BUDGET[p.type];
  const budgetLabel =
    p.min || p.max ? `${p.min ? inrShort(p.min) : "Any"} – ${p.max ? inrShort(p.max) : "Any"}` : "Budget";
  const bhkLabel = p.bhk?.length ? BHK.filter(([v]) => p.bhk!.includes(v)).map(([, l]) => l.replace(" BHK", "")).join(", ") + " BHK" : "BHK";
  const more = [p.tenants, p.avail, p.pets, p.parking, p.kind?.length, p.cond, p.floor?.length].filter(Boolean).length;

  return (
    <div className="border-b border-hairline bg-canvas">
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:px-6">
        <form
          role="search"
          className="flex h-10 min-w-[220px] flex-1 items-center rounded-full border border-hairline pr-1 pl-4 focus-within:border-indigo sm:max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
            go({ q: q || undefined, bbox: undefined, area: undefined });
          }}
        >
          <label htmlFor="search-q" className="sr-only">
            Locality, landmark or metro station
          </label>
          <input
            id="search-q"
            key={p.q ?? ""}
            name="q"
            type="search"
            list="localities"
            defaultValue={p.q ?? ""}
            placeholder="Locality or landmark in Bengaluru"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-muted focus-visible:outline-none"
          />
          <datalist id="localities">
            {Object.keys(LOCALITIES).map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          <button type="submit" aria-label="Search" className="grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-indigo text-canvas hover:bg-indigo-deep">
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </form>

        {RENTALS && (
          <div role="group" aria-label="Rent or buy" className="flex shrink-0 rounded-full border border-hairline p-1">
            {(["rent", "buy"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={p.type === t}
                onClick={() => go({ type: t, min: undefined, max: undefined })}
                className={`h-8 cursor-pointer rounded-full px-4 text-[15px] font-medium transition-colors duration-150 ${p.type === t ? "bg-ink text-canvas" : "text-muted hover:text-ink"}`}
              >
                {t === "rent" ? "Rent" : "Buy"}
              </button>
            ))}
          </div>
        )}

        <Pop id="f-bhk" label={bhkLabel} on={!!p.bhk?.length}>
          <fieldset>
            <legend className={legend}>Bedrooms</legend>
            {BHK.map(([v, l]) => (
              <Check key={v} checked={!!p.bhk?.includes(v)} onChange={() => go({ bhk: toggle(p.bhk, v) })}>
                {l}
              </Check>
            ))}
          </fieldset>
        </Pop>

        <Pop id="f-budget" label={budgetLabel} on={!!(p.min || p.max)}>
          <fieldset className="grid grid-cols-2 gap-3 p-2">
            <legend className={legend}>{p.type === "rent" ? "Monthly rent + maintenance" : "Price"}</legend>
            {(["min", "max"] as const).map((k) => (
              <label key={k} className="grid gap-1 text-[13px] text-muted">
                {k === "min" ? "Minimum" : "Maximum"}
                <select
                  value={p[k] ?? ""}
                  onChange={(e) => go({ [k]: e.target.value ? Number(e.target.value) : undefined })}
                  className="h-10 rounded-lg border border-hairline bg-canvas px-2 text-[15px] text-ink tabular-nums"
                >
                  <option value="">Any</option>
                  {steps.map((n) => (
                    <option key={n} value={n}>
                      {inrShort(n)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
        </Pop>

        <Pop id="f-furnishing" label="Furnishing" on={!!p.furnishing?.length}>
          <fieldset>
            <legend className={legend}>Furnishing</legend>
            {FURNISHING.map(([v, l]) => (
              <Check key={v} checked={!!p.furnishing?.includes(v)} onChange={() => go({ furnishing: toggle(p.furnishing, v) })}>
                {l}
              </Check>
            ))}
          </fieldset>
        </Pop>

        <Pop id="f-amen" label={p.amen?.length ? `Amenities (${p.amen.length})` : "Amenities"} on={!!p.amen?.length}>
          <fieldset className="grid w-[min(92vw,440px)] sm:grid-cols-2">
            <legend className={legend}>Must have all of</legend>
            {AMENITIES.map((a) => (
              <Check key={a} checked={!!p.amen?.includes(a)} onChange={() => go({ amen: toggle(p.amen, a) })}>
                {a}
              </Check>
            ))}
          </fieldset>
        </Pop>

        <Pop id="f-more" label={more ? `More filters (${more})` : "More filters"} on={more > 0}>
          <div className="grid w-[min(92vw,440px)] gap-4 sm:grid-cols-2">
            {p.type === "rent" && (
              <fieldset>
                <legend className={legend}>Owner prefers</legend>
                <Radio name="tenants" checked={!p.tenants} onChange={() => go({ tenants: undefined })}>
                  Anyone
                </Radio>
                {(["family", "bachelors", "company"] as const).map((t) => (
                  <Radio key={t} name="tenants" checked={p.tenants === t} onChange={() => go({ tenants: t })}>
                    {t === "family" ? "Families" : t === "bachelors" ? "Bachelors" : "Company lease"}
                  </Radio>
                ))}
              </fieldset>
            )}
            {p.type === "buy" && (
              <fieldset>
                <legend className={legend}>Condition</legend>
                <Radio name="cond" checked={!p.cond} onChange={() => go({ cond: undefined })}>
                  Any
                </Radio>
                <Radio name="cond" checked={p.cond === "new"} onChange={() => go({ cond: "new" })}>
                  New from the builder
                </Radio>
                <Radio name="cond" checked={p.cond === "resale"} onChange={() => go({ cond: "resale" })}>
                  Resale
                </Radio>
              </fieldset>
            )}
            <fieldset>
              <legend className={legend}>{p.type === "rent" ? "Move in" : "Possession"}</legend>
              <Radio name="avail" checked={!p.avail} onChange={() => go({ avail: undefined })}>
                {p.type === "rent" ? "Any time" : "Any"}
              </Radio>
              {(
                [
                  ["now", p.type === "rent" ? "Immediately" : "Ready to move"],
                  ["15", "Within 15 days"],
                  ["30", "Within 30 days"],
                ] as const
              ).map(([v, l]) => (
                <Radio key={v} name="avail" checked={p.avail === v} onChange={() => go({ avail: v })}>
                  {l}
                </Radio>
              ))}
            </fieldset>
            <fieldset>
              <legend className={legend}>Property type</legend>
              {(
                [
                  ["apartment", "Flat"],
                  ["independent-house", "Independent house"],
                  ["villa", "Villa"],
                ] as const
              ).map(([v, l]) => (
                <Check key={v} checked={!!p.kind?.includes(v)} onChange={() => go({ kind: toggle(p.kind, v) })}>
                  {l}
                </Check>
              ))}
            </fieldset>
            <fieldset>
              <legend className={legend}>Floor</legend>
              {FLOORS.map(([v, l]) => (
                <Check key={v} checked={!!p.floor?.includes(v)} onChange={() => go({ floor: toggle(p.floor, v) })}>
                  {l}
                </Check>
              ))}
            </fieldset>
            <fieldset>
              <legend className={legend}>Must have</legend>
              <Check checked={!!p.pets} onChange={() => go({ pets: p.pets ? undefined : "1" })}>
                {p.type === "rent" ? "Pets allowed" : "Pet-friendly society"}
              </Check>
              <Check checked={!!p.parking} onChange={() => go({ parking: p.parking ? undefined : "1" })}>
                Car parking
              </Check>
            </fieldset>
          </div>
        </Pop>

        {(p.bhk?.length || p.min || p.max || p.furnishing?.length || p.amen?.length || more > 0) && (
          <button
            type="button"
            onClick={() => go({ bhk: undefined, min: undefined, max: undefined, furnishing: undefined, tenants: undefined, avail: undefined, kind: undefined, pets: undefined, parking: undefined, cond: undefined, floor: undefined, amen: undefined })}
            className="h-10 shrink-0 cursor-pointer rounded-full px-3 text-[15px] font-medium whitespace-nowrap text-indigo hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
