import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { inr } from "@/lib/format";
import { activePlans } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Plans for owners | Gharaana",
  description: "Listing your home is free. A plan puts it first in search with a Featured badge, for as many days as you choose.",
};

// Cached; saving a plan in the admin calls updateTag("plans").
async function cachedPlans() {
  "use cache";
  cacheLife("hours");
  cacheTag("plans");
  return activePlans();
}

export default async function PlansPage() {
  const plans = await cachedPlans();
  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
      <h1 className="text-[2rem] leading-tight font-semibold sm:text-[2.5rem]">Plans for owners</h1>
      <p className="mt-2 max-w-[60ch] text-lg text-muted">
        Listing your home is free, and every listing is checked by our team. A plan puts yours first in search, marked
        &ldquo;Featured&rdquo;, for the days you choose.
      </p>

      {plans.length === 0 ? (
        <p className="mt-10 border-t border-hairline pt-6 text-muted">
          Plans are on their way.{" "}
          <Link href="/help?topic=listing" className="font-semibold text-indigo hover:underline">
            Ask our team
          </Link>{" "}
          about featuring your home.
        </p>
      ) : (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <li key={p.id} className="flex flex-col rounded-2xl border border-hairline p-6">
              <h2 className="text-xl font-semibold">{p.name}</h2>
              <p className="mt-3 tabular-nums">
                <span className="text-[2rem] leading-none font-semibold">{inr(p.price)}</span>
                <span className="text-muted"> for {p.days} days</span>
              </p>
              <ul className="mt-5 grid flex-1 content-start gap-2">
                {p.perks.map((perk) => (
                  <li key={perk} className="flex gap-2.5">
                    <svg viewBox="0 0 16 16" className="mt-1 h-4 w-4 shrink-0 text-verified" aria-hidden="true">
                      <path d="m3 8.5 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {perk}
                  </li>
                ))}
              </ul>
              <Link href="/help?topic=listing" className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-indigo px-5 font-semibold text-canvas hover:bg-indigo-deep">
                Talk to us about {p.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-[14px] text-muted">Prices include GST. Online payment is coming; for now our team will call you to set it up.</p>
    </main>
  );
}
