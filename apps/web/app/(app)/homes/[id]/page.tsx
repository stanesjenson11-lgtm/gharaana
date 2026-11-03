import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ContactOwner } from "@/components/listing/contact-owner";
import { Gallery } from "@/components/listing/gallery";
import { LocationMap } from "@/components/listing/location-map";
import { RequestLead } from "@/components/listing/request-lead";
import { StartChat } from "@/components/listing/start-chat";
import { VideoTour } from "@/components/listing/video-tour";
import { ListingTile } from "@/components/search/listing-tile";
import { ShortlistButton } from "@/components/shortlist";
import { bhkLabel, daysAgo, distance, inr, inrShort, sqft, youtubeId } from "@/lib/format";
import { cacheLife, cacheTag } from "next/cache";
import { getListing, listingIds, similarListings } from "@/lib/listings";
import { nearbyPlaces, nearestMetro, PLACES_SOURCE } from "@/lib/nearby";
import type { Listing } from "@/lib/search";

// Cached for an hour; approving, editing or confirming a listing calls updateTag(`listing:${id}`).
async function cachedListing(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`listing:${id}`);
  return getListing(id);
}

export async function generateStaticParams() {
  return (await listingIds()).map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/homes/[id]">): Promise<Metadata> {
  const l = await cachedListing((await params).id);
  if (!l) return { title: "Home not found | Gharaana" };
  const price = l.type === "rent" ? `${inr(l.price + l.maintenance)} a month` : inrShort(l.price);
  return {
    title: `${l.title} | ${price} | Gharaana`,
    description: `${l.description} Listed by its owner and approved by our team.`,
  };
}

export default function HomePage({ params }: PageProps<"/homes/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-[60vh] max-w-[1200px] animate-pulse rounded-xl bg-surface" />}>
      <Home params={params} />
    </Suspense>
  );
}

const FURNISHING = { full: "Fully furnished", semi: "Semi-furnished", none: "Unfurnished" };
const KIND = { apartment: "Flat", "independent-house": "Independent house", villa: "Villa" };
const TENANTS = { family: "Families", bachelors: "Bachelors", company: "Company lease" };
const floorLabel = (l: Listing) =>
  l.kind === "apartment" ? `${l.floor === 0 ? "Ground" : l.floor} of ${l.totalFloors}` : `${l.totalFloors} storeys`;

