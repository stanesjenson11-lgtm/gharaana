import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Prose } from "@/components/prose";
import { ListingTile } from "@/components/search/listing-tile";
import { distance, inrShort } from "@/lib/format";
import { projectCards } from "@/lib/listings";
import { nearbyPlaces, PLACES_SOURCE } from "@/lib/nearby";
import { LOCALITIES } from "@/lib/places";
import { possessionLabel, projectFor } from "@/lib/projects";
import { slugify } from "@/lib/prose";

// The project, its live units and what's nearby. Cached for an hour; saving the project in the admin refreshes it.
async function project(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("projects");
  const p = await projectFor(id);
  if (!p) return undefined;
  const units = await projectCards(id);
  // Centre on the units when there are some, else the locality.
  const [lat, lng] = units.length ? [units.reduce((a, u) => a + u.lat, 0) / units.length, units.reduce((a, u) => a + u.lng, 0) / units.length] : LOCALITIES[p.locality];
  return { ...p, units, when: possessionLabel(p.possession), near: nearbyPlaces(lat, lng) };
}

export async function generateMetadata({ params }: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const p = await project((await params).slug);
  return p
    ? { title: `${p.name} by ${p.builder}, ${p.locality} | Gharaana`, description: `New homes in ${p.locality} by ${p.builder}. RERA ${p.rera}.` }
    : { title: "Project not found | Gharaana" };
}

export default function ProjectPage({ params }: PageProps<"/projects/[slug]">) {
  return (
    <main className="mx-auto max-w-[1200px] px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Project params={params} />
      </Suspense>
    </main>
  );
}

async function Project({ params }: Pick<PageProps<"/projects/[slug]">, "params">) {
  const p = await project((await params).slug);
  if (!p) notFound();
  const prices = p.units.map((u) => u.price);
  const facts = [
    [prices.length ? (Math.min(...prices) === Math.max(...prices) ? inrShort(prices[0]) : `${inrShort(Math.min(...prices))} to ${inrShort(Math.max(...prices))}`) : "On request", "price"],
    [String(p.units.length), p.units.length === 1 ? "home available" : "homes available"],
    [p.when, "handover"],
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-[14px] text-muted">
        <Link href="/projects" className="hover:text-ink hover:underline">
          New projects
        </Link>
        <span aria-hidden="true"> › </span>
        <span className="text-ink">{p.name}</span>
      </nav>
      <h1 className="mt-3 text-[2rem] leading-tight font-semibold text-balance sm:text-[2.75rem]">{p.name}</h1>
      <p className="mt-2 text-lg text-muted">
        by {p.builder} in{" "}
        <Link href={`/areas/${slugify(p.locality)}`} className="text-indigo hover:underline">
          {p.locality}
        </Link>
      </p>
      <p className="mt-3 inline-block rounded-md bg-surface px-2 py-1 text-[14px] tabular-nums">RERA registration: {p.rera}</p>

      <dl className="mt-8 grid gap-6 border-y border-hairline py-6 sm:grid-cols-3">
        {facts.map(([value, label]) => (
          <div key={label}>
            <dt className="text-[14px] text-muted">{label}</dt>
            <dd className="mt-1 text-[1.75rem] leading-none font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Prose body={p.description} />
        <aside aria-labelledby="nearby" className="lg:border-l lg:border-hairline lg:pl-8">
          <h2 id="nearby" className="text-lg font-semibold">
            Nearby
          </h2>
          {(
            [
              ["metro", "Metro"],
              ["school", "Schools"],
              ["hospital", "Hospitals"],
            ] as const
          ).map(([kind, label]) => (
            <div key={kind} className="mt-4">
              <h3 className="text-[14px] font-semibold text-muted">{label}</h3>
              <ul className="mt-1 grid gap-1 text-[15px]">
                {p.near[kind].length ? (
                  p.near[kind].map((n) => (
                    <li key={n.name} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{n.name}</span>
                      <span className="shrink-0 text-muted tabular-nums">{distance(n.metres)}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-muted">None close by</li>
                )}
              </ul>
            </div>
          ))}
          <p className="mt-4 text-[12px] text-muted">Places from {PLACES_SOURCE}.</p>
        </aside>
      </div>

      <section aria-labelledby="units" className="mt-14 border-t border-hairline pt-8">
        <h2 id="units" className="text-xl font-semibold">
          Homes available
        </h2>
        {p.units.length ? (
          <>
            <p className="mt-1 text-muted">Open a home to chat with the builder, ask for a call back or book a site visit.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {p.units.map((c) => (
                <ListingTile key={c.id} card={c} />
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2 text-muted">
            No homes are listed right now.{" "}
            <Link href="/help?topic=other" className="text-indigo hover:underline">
              Ask our team
            </Link>{" "}
            about this project.
          </p>
        )}
      </section>
    </>
  );
}
