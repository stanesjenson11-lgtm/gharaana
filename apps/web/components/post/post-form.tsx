"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { submitListing, type PostState } from "@/app/(app)/post/actions";
import { inr } from "@/lib/format";
import { LOCALITIES } from "@/lib/places";
import { AMENITIES, DEFAULT_TYPE, RENTALS } from "@/lib/search";
import { PinMap } from "./pin-map";

const SECTIONS = [
  ["what", "The home"],
  ["where", "Location"],
  ["money", "Price and terms"],
  ["amenities", "Amenities"],
  ["video", "Video tour"],
  ["photos", "Photos"],
  ["proof", "Proof of ownership"],
  ["you", "Your details"],
] as const;
const ROOMS = [
  ["living", "Living room"],
  ["bedroom", "Bedroom"],
  ["kitchen", "Kitchen"],
  ["bathroom", "Bathroom"],
  ["balcony", "Balcony or view"],
  ["exterior", "Building"],
] as const;
type Room = (typeof ROOMS)[number][0];
const GUESS: Room[] = ["living", "bedroom", "bedroom", "kitchen", "bathroom", "balcony", "exterior"];

const input =
  "h-11 w-full rounded-lg border border-hairline bg-canvas px-3 text-ink placeholder:text-muted focus-visible:border-indigo focus-visible:outline-none aria-[invalid=true]:border-danger";
const choice =
  "flex cursor-pointer items-center justify-center rounded-lg border border-hairline px-4 py-2.5 text-[15px] font-medium transition-colors duration-150 has-checked:border-indigo has-checked:bg-indigo/8 has-checked:text-indigo has-focus-visible:outline-2 has-focus-visible:outline-indigo";

type Upload = { id: string; name: string; preview?: string; status: "uploading" | "ready" | "error"; key?: string; error?: string };

async function upload(file: File, kind: "photo" | "proof"): Promise<string> {
  const body = new FormData();
  body.set("kind", kind);
  body.set("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Upload failed. Check your connection and try again.");
  return json.key;
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid content-start gap-1.5 text-[14px] font-medium">
      {label}
      {children}
      {hint && !error && <span className="font-normal text-muted">{hint}</span>}
      {error && <span className="font-normal text-danger">{error}</span>}
    </label>
  );
}

function Choices({ name, legend, options, defaultValue, multiple, error }: { name: string; legend: string; options: readonly (readonly [string, string])[]; defaultValue?: string; multiple?: boolean; error?: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[14px] font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([value, label]) => (
          <label key={value} className={choice}>
            <input type={multiple ? "checkbox" : "radio"} name={name} value={value} defaultChecked={value === defaultValue} required={!multiple} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
      {error && <p className="mt-1.5 text-[14px] text-danger">{error}</p>}
    </fieldset>
  );
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-hairline py-10 first:border-t-0 first:pt-0">
      <h2 id={`${id}-h`} className="text-xl font-semibold">
        {title}
      </h2>
      {intro && <p className="mt-1 max-w-[60ch] text-muted">{intro}</p>}
      <div className="mt-6 grid gap-6">{children}</div>
    </section>
  );
}

