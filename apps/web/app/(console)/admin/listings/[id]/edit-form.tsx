"use client";

import { startTransition, useActionState, type ReactNode } from "react";
import { saveListing, type EditState } from "../actions";

export type Details = {
  id: string;
  type: "rent" | "buy";
  kind: string;
  bhk: number;
  carpetSqft: number;
  floor: number;
  totalFloors: number;
  facing: string;
  furnishing: string;
  saleCondition: string | null;
  bathrooms: number;
  balconies: number;
  ageYears: number;
  locality: string;
  area: string;
  address: string;
  description: string;
  price: number;
  maintenance: number;
  deposit: number;
  availableFrom: string | null;
  tenants: string[];
  pets: boolean;
  nonVeg: boolean;
  parking: string;
  amenities: string[];
  videoUrl: string | null;
};

const input = "h-11 w-full rounded-lg border border-hairline bg-canvas px-3 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-indigo";
const DIRECTIONS = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"];

function Field({ label, error, wide, children }: { label: string; error?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`grid content-start gap-1 text-[13px] text-muted ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
      {error && <span className="text-[14px] font-medium text-danger">{error}</span>}
    </label>
  );
}

function Select({ name, value, options, errors }: { name: string; value: string | number; options: (string | [string | number, string])[]; errors: Record<string, string> }) {
  return (
    <select name={name} defaultValue={value} aria-invalid={!!errors[name]} className={input}>
      {options.map((o) => {
        const [v, l] = typeof o === "string" ? [o, o] : o;
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

export function EditForm({ d, amenities }: { d: Details; amenities: readonly string[] }) {
  const [state, run, pending] = useActionState<EditState, FormData>(saveListing.bind(null, d.id), {});
  const errors = state.errors ?? {};
  const num = (name: string, value: number, label: string, props: { min?: number; max?: number } = {}) => (
    <Field label={label} error={errors[name]}>
      <input name={name} type="number" inputMode="numeric" defaultValue={value} aria-invalid={!!errors[name]} className={`${input} tabular-nums`} {...props} />
    </Field>
  );

  return (
    // Sent by hand so a refused save keeps what was typed; a form action would reset the fields.
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => run(data));
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <Field label="Kind of home" error={errors.kind}>
        <Select name="kind" value={d.kind} errors={errors} options={[["apartment", "Apartment"], ["independent-house", "Independent house"], ["villa", "Villa"]]} />
      </Field>
      <Field label="Bedrooms" error={errors.bhk}>
        <Select name="bhk" value={d.bhk} errors={errors} options={[[0, "1 RK"], [1, "1 BHK"], [2, "2 BHK"], [3, "3 BHK"], [4, "4 BHK"]]} />
      </Field>
      <Field label="Locality" error={errors.locality}>
        <input name="locality" defaultValue={d.locality} aria-invalid={!!errors.locality} className={input} />
      </Field>
      <Field label="Block, sector or street" error={errors.area}>
        <input name="area" defaultValue={d.area} aria-invalid={!!errors.area} className={input} />
      </Field>
      <Field label="Full address (private, only the team sees it)" error={errors.address} wide>
        <input name="address" defaultValue={d.address} aria-invalid={!!errors.address} className={input} />
      </Field>

      {num("price", d.price, d.type === "rent" ? "Rent per month (₹)" : "Price (₹)", { min: 0 })}
      {num("maintenance", d.maintenance, "Maintenance per month (₹)", { min: 0 })}
      {d.type === "rent" && num("deposit", d.deposit, "Security deposit (₹)", { min: 0 })}
      {d.type === "buy" && (
        <Field label="New or resale" error={errors.saleCondition}>
          <Select name="saleCondition" value={d.saleCondition ?? "resale"} errors={errors} options={[["new", "New, from the builder"], ["resale", "Resale"]]} />
        </Field>
      )}

      {num("carpetSqft", d.carpetSqft, "Carpet area (sq ft)", { min: 100 })}
      {num("ageYears", d.ageYears, "Age of the building (years)", { min: 0 })}
      {num("floor", d.floor, "Floor", { min: 0 })}
      {num("totalFloors", d.totalFloors, "Floors in the building", { min: 1 })}
      {num("bathrooms", d.bathrooms, "Bathrooms", { min: 1 })}
      {num("balconies", d.balconies, "Balconies", { min: 0 })}
      <Field label="Main door faces" error={errors.facing}>
        <Select name="facing" value={d.facing} errors={errors} options={DIRECTIONS.includes(d.facing) ? DIRECTIONS : [d.facing, ...DIRECTIONS]} />
      </Field>
      <Field label="Furnishing" error={errors.furnishing}>
        <Select name="furnishing" value={d.furnishing} errors={errors} options={[["full", "Fully furnished"], ["semi", "Semi-furnished"], ["none", "Unfurnished"]]} />
      </Field>
      <Field label="Parking" error={errors.parking}>
        <Select name="parking" value={d.parking} errors={errors} options={[["none", "None"], ["bike", "Bike"], ["car", "Car"]]} />
      </Field>
      <Field label="Available from" error={errors.availableFrom}>
        <input name="availableFrom" type="date" defaultValue={d.availableFrom ?? ""} className={input} />
      </Field>
      <Field label="Pets allowed" error={errors.pets}>
        <Select name="pets" value={d.pets ? "yes" : "no"} errors={errors} options={[["yes", "Yes"], ["no", "No"]]} />
      </Field>
      <Field label="Food" error={errors.food}>
        <Select name="food" value={d.nonVeg ? "any" : "veg"} errors={errors} options={[["any", "Any"], ["veg", "Vegetarian only"]]} />
      </Field>

      <Field label="Description" error={errors.description} wide>
        <textarea name="description" rows={5} defaultValue={d.description} aria-invalid={!!errors.description} className="rounded-lg border border-hairline bg-canvas px-3 py-2 text-[15px] leading-normal text-ink focus-visible:outline-2 focus-visible:outline-indigo" />
      </Field>
      <Field label="Video tour (YouTube link)" error={errors.videoUrl} wide>
        <input name="videoUrl" defaultValue={d.videoUrl ?? ""} placeholder="https://youtu.be/…" aria-invalid={!!errors.videoUrl} className={input} />
      </Field>

      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-[13px] text-muted">Suits</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
          {[["family", "Families"], ["bachelors", "Bachelors"], ["company", "Companies"]].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2">
              <input type="checkbox" name="tenants" value={v} defaultChecked={d.tenants.includes(v)} className="h-4 w-4 accent-indigo" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-[13px] text-muted">Amenities</legend>
        <div className="grid gap-x-5 gap-y-2 text-[15px] sm:grid-cols-2 lg:grid-cols-3">
          {amenities.map((a) => (
            <label key={a} className="flex items-center gap-2">
              <input type="checkbox" name="amenities" value={a} defaultChecked={d.amenities.includes(a)} className="h-4 w-4 accent-indigo" />
              {a}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <button disabled={pending} className="h-11 cursor-pointer rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep disabled:opacity-60">
          {pending ? "Saving…" : "Save changes"}
        </button>
        <p aria-live="polite" className={`text-[14px] font-medium ${state.errors ? "text-danger" : "text-verified"}`}>
          {state.errors ? errors.form ?? "Some details need fixing. They are marked above." : state.ok}
        </p>
      </div>
    </form>
  );
}
