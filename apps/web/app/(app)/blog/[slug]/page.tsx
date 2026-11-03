import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Prose } from "@/components/prose";
import { publishedPage } from "@/lib/pages";

async function post(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("pages");
  return publishedPage("post", slug);
}

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const p = await post((await params).slug);
  return p ? { title: `${p.title} | Gharaana`, description: p.summary || undefined } : { title: "Post not found | Gharaana" };
}

export default function PostPage({ params }: PageProps<"/blog/[slug]">) {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Post params={params} />
      </Suspense>
    </main>
  );
}

async function Post({ params }: Pick<PageProps<"/blog/[slug]">, "params">) {
  const p = await post((await params).slug);
  if (!p) notFound();
  return (
    <article>
      <Link href="/blog" className="text-[15px] text-indigo hover:underline">
        Blog
      </Link>
      <h1 className="mt-3 text-[2rem] leading-tight font-semibold text-balance sm:text-[2.5rem]">{p.title}</h1>
      <p className="mt-2 text-[14px] text-muted">
        {p.publishedAt?.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}
      </p>
      {p.summary && <p className="mt-4 max-w-[68ch] text-lg text-muted">{p.summary}</p>}
      <div className="mt-6">
        <Prose body={p.body} />
      </div>
    </article>
  );
}
