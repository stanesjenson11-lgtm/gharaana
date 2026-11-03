import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Prose } from "@/components/prose";
import { ListingTile } from "@/components/search/listing-tile";
import { distance, inr, inrShort } from "@/lib/format";
import { searchCards } from "@/lib/listings";
import { nearbyPlaces, PLACES_SOURCE } from "@/lib/nearby";
import { AREAS, areaBySlug, publishedPage } from "@/lib/pages";
import { parseSearch } from "@/lib/parse-search";
import { LOCALITIES } from "@/lib/places";
import { toQuery } from "@/lib/search";

export function generateStaticParams() {
  return AREAS.map(({ slug }) => ({ slug }));
}

// Live figures from the homes within about 3 km, plus the team's guide if one is published. Cached for an hour.
async function area(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("pages");
  const a = areaBySlug(slug);
  if (!a) return undefined;
  const [lat, lng] = LOCALITIES[a.name];
  const [cards, guide] = await Promise.all([searchCards(parseSearch({ q: a.name })), publishedPage("area", slug)]);
  const perSqft = cards.map((c) => c.price / c.carpetSqft).sort((x, y) => x - y);
  const prices = cards.map((c) => c.price);
  return {
    ...a,
    guide,
    count: cards.length,
    medianPerSqft: perSqft.length ? Math.round(perSqft[Math.floor(perSqft.length / 2)]) : null,
    range: prices.length ? [Math.min(...prices), Math.max(...prices)] : null,
    latest: cards.slice(0, 6),
    near: nearbyPlaces(lat, lng),
  };
}

export async function generateMetadata({ params }: PageProps<"/areas/[slug]">): Promise<Metadata> {
  const a = await area((await params).slug);
  if (!a) return { title: "Area not found | Gharaana" };
  return {
    title: `Homes for sale in ${a.name}, Bengaluru | Gharaana`,
    description: a.guide?.summary || `${a.count} homes for sale in ${a.name} from verified owners${a.medianPerSqft ? `, around ${inr(a.medianPerSqft)} per sq ft` : ""}.`,
  };
}

export default function AreaPage({ params }: PageProps<"/areas/[slug]">) {
  return (
    <main className="mx-auto max-w-[1200px] px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Area params={params} />
      </Suspense>
    </main>
  );
}

async function Area({ params }: Pick<PageProps<"/areas/[slug]">, "params">) {
  const a = await area((await params).slug);
  if (!a) notFound();
  const search = `/search?${toQuery({ q: a.name })}`;
  const facts = [
    [String(a.count), a.count === 1 ? "home for sale now" : "homes for sale now"],
    ...(a.medianPerSqft ? [[inr(a.medianPerSqft), "median price per sq ft (carpet)"]] : []),
    ...(a.range ? [[`${inrShort(a.range[0])} to ${inrShort(a.range[1])}`, "price range"]] : []),
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-[14px] text-muted">
        <Link href="/areas" className="hover:text-ink hover:underline">
          Areas
        </Link>
        <span aria-hidden="true"> › </span>
        <span className="text-ink">{a.name}</span>
      </nav>
      <h1 className="mt-3 text-[2rem] leading-tight font-semibold text-balance sm:text-[2.75rem]">{a.guide?.title ?? `Living in ${a.name}`}</h1>
      {a.guide?.summary && <p className="mt-3 max-w-[60ch] text-lg text-muted">{a.guide.summary}</p>}

      <dl className="mt-8 grid gap-6 border-y border-hairline py-6 sm:grid-cols-3">
        {facts.map(([value, label]) => (
          <div key={label}>
            <dt className="text-[14px] text-muted">{label}</dt>
            <dd className="mt-1 text-[1.75rem] leading-none font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[13px] text-muted">From homes listed on Gharaana within about 3 km, updated hourly.</p>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {a.guide ? <Prose body={a.guide.body} /> : <p className="max-w-[60ch] text-muted">Our guide to {a.name} is being written. Meanwhile, here are the homes for sale and what&rsquo;s nearby.</p>}
        </div>
        <aside aria-labelledby="nearby" className="lg:border-l lg:border-hairline lg:pl-8">
          <h2 id="nearby" className="text-lg font-semibold">
            Close to the centre of {a.name}
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
                {a.near[kind].length ? (
                  a.near[kind].map((p) => (
                    <li key={p.name} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="shrink-0 text-muted tabular-nums">{distance(p.metres)}</span>
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

      {a.latest.length > 0 && (
        <section aria-labelledby="homes" className="mt-14 border-t border-hairline pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="homes" className="text-xl font-semibold">
              Homes for sale in {a.name}
            </h2>
            <Link href={search} className="font-semibold text-indigo hover:underline">
              See all {a.count} on the map
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {a.latest.map((c) => (
              <ListingTile key={c.id} card={c} />
            ))}
          </div>
        </section>
      )}

      <nav aria-label="Other areas" className="mt-14 border-t border-hairline pt-6">
        <h2 className="text-[15px] font-semibold">Other areas</h2>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
          {AREAS.filter((o) => o.slug !== a.slug).map((o) => (
            <li key={o.slug}>
              <Link href={`/areas/${o.slug}`} className="text-indigo hover:underline">
                {o.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
