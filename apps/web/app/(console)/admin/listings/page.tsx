import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { inrShort } from "@/lib/format";
import { LISTING_STATUS, LISTING_STATUS_STYLE } from "@/lib/labels";
import { isListingFilter, LISTINGS_PAGE, listAllListings, listingStatusCounts, type ListingFilter } from "@/lib/listings-admin";
import { requireAdmin } from "@/lib/session";

// Neutral title: the static shell is served to everyone, and the page shouldn't advertise itself.
export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

export default function ListingsPage({ searchParams }: PageProps<"/admin/listings">) {
  return (
    <main className="pt-4 pb-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[22px] bg-surface" />}>
        <Listings searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const FILTERS: [ListingFilter, string][] = [["all", "Everything"], ...(Object.entries(LISTING_STATUS) as [ListingFilter, string][])];
const href = (q: string, status: ListingFilter, page = 1) => {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (status !== "all") p.set("status", status);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return `/admin/listings${s ? `?${s}` : ""}`;
};

async function Listings({ searchParams }: Pick<PageProps<"/admin/listings">, "searchParams">) {
  await requireAdmin("listings");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const status: ListingFilter = isListingFilter(sp.status) ? sp.status : "all";
  const page = Number(typeof sp.page === "string" ? sp.page : 1) || 1;
  const [list, counts] = await Promise.all([listAllListings({ q, status, page }), listingStatusCounts()]);
  const from = list.total === 0 ? 0 : (list.page - 1) * LISTINGS_PAGE + 1;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="text-[2rem] leading-[1.1] font-medium tracking-[-0.03em] md:text-[2.75rem]">Properties</h1>
          <p className="mt-1 text-muted">Every home on the site, in any state. Open one to fix its details, change its photos or take it down.</p>
        </div>
        <form role="search" action="/admin/listings" className="flex gap-2">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <label htmlFor="listing-q" className="sr-only">
            Search homes by title, owner name or phone number
          </label>
          <input
            id="listing-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Title, owner or phone"
            className="h-11 w-64 rounded-full bg-surface px-5 text-[15px] focus-visible:outline-2 focus-visible:outline-indigo"
          />
          <button className="h-11 cursor-pointer rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep">Search</button>
        </form>
      </div>

      <nav aria-label="Filter homes" className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map(([key, label]) => (
          <Link
            key={key}
            href={href(q, key)}
            aria-current={status === key ? "page" : undefined}
            className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[15px] font-medium ${status === key ? "bg-ink text-canvas" : "bg-surface text-muted hover:text-ink"}`}
          >
            {label}
            <span className="tabular-nums opacity-70">{counts[key]}</span>
          </Link>
        ))}
      </nav>

      <section className="mt-5 rounded-[22px] bg-surface p-2">
        {list.rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-muted">{q || status !== "all" ? "No homes match that." : "No homes yet."}</p>
        ) : (
          <table className="w-full text-left text-[15px]">
            <caption className="sr-only">Homes, newest first</caption>
            <thead>
              <tr className="text-[13px] text-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  Home
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                  Owner
                </th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                  Price
                </th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium lg:table-cell">
                  Photos
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((l) => (
                <tr key={l.id} className="hover:bg-canvas [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl">
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/listings/${l.id}`} className="block min-w-0 rounded-xl">
                      <span className="block truncate font-medium">{l.title}</span>
                      <span className="block truncate text-[14px] text-muted">
                        {l.locality}
                        {l.sample && " · sample"}
                        {l.visited && " · visited"}
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2.5 md:table-cell">
                    <Link href={`/admin/clients/${l.ownerId}`} className="block truncate hover:underline">
                      {l.ownerName || "No name"}
                    </Link>
                    <span className="block truncate text-[14px] text-muted tabular-nums">{l.ownerPhone ?? "no phone"}</span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{inrShort(l.price)}</td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums lg:table-cell">{l.photos}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap ${LISTING_STATUS_STYLE[l.status]}`}>{LISTING_STATUS[l.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {list.total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[14px] text-muted">
          <p className="tabular-nums">
            {from}–{Math.min(list.page * LISTINGS_PAGE, list.total)} of {list.total}
          </p>
          <div className="flex gap-2">
            {list.page > 1 && (
              <Link href={href(q, status, list.page - 1)} className="inline-flex h-10 items-center rounded-full border border-hairline px-5 font-semibold text-ink hover:border-muted">
                Previous
              </Link>
            )}
            {list.page < list.pages && (
              <Link href={href(q, status, list.page + 1)} className="inline-flex h-10 items-center rounded-full border border-hairline px-5 font-semibold text-ink hover:border-muted">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
