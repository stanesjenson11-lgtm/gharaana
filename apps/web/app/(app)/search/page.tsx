import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchView } from "@/components/search/search-view";
import { searchCards } from "@/lib/listings";
import { LOCALITIES } from "@/lib/places";
import { parseSearch } from "@/lib/parse-search";
import { RENTALS } from "@/lib/search";

export const metadata: Metadata = {
  title: `Homes for ${RENTALS ? "rent and sale" : "sale"} in Bengaluru, straight from owners | Gharaana`,
  description: "Search flats and houses in Bengaluru on a map. Every listing is approved by a person and comes straight from its owner.",
};

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <Results searchParams={searchParams} />
    </Suspense>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const params = parseSearch(await searchParams);
  const cards = await searchCards(params);
  const centre = params.q ? Object.entries(LOCALITIES).find(([n]) => n.toLowerCase() === params.q!.toLowerCase())?.[1] : undefined;
  return <SearchView params={params} cards={cards} centre={centre} sample={cards.some((c) => c.sample)} />;
}

function SearchSkeleton() {
  return (
    <div className="flex h-[calc(100svh-4rem)] flex-col" aria-busy="true" aria-label="Loading homes">
      <div className="h-[65px] border-b border-hairline" />
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="grid content-start gap-4 p-5 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[4/3] rounded-lg bg-surface" />
              <div className="mt-3 h-5 w-1/2 rounded bg-surface" />
              <div className="mt-2 h-4 w-3/4 rounded bg-surface" />
            </div>
          ))}
        </div>
        <div className="hidden bg-surface lg:block" />
      </div>
    </div>
  );
}
