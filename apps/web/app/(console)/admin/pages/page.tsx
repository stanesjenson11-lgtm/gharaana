import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { allPages, AREAS } from "@/lib/pages";
import { requireAdmin } from "@/lib/session";
import { PageForm } from "./form";

export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

export default function PagesAdminPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Pages />
      </Suspense>
    </main>
  );
}

async function Pages() {
  await requireAdmin("pages");
  const pages = await allPages();
  return (
    <>
      <h1 className="text-[2rem] leading-tight font-semibold">Blog and area guides</h1>
      <p className="mt-1 max-w-[68ch] text-muted">
        Every area already has a page with live prices and homes; a guide adds your words on top. Drafts stay hidden until you tick Published.
      </p>

      <ul className="mt-8">
        {pages.map((p) => (
          <li key={p.id} className="border-t border-hairline">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 py-4">
                <span className="font-medium">{p.title}</span>
                <span className="text-[13px] text-muted">{p.kind === "area" ? "Area guide" : "Blog post"}</span>
                <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ${p.published ? "bg-verified-wash text-verified" : "bg-surface text-muted"}`}>
                  {p.published ? "Live" : "Draft"}
                </span>
                {p.published && (
                  <Link href={p.kind === "area" ? `/areas/${p.slug}` : `/blog/${p.slug}`} className="text-[14px] text-indigo hover:underline">
                    View
                  </Link>
                )}
              </summary>
              <PageForm page={p} areas={AREAS} />
            </details>
          </li>
        ))}
      </ul>

      <section aria-labelledby="new-page" className="mt-8 border-t border-hairline pt-6">
        <h2 id="new-page" className="text-xl font-semibold">
          New post or guide
        </h2>
        <PageForm areas={AREAS} />
      </section>
    </>
  );
}
