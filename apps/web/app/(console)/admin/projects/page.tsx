import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LOCALITIES } from "@/lib/places";
import { projectFor, projectSummaries, unitIds } from "@/lib/projects";
import { requireAdmin } from "@/lib/session";
import { ProjectForm } from "./form";

export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

export default function ProjectsAdminPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Projects />
      </Suspense>
    </main>
  );
}

async function Projects() {
  await requireAdmin("projects");
  const summaries = await projectSummaries(false);
  const full = await Promise.all(summaries.map(async (s) => ({ s, p: (await projectFor(s.id, false))!, units: await unitIds(s.id) })));
  const localities = Object.keys(LOCALITIES);

  return (
    <>
      <h1 className="text-[2rem] leading-tight font-semibold">Builder projects</h1>
      <p className="mt-1 max-w-[68ch] text-muted">
        A project page groups a builder&rsquo;s units. Import the units as sale listings first (owner: the builder&rsquo;s phone), approve them, then paste their links here.
        Every project shows its RERA number.
      </p>

      <ul className="mt-8">
        {full.map(({ s, p, units }) => (
          <li key={s.id} className="border-t border-hairline">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 py-4">
                <span className="font-medium">{s.name}</span>
                <span className="text-[13px] text-muted">
                  {s.builder}, {s.locality} · {s.units} live {s.units === 1 ? "unit" : "units"}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ${s.published ? "bg-verified-wash text-verified" : "bg-surface text-muted"}`}>
                  {s.published ? "Live" : "Draft"}
                </span>
                {s.published && (
                  <Link href={`/projects/${s.id}`} className="text-[14px] text-indigo hover:underline">
                    View
                  </Link>
                )}
              </summary>
              <ProjectForm project={p} units={units} localities={localities} />
            </details>
          </li>
        ))}
      </ul>

      <section aria-labelledby="new-project" className="mt-8 border-t border-hairline pt-6">
        <h2 id="new-project" className="text-xl font-semibold">
          New project
        </h2>
        <ProjectForm localities={localities} />
      </section>
    </>
  );
}
