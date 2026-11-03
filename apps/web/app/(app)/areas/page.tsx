import type { Metadata } from "next";
import Link from "next/link";
import { AREAS } from "@/lib/pages";

export const metadata: Metadata = {
  title: "Area guides for Bengaluru | Gharaana",
  description: "Prices, homes for sale, metro stations, schools and hospitals in Bengaluru's localities.",
};

export default function AreasPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6">
      <h1 className="text-[2rem] leading-tight font-semibold sm:text-[2.5rem]">Area guides</h1>
      <p className="mt-2 text-lg text-muted">Prices, homes for sale and what&rsquo;s nearby, for each part of Bengaluru we cover.</p>
      <ul className="mt-8 grid gap-x-8 sm:grid-cols-2">
        {AREAS.map((a) => (
          <li key={a.slug} className="border-t border-hairline">
            <Link href={`/areas/${a.slug}`} className="-mx-3 flex items-center justify-between rounded-lg px-3 py-4 text-lg font-medium hover:bg-surface">
              {a.name}
              <span aria-hidden="true" className="text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
