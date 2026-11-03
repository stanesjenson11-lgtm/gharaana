import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { inrShort } from "@/lib/format";
import { possessionLabel, projectSummaries } from "@/lib/projects";

export const metadata: Metadata = {
  title: "New projects in Bengaluru | Gharaana",
  description: "New flats and villas from builders in Bengaluru, each with its RERA registration number.",
};

// Saving a project in the admin calls updateTag("projects").
async function list() {
  "use cache";
  cacheLife("hours");
  cacheTag("projects");
  return (await projectSummaries()).map((p) => ({ ...p, when: possessionLabel(p.possession) }));
}

export default async function ProjectsPage() {
  const projects = await list();
  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
      <h1 className="text-[2rem] leading-tight font-semibold sm:text-[2.5rem]">New projects</h1>
      <p className="mt-2 max-w-[60ch] text-lg text-muted">Flats and villas straight from the builder. Every project shows its RERA registration, so you can check it yourself.</p>
      {projects.length === 0 ? (
        <p className="mt-10 border-t border-hairline pt-6 text-muted">The first projects are on their way.</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="block h-full rounded-2xl border border-hairline p-6 transition-colors hover:border-muted">
                <span className="block text-xl font-semibold">{p.name}</span>
                <span className="mt-1 block text-muted">
                  by {p.builder}, {p.locality}
                </span>
                <span className="mt-4 block text-[1.375rem] font-semibold tabular-nums">
                  {p.from ? (p.from === p.to ? inrShort(p.from) : `${inrShort(p.from)} to ${inrShort(p.to!)}`) : "Prices on request"}
                </span>
                <span className="mt-1 block text-[14px] text-muted">
                  {p.units} {p.units === 1 ? "home" : "homes"} available · {p.when}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
