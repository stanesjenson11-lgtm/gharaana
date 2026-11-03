import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { publishedPosts } from "@/lib/pages";

export const metadata: Metadata = {
  title: "Blog | Gharaana",
  description: "Guides to buying a home in Bengaluru: paperwork, prices, localities and what to check before you pay.",
};

// Saving a page in the admin calls updateTag("pages").
async function posts() {
  "use cache";
  cacheLife("hours");
  cacheTag("pages");
  return publishedPosts();
}

export default async function BlogPage() {
  const list = await posts();
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6">
      <h1 className="text-[2rem] leading-tight font-semibold sm:text-[2.5rem]">Blog</h1>
      <p className="mt-2 text-lg text-muted">What to know before you buy a home in Bengaluru.</p>
      {list.length === 0 ? (
        <p className="mt-10 border-t border-hairline pt-6 text-muted">The first posts are on their way.</p>
      ) : (
        <ul className="mt-8">
          {list.map((p) => (
            <li key={p.slug} className="border-t border-hairline">
              <Link href={`/blog/${p.slug}`} className="-mx-3 block rounded-lg px-3 py-5 hover:bg-surface">
                <span className="block text-[13px] text-muted">
                  {p.publishedAt?.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}
                </span>
                <span className="mt-1 block text-xl font-semibold">{p.title}</span>
                {p.summary && <span className="mt-1 block text-muted">{p.summary}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