export function PostForm({ name, phone }: { name: string; phone: string | null }) {
  const [state, action, pending] = useActionState<PostState, FormData>(submitListing, { status: "idle" });
  const [type, setType] = useState<"rent" | "buy">(DEFAULT_TYPE);
  const who = type === "rent" ? "tenant" : "buyer";
  const [price, setPrice] = useState(0);
  const [maintenance, setMaintenance] = useState(0);
  const [locality, setLocality] = useState("");
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [photos, setPhotos] = useState<(Upload & { room: Room })[]>([]);
  const [proof, setProof] = useState<Upload | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  const e = state.status === "error" ? state.errors : {};
  const uploading = photos.some((p) => p.status === "uploading") || proof?.status === "uploading";
  const centre = LOCALITIES[Object.keys(LOCALITIES).find((l) => l.toLowerCase() === locality.trim().toLowerCase()) ?? ""];

  useEffect(() => {
    if (state.status !== "idle") summary.current?.focus();
  }, [state]);
  // Free blob previews when the form goes away; removals free their own.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const patchPhoto = (id: string, patch: Partial<Upload & { room: Room }>) => setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  async function addPhotos(files: File[]) {
    const added = files.slice(0, 20 - photos.length).map((file, i) => {
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      const photo = { id: crypto.randomUUID(), name: file.name, preview, status: "uploading" as const, room: GUESS[photos.length + i] ?? ("living" as Room) };
      return { file, photo };
    });
    setPhotos((ps) => [...ps, ...added.map((a) => a.photo)]);
    // One at a time: kinder to a phone on 4G and to a 1-vCPU server.
    for (const { file, photo } of added) {
      try {
        patchPhoto(photo.id, { status: "ready", key: await upload(file, "photo") });
      } catch (err) {
        patchPhoto(photo.id, { status: "error", error: (err as Error).message });
      }
    }
  }

  async function addProof(file: File) {
    const id = crypto.randomUUID();
    setProof({ id, name: file.name, status: "uploading" });
    try {
      const key = await upload(file, "proof");
      setProof({ id, name: file.name, status: "ready", key });
    } catch (err) {
      setProof({ id, name: file.name, status: "error", error: (err as Error).message });
    }
  }

  if (state.status === "done") {
    return (
      <div ref={summary} tabIndex={-1} className="mx-auto max-w-xl py-16 text-center focus-visible:outline-none">
        <p className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-verified-wash text-verified">
          <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </p>
        <h1 className="mt-5 text-[1.75rem] font-semibold">Thanks, {state.name}. Your home is in the review queue.</h1>
        <p className="mt-3 text-muted">Someone on our team checks the photos, the details and your ownership proof, usually within a day. You can follow it from your account.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/account" className="inline-flex h-12 items-center rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep">
            Go to your account
          </Link>
          <Link href="/search" className="inline-flex h-12 items-center rounded-full border border-hairline px-6 font-semibold hover:border-muted">
            See homes like yours
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-x-10 lg:grid-cols-[200px_minmax(0,1fr)]">
      <header className="mb-10 max-w-2xl lg:col-start-2">
        <h1 className="text-[2rem] leading-tight font-semibold text-balance">Post your property. It&rsquo;s free.</h1>
        <p className="mt-2 text-muted">About ten minutes. Keep a bill or tax receipt and a few photos handy.</p>
      </header>
      <nav aria-label="Form sections" className="hidden lg:block">
        <ol className="sticky top-24 grid gap-1 text-[15px]">
          {SECTIONS.map(([id, label], i) => (
            <li key={id}>
              <a href={`#${id}`} className="flex gap-3 rounded-md px-2 py-1.5 text-muted hover:bg-surface hover:text-ink">
                <span className="w-4 text-right tabular-nums">{i + 1}</span>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          const data = new FormData(ev.currentTarget);
          startTransition(() => action(data));
        }}
        className="min-w-0 max-w-2xl"
      >
        {state.status === "error" && (
          <div ref={summary} tabIndex={-1} role="alert" className="mb-8 rounded-xl bg-danger/8 p-4 focus-visible:outline-none">
            <p className="font-semibold">A few things need fixing before this can go to review:</p>
            <ul className="mt-2 list-disc pl-5 text-[15px]">
              {Object.values(e).map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        <Section id="what" title="The home">
          <fieldset>
            <legend className="mb-1.5 text-[14px] font-medium">You want to</legend>
            <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
              {(
                [
                  ["rent", "Rent it out"],
                  ["buy", "Sell it"],
                ] as const
              )
                .filter(([v]) => RENTALS || v === "buy")
                .map(([v, l]) => (
                <label key={v} className={choice}>
                  <input type="radio" name="type" value={v} checked={type === v} onChange={() => setType(v)} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <Choices name="kind" legend="Property type" defaultValue="apartment" options={[["apartment", "Flat"], ["independent-house", "Independent house"], ["villa", "Villa"]]} />
          <Choices name="bhk" legend="Bedrooms" defaultValue="2" options={[["0", "1 RK"], ["1", "1 BHK"], ["2", "2 BHK"], ["3", "3 BHK"], ["4", "4+ BHK"]]} />
          {type === "buy" && <Choices name="saleCondition" legend="New or resale" defaultValue="resale" options={[["new", "New from the builder"], ["resale", "Resale"]]} />}          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Carpet area (sq ft)" error={e.carpetSqft}>
              <input name="carpetSqft" type="number" inputMode="numeric" min={100} required className={input} aria-invalid={!!e.carpetSqft} />
            </Field>
            <Field label="Floor" hint="0 for ground" error={e.floor}>
              <input name="floor" type="number" inputMode="numeric" min={0} required className={input} aria-invalid={!!e.floor} />
            </Field>
            <Field label="Floors in building" error={e.totalFloors}>
              <input name="totalFloors" type="number" inputMode="numeric" min={1} required className={input} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Main door faces">
              <select name="facing" required defaultValue="" className={input}>
                <option value="" disabled>
                  Choose a direction
                </option>
                {["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Age of building (years)">
              <input name="ageYears" type="number" inputMode="numeric" min={0} required className={input} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bathrooms" error={e.bathrooms}>
              <input name="bathrooms" type="number" inputMode="numeric" min={1} max={10} defaultValue={2} required className={input} aria-invalid={!!e.bathrooms} />
            </Field>
            <Field label="Balconies">
              <input name="balconies" type="number" inputMode="numeric" min={0} max={10} defaultValue={1} required className={input} />
            </Field>
          </div>
          <Choices name="furnishing" legend="Furnishing" defaultValue="semi" options={[["full", "Furnished"], ["semi", "Semi-furnished"], ["none", "Unfurnished"]]} />
          <Field label="About the home" hint={`What a ${who} would want to know: light, water supply, the neighbours, what's nearby.`} error={e.description}>
            <textarea name="description" required minLength={40} maxLength={1500} rows={4} className={`${input} h-auto py-2`} aria-invalid={!!e.description} />
          </Field>
        </Section>

        <Section id="where" title="Location" intro={`${who === "tenant" ? "Tenants" : "Buyers"} see the locality and an approximate spot on the map. The full address is only shared with people who contact you.`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Locality" error={e.locality}>
              <input
                name="locality"
                list="post-localities"
                required
                autoComplete="off"
                placeholder="e.g. HSR Layout"
                value={locality}
                onChange={(ev) => setLocality(ev.target.value)}
                className={input}
                aria-invalid={!!e.locality}
              />
              <datalist id="post-localities">
                {Object.keys(LOCALITIES).map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </Field>
            <Field label="Block, sector or street" error={e.area}>
              <input name="area" required placeholder="e.g. Sector 2" className={input} aria-invalid={!!e.area} />
            </Field>
          </div>
          <Field label="Full address" hint="Private. Never shown on the listing." error={e.address}>
            <textarea name="address" required rows={3} className={`${input} h-auto py-2`} aria-invalid={!!e.address} />
          </Field>
          <div>
            <p className="text-[14px] font-medium">Where is the building?</p>
            <p className="mt-0.5 mb-2 text-[14px] text-muted">
              {pin ? "Pin placed. Drag it to adjust." : centre ? "Tap the map on your building, or we'll use the centre of " + locality.trim() + "." : "Tap the map on your building."}
            </p>
            <PinMap pin={pin} onPin={setPin} centre={centre} />
            {e.lat && <p className="mt-1.5 text-[14px] text-danger">{e.lat}</p>}
            <input type="hidden" name="lat" value={pin?.[0] ?? ""} />
            <input type="hidden" name="lng" value={pin?.[1] ?? ""} />
          </div>
        </Section>

        <Section id="money" title="Price and terms" intro={type === "rent" ? "Tenants see rent and maintenance as one monthly number, so they know exactly what they'll pay." : "Buyers see the price, the carpet area and the monthly maintenance together."}>
          <div className={`grid gap-4 ${type === "rent" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            <Field label={type === "rent" ? "Monthly rent (₹)" : "Price (₹)"} error={e.price}>
              <input name="price" type="number" inputMode="numeric" min={1000} required onChange={(ev) => setPrice(Number(ev.target.value) || 0)} className={`${input} tabular-nums`} aria-invalid={!!e.price} />
            </Field>
            <Field label="Maintenance per month (₹)" hint="0 if included">
              <input name="maintenance" type="number" inputMode="numeric" min={0} onChange={(ev) => setMaintenance(Number(ev.target.value) || 0)} className={`${input} tabular-nums`} />
            </Field>
            {type === "rent" && (
              <Field label="Security deposit (₹)" error={e.deposit}>
                <input name="deposit" type="number" inputMode="numeric" min={0} required className={`${input} tabular-nums`} aria-invalid={!!e.deposit} />
              </Field>
            )}
          </div>
          {type === "rent" && price > 0 && (
            <p className="rounded-lg bg-surface p-3 text-[15px] tabular-nums" aria-live="polite">
              Tenants will see <strong>{inr(price + maintenance)} a month</strong>
              {maintenance > 0 && ` (${inr(price)} rent + ${inr(maintenance)} maintenance)`}.
            </p>
          )}
          {type === "rent" && (
            <>
              <Field label="Available from">
                <input name="availableFrom" type="date" className={`${input} sm:max-w-xs`} />
              </Field>
              <Choices name="tenants" legend="You'd prefer (leave empty for anyone)" multiple options={[["family", "Families"], ["bachelors", "Bachelors"], ["company", "Company lease"]]} />
              <Choices name="pets" legend="Pets" defaultValue="yes" options={[["yes", "Allowed"], ["no", "Not allowed"]]} />
              <Choices name="food" legend="Food" defaultValue="any" options={[["any", "No restrictions"], ["veg", "Vegetarian only"]]} />
            </>
          )}
          {type === "buy" && (
            <>
              <Field label="Ready to move in from" hint="Leave empty if it's ready now">
                <input name="availableFrom" type="date" className={`${input} sm:max-w-xs`} />
              </Field>
              <Choices name="pets" legend="Pets in the society" defaultValue="yes" options={[["yes", "Allowed"], ["no", "Not allowed"]]} />
              <input type="hidden" name="food" value="any" />
            </>
          )}          <Choices name="parking" legend="Parking" defaultValue="car" options={[["none", "None"], ["bike", "Two-wheeler"], ["car", "Car"]]} />
        </Section>

        <Section id="amenities" title="Amenities">
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {AMENITIES.map((a) => (
              <label key={a} className="flex cursor-pointer items-center gap-3 rounded-md py-1.5 text-[15px]">
                <input type="checkbox" name="amenities" value={a} className="h-4 w-4 accent-indigo" />
                {a}
              </label>
            ))}
          </div>
        </Section>

        <Section id="video" title="Video tour" intro="Optional. Upload a walk-through to YouTube (it can be unlisted) and paste the link. Buyers can play it on your listing.">
          <Field label="YouTube link" error={e.videoUrl}>
            <input name="videoUrl" type="url" inputMode="url" placeholder="https://youtu.be/…" className={input} aria-invalid={!!e.videoUrl} />
          </Field>
        </Section>

        <Section id="photos" title="Photos" intro="At least 4: the living room, each bedroom, the kitchen and a bathroom. We remove location data from every photo before it's stored.">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-hairline px-6 py-10 text-center hover:border-indigo has-focus-visible:border-indigo">
            <span className="font-semibold text-indigo">Add photos</span>
            <span className="text-[14px] text-muted">JPG or PNG from your phone or computer, up to 20</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(ev) => {
                addPhotos([...(ev.target.files ?? [])]);
                ev.target.value = "";
              }}
            />
          </label>
          {e.photoKeys && <p className="text-[14px] text-danger">{e.photoKeys}</p>}
          {photos.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((p, i) => (
                <li key={p.id}>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file */}
                    <img src={p.preview} alt={`Photo ${i + 1}: ${p.name}`} className={`h-full w-full object-cover ${p.status === "ready" ? "" : "opacity-60"}`} />
                    <span className="absolute bottom-1.5 left-1.5 rounded bg-ink/75 px-1.5 py-0.5 text-[12px] font-medium text-canvas" aria-live="polite">
                      {p.status === "uploading" ? "Uploading…" : p.status === "error" ? "Failed" : i === 0 ? "Cover" : "Ready"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (p.preview) URL.revokeObjectURL(p.preview);
                        setPhotos((ps) => ps.filter((x) => x.id !== p.id));
                      }}
                      aria-label={`Remove photo ${i + 1}`}
                      className="absolute top-1.5 right-1.5 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-canvas/90 text-ink"
                    >
                      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
                        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  {p.status === "error" ? (
                    <p className="mt-1 text-[13px] text-danger">{p.error}</p>
                  ) : (
                    <select
                      aria-label={`Room in photo ${i + 1}`}
                      value={p.room}
                      onChange={(ev) => patchPhoto(p.id, { room: ev.target.value as Room })}
                      className="mt-1.5 h-9 w-full rounded-lg border border-hairline bg-canvas px-2 text-[14px]"
                    >
                      {ROOMS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  )}
                  {p.status === "ready" && (
                    <>
                      <input type="hidden" name="photoKey" value={p.key} />
                      <input type="hidden" name="photoRoom" value={p.room} />
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="proof" title="Proof of ownership" intro="An electricity bill or property tax receipt in your name, or a family member's. Only our review team sees it, and we delete it 30 days after we decide.">
          <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-hairline p-4 hover:border-indigo has-focus-visible:border-indigo">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-indigo">
              <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
                <path d="M5 2h7l4 4v12H5z M12 2v4h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="min-w-0" aria-live="polite">
              <span className="block truncate font-semibold">{proof?.name ?? "Upload a bill or tax receipt"}</span>
              <span className={`text-[14px] ${proof?.status === "error" ? "text-danger" : "text-muted"}`}>
                {proof?.status === "uploading" ? "Uploading…" : proof?.status === "ready" ? "Uploaded. Tap to replace." : proof?.error ?? "PDF, JPG or PNG"}
              </span>
            </span>
            <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(ev) => ev.target.files?.[0] && addProof(ev.target.files[0])} />
          </label>
          <input type="hidden" name="proofKey" value={proof?.status === "ready" ? proof.key : ""} />
          {e.proofKey && <p className="text-[14px] text-danger">{e.proofKey}</p>}
        </Section>

        <Section id="you" title="Your details">
          <Field label="Your name" error={e.ownerName}>
            <input name="ownerName" required autoComplete="name" defaultValue={name} className={`${input} sm:max-w-sm`} aria-invalid={!!e.ownerName} />
          </Field>
          <p className="max-w-[60ch] text-[15px] text-muted">
            {who === "tenant" ? "Tenants" : "Buyers"} who sign in with a verified phone will see your number{phone && <span className="tabular-nums text-ink"> {phone}</span>}. Each person can see only a few numbers a day, and we never show yours to anyone who isn&rsquo;t signed in.
          </p>
        </Section>

        <div className="flex flex-wrap items-center gap-4 border-t border-hairline pt-8">
          <button
            type="submit"
            disabled={pending || uploading}
            className="h-12 cursor-pointer rounded-full bg-indigo px-8 font-semibold text-canvas transition-[background-color,transform] duration-150 hover:bg-indigo-deep active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
          >
            {pending ? "Sending…" : uploading ? "Waiting for uploads…" : "Send for review"}
          </button>
          <p className="text-[14px] text-muted">Free. A person reviews every listing before it goes live.</p>
        </div>
      </form>
    </div>
  );
}
