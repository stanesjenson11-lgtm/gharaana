import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { allPlans, featuredListings } from "@/lib/plans";
import { requireAdmin } from "@/lib/session";
import { FeatureForm, PlanForm } from "./forms";

export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

export default function PlansAdminPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Plans />
      </Suspense>
    </main>
  );
}

async function Plans() {
  await requireAdmin("plans");
  const [plans, featured] = await Promise.all([allPlans(), featuredListings()]);
  return (
    <>
      <h1 className="text-[2rem] leading-tight font-semibold">Plans and featured homes</h1>
      <p className="mt-1 max-w-[68ch] text-muted">
        Owners see active plans on the{" "}
        <Link href="/plans" className="text-indigo hover:underline">
          plans page
        </Link>
        . Until online payment is set up, sell a plan by phone, then feature the owner&rsquo;s home below for the plan&rsquo;s days.
      </p>

      <section aria-labelledby="plans" className="mt-10">
        <h2 id="plans" className="text-xl font-semibold">
          Plans
        </h2>
        {plans.map((p) => (
          <PlanForm key={p.id} plan={p} />
        ))}
        <h3 className="mt-6 text-[15px] font-semibold">New plan</h3>
        <PlanForm />
      </section>

      <section aria-labelledby="featured" className="mt-12 border-t border-hairline pt-8">
        <h2 id="featured" className="text-xl font-semibold">
          Feature a home
        </h2>
        <p className="mt-1 text-muted">Featured homes come first in search, always with a &ldquo;Featured&rdquo; badge.</p>
        <FeatureForm />
        {featured.length > 0 && (
          <ul className="mt-6">
            {featured.map((f) => (
              <li key={f.id} className="flex flex-wrap justify-between gap-2 border-t border-hairline py-3 text-[15px]">
                <Link href={`/homes/${f.id}`} className="font-medium hover:underline">
                  {f.title}
                </Link>
                <span className="text-muted">until {f.until!.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