async function Home({ params }: Pick<PageProps<"/homes/[id]">, "params">) {
  const l = await cachedListing((await params).id);
  if (!l) notFound();
  const similar = await similarListings(l);
  const metro = nearestMetro(l.lat, l.lng);
  const near = nearbyPlaces(l.lat, l.lng);
  const rent = l.type === "rent";
  const monthly = l.price + l.maintenance;
  const first = l.owner.name.split(" ")[0];
  const video = l.videoUrl ? youtubeId(l.videoUrl) : null;

  const facts: [string, ReactNode][] = [
    ["Type", `${bhkLabel(l.bhk)} ${KIND[l.kind].toLowerCase()}`],
    ["Carpet area", sqft(l.carpetSqft)],
    ["Furnishing", FURNISHING[l.furnishing]],
    [l.kind === "apartment" ? "Floor" : "Building", floorLabel(l)],
    ["Facing", l.facing],
    ["Age", `${l.ageYears} ${l.ageYears === 1 ? "year" : "years"}`],
    ["Bathrooms", l.bathrooms],
    ["Balconies", l.balconies],
    ["Parking", { none: "None", bike: "Two-wheeler", car: "Car" }[l.parking]],
    ...(rent
      ? ([
          ["Available", l.availableInDays === 0 ? "Now" : `In ${l.availableInDays} days`],
          ["Owner prefers", l.tenants.length ? l.tenants.map((t) => TENANTS[t]).join(", ") : "Anyone"],
          ["Pets", l.pets ? "Allowed" : "Not allowed"],
          ["Food", l.nonVeg ? "No restrictions" : "Vegetarian only"],
        ] as [string, ReactNode][])
      : ([
          ...(l.saleCondition ? [["Condition", l.saleCondition === "new" ? "New from the builder" : "Resale"]] : []),
          ["Possession", l.availableInDays === 0 ? "Ready to move" : `In ${l.availableInDays} days`],
          ["Pets in society", l.pets ? "Allowed" : "Not allowed"],
        ] as [string, ReactNode][])),
  ];

  return (
    <main className="mx-auto max-w-[1200px] px-4 pt-4 pb-32 sm:px-6 lg:pb-20">
      <nav aria-label="Breadcrumb" className="mb-4 text-[14px] text-muted">
        <ol className="flex flex-wrap gap-x-2">
          <li>
            <Link href={`/search?type=${l.type}`} className="hover:text-ink hover:underline">
              Bengaluru
            </Link>
            <span aria-hidden="true"> ›</span>
          </li>
          <li>
            <Link href={`/search?type=${l.type}&q=${encodeURIComponent(l.locality)}`} className="hover:text-ink hover:underline">
              {l.locality}
            </Link>
            <span aria-hidden="true"> ›</span>
          </li>
          <li aria-current="page" className="text-ink">
            {bhkLabel(l.bhk)} {rent ? "for rent" : "for sale"}
          </li>
        </ol>
      </nav>

      <Gallery photos={l.photos} title={l.title} sample={l.sample} />

      <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <header>
            <h1 className="text-[1.75rem] leading-tight font-semibold text-balance sm:text-[2rem]">{l.title}</h1>
            <p className="mt-1 text-muted">
              {l.area}, {l.locality}, Bengaluru
            </p>
            {l.project && (
              <p className="mt-1 text-[15px]">
                Part of{" "}
                <Link href={`/projects/${l.project.id}`} className="font-medium text-indigo hover:underline">
                  {l.project.name}
                </Link>{" "}
                by {l.project.builder} <span className="text-muted tabular-nums">· RERA {l.project.rera}</span>
              </p>
            )}
            <ul className="mt-4 flex flex-wrap gap-2 text-[14px] font-medium">
              <li className="rounded-md bg-verified-wash px-2 py-1 text-verified">Owner verified</li>
              {l.visitVerifiedAt && <li className="rounded-md bg-verified-wash px-2 py-1 text-verified">Visited by our team</li>}
              <li className="rounded-md bg-verified-wash px-2 py-1 text-verified">Owner confirmed available {daysAgo(l.confirmedDaysAgo)}</li>
              <li className="rounded-md bg-surface px-2 py-1 text-muted">Listed {daysAgo(l.listedDaysAgo)}</li>
              {l.sample && <li className="rounded-md bg-surface px-2 py-1 text-muted">Sample listing for the demo</li>}
            </ul>
            {/* Phones: the aside is hidden, so chat and the two requests sit here; the number stays in the bottom bar. */}
            <div className="mt-5 grid grid-cols-2 gap-2 lg:hidden">
              <div className="col-span-2">
                <StartChat listingId={l.id} owner={l.owner.name} sample={l.sample} />
              </div>
              <RequestLead listingId={l.id} owner={l.owner.name} sample={l.sample} kind="visit" />
              <RequestLead listingId={l.id} owner={l.owner.name} sample={l.sample} kind="callback" />
            </div>
          </header>

          <section aria-labelledby="facts" className="mt-10">
            <h2 id="facts" className="sr-only">
              Key facts
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              {facts.map(([k, v]) => (
                <div key={k} className="border-t border-hairline py-3">
                  <dt className="text-[13px] text-muted">{k}</dt>
                  <dd className="mt-0.5 font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="cost" className="mt-12">
            <h2 id="cost" className="text-xl font-semibold">
              What you&rsquo;ll pay
            </h2>
            <p className="mt-1 text-muted">Everything, up front.</p>
            <table className="mt-4 w-full max-w-xl text-left tabular-nums">
              <tbody className="[&_td]:py-2.5 [&_td:last-child]:text-right [&_tr]:border-b [&_tr]:border-hairline">
                {rent ? (
                  <>
                    <tr>
                      <td>Rent</td>
                      <td>{inr(l.price)}</td>
                    </tr>
                    <tr>
                      <td>Society maintenance</td>
                      <td>{l.maintenance ? inr(l.maintenance) : "Included"}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td>Every month</td>
                      <td>{inr(monthly)}</td>
                    </tr>
                    <tr>
                      <td>
                        Security deposit
                        <span className="block text-[14px] text-muted">
                          {Math.round(l.deposit / l.price)} months&rsquo; rent, refundable when you move out
                        </span>
                      </td>
                      <td>{inr(l.deposit)}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td>To move in (deposit + first month)</td>
                      <td>{inr(l.deposit + monthly)}</td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr className="font-semibold">
                      <td>Price</td>
                      <td>{inr(l.price)}</td>
                    </tr>
                    <tr>
                      <td>Price per sq ft (carpet)</td>
                      <td>{inr(Math.round(l.price / l.carpetSqft))}</td>
                    </tr>
                    <tr>
                      <td>Society maintenance</td>
                      <td>{l.maintenance ? `${inr(l.maintenance)} /month` : "None"}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
            {!rent && <p className="mt-3 max-w-xl text-[14px] text-muted">Stamp duty and registration are paid to the state and aren&rsquo;t included here.</p>}
          </section>

          <section aria-labelledby="about" className="mt-12">
            <h2 id="about" className="text-xl font-semibold">
              About this home
            </h2>
            <p className="mt-3 max-w-[68ch]">{l.description}</p>
          </section>

          {video && (
            <section aria-labelledby="video" className="mt-12">
              <h2 id="video" className="text-xl font-semibold">
                Video tour
              </h2>
              <VideoTour id={video} title={l.title} />
            </section>
          )}

          <section aria-labelledby="amenities" className="mt-12">
            <h2 id="amenities" className="text-xl font-semibold">
              In the building
            </h2>
            <ul className="mt-4 grid max-w-xl gap-x-8 gap-y-2 sm:grid-cols-2">
              {l.amenities.map((a) => (
                <li key={a} className="flex items-center gap-2.5">
                  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-verified" aria-hidden="true">
                    <path d="m3 8.5 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {a}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="location" className="mt-12">
            <h2 id="location" className="text-xl font-semibold">
              Where it is
            </h2>
            <p className="mt-1 text-muted">
              {l.area}, {l.locality}.{" "}
              {metro.metres < 2500 ? `${distance(metro.metres)} to ${metro.name} metro station.` : "No metro station within 2.5 km."} The exact
              address is shared once you contact the owner.
            </p>
            <div className="mt-4">
              <LocationMap lat={l.lat} lng={l.lng} places={(["metro", "school", "hospital"] as const).flatMap((kind) => near[kind].map((p) => ({ ...p, kind })))} />
            </div>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              {(
                [
                  ["metro", "Metro stations", "bg-ink"],
                  ["school", "Schools", "bg-verified"],
                  ["hospital", "Hospitals", "bg-danger"],
                ] as const
              ).map(([kind, label, dot]) => (
                <div key={kind}>
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold">
                    <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                    {label}
                  </h3>
                  {near[kind].length ? (
                    <ul className="mt-2 grid gap-1.5 text-[15px]">
                      {near[kind].map((p) => (
                        <li key={p.name} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate">{p.name}</span>
                          <span className="shrink-0 text-muted tabular-nums">{distance(p.metres)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[15px] text-muted">None within {kind === "metro" ? "3" : "2"} km</p>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-4 text-[13px] text-muted">Distances are straight-line and approximate. Places from {PLACES_SOURCE}.</p>
          </section>        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-hairline p-6">
            <p className="tabular-nums">
              <span className="text-[1.75rem] leading-none font-semibold">{rent ? inr(monthly) : inrShort(l.price)}</span>
              {rent && <span className="text-muted"> /month</span>}
            </p>
            <p className="mt-1 text-[14px] text-muted tabular-nums">
              {rent ? `${inr(l.price)} rent + ${l.maintenance ? `${inr(l.maintenance)} maintenance` : "no maintenance"}` : `${sqft(l.carpetSqft)} carpet`}
              {rent && <span className="block">Deposit {inr(l.deposit)}</span>}
            </p>
            <div className="mt-5 grid gap-2">
              <ContactOwner listingId={l.id} owner={l.owner.name} sample={l.sample} />
              <StartChat listingId={l.id} owner={l.owner.name} sample={l.sample} />
              <div className="grid grid-cols-2 gap-2">
                <RequestLead listingId={l.id} owner={l.owner.name} sample={l.sample} kind="visit" />
                <RequestLead listingId={l.id} owner={l.owner.name} sample={l.sample} kind="callback" />
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3 border-t border-hairline pt-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo/10 font-semibold text-indigo">{first[0]}</span>
              <p className="text-[14px]">
                <span className="block font-medium">Listed by {l.owner.name}, the owner</span>
                <span className="text-muted">Ownership checked by our team</span>
              </p>
              <ShortlistButton id={l.id} title={l.title} onLight className="ml-auto bg-surface hover:bg-hairline" />
            </div>
            <p className="mt-4 text-[13px] text-muted">Your number stays private. Owners never see it unless you call them.</p>
            <Link href={`/help?topic=report&listing=${encodeURIComponent(l.id)}`} className="mt-2 inline-block text-[13px] text-muted underline hover:text-ink">
              Report this listing
            </Link>
          </div>
        </aside>
      </div>

      {similar.length > 0 && (
        <section aria-labelledby="similar" className="mt-16 border-t border-hairline pt-10">
          <h2 id="similar" className="text-xl font-semibold">
            Similar homes nearby
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((s) => (
              <ListingTile key={s.id} card={s} />
            ))}
          </div>
        </section>
      )}

      {/* Phones: price and the one action stay in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-hairline bg-canvas px-4 py-3 lg:hidden">
        <p className="min-w-0 flex-1 tabular-nums">
          <span className="block text-[1.125rem] leading-tight font-semibold whitespace-nowrap">
            {rent ? inr(monthly) : inrShort(l.price)}
            {rent && <span className="text-[14px] font-normal text-muted"> /month</span>}
          </span>
          {rent && <span className="block truncate text-[13px] text-muted">Deposit {inr(l.deposit)}</span>}
        </p>
        <div className="shrink-0">
          <ContactOwner listingId={l.id} owner={l.owner.name} sample={l.sample} label="Get owner's number" className="w-auto" />
        </div>
      </div>
    </main>
  );
}
