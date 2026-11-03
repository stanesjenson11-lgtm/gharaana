import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { crmLeads, isStage, STAGES, stageCounts } from "@/lib/crm";
import { daysAgo, inrShort, phone } from "@/lib/format";
import { visitTime } from "@/lib/search";
import { requireAdmin } from "@/lib/session";
import { saveCrm } from "../actions";

export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

const OWNER_ANSWER = { new: "Owner hasn't answered", confirmed: "Owner confirmed", declined: "Owner declined", done: "Owner marked done" } as const;
const ago = (d: Date) => daysAgo(Math.floor((Date.now() - d.getTime()) / 86_400_000));

export default function LeadsPage({ searchParams }: PageProps<"/admin/leads">) {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Leads searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Leads({ searchParams }: Pick<PageProps<"/admin/leads">, "searchParams">) {
  await requireAdmin("leads");
  const raw = (await searchParams).stage;
  const stage = isStage(raw) ? raw : undefined;
  const [rows, counts] = await Promise.all([crmLeads(stage), stageCounts()]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <h1 className="text-[2rem] leading-tight font-semibold">Sales leads</h1>
      <p className="mt-1 text-muted">Every callback and visit request, newest first. Stages and notes are for the team only; buyers and owners never see them.</p>

      <nav aria-label="Stages" className="mt-6 flex flex-wrap gap-2 text-[14px] font-medium">
        {[[undefined, "All", total] as const, ...STAGES.map(([v, l]) => [v, l, counts[v]] as const)].map(([v, l, n]) => (
          <Link
            key={l}
            href={v ? `/admin/leads?stage=${v}` : "/admin/leads"}
            aria-current={v === stage ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 ${v === stage ? "border-ink bg-surface" : "border-hairline text-muted hover:text-ink"}`}
          >
            {l} <span className="tabular-nums">{n}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-8 border-t border-hairline pt-6 text-muted">No requests here yet.</p>
      ) : (
        <ul className="mt-6">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-4 border-t border-hairline py-5 md:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 text-[15px]">
                <p className="font-medium">
                  {r.kind === "visit" ? `Visit: ${visitTime(r.preferredDate, r.preferredSlot)}` : "Callback"}
                  <span className="font-normal text-muted"> · asked {ago(r.createdAt)} · {OWNER_ANSWER[r.ownerAnswer]}</span>
                </p>
                <p className="mt-1 truncate">
                  <Link href={`/homes/${r.listingId}`} className="text-indigo hover:underline">
                    {r.title}
                  </Link>
                  <span className="text-muted tabular-nums"> · {inrShort(r.price)}</span>
                </p>
                <p className="mt-1 text-muted tabular-nums">
                  Buyer: {r.buyerName || "No name"}, {r.buyerPhone ? phone(r.buyerPhone) : "no phone"}
                  <br />
                  Owner: {r.ownerName || "No name"}, {r.ownerPhone ? phone(r.ownerPhone) : "no phone"}
                </p>
                {r.buyerNote && <p className="mt-2 max-w-prose whitespace-pre-line">&ldquo;{r.buyerNote}&rdquo;</p>}
                <p className="mt-2">
                  <Link href={`/admin/docket?subject=lead:${r.id}`} className="text-[14px] font-semibold text-indigo hover:underline">
                    Add to docket
                  </Link>
                </p>
              </div>
              <form action={saveCrm.bind(null, r.id)} className="grid content-start gap-2">
                <label className="grid gap-1 text-[13px] text-muted">
                  Stage
                  <select name="stage" defaultValue={r.stage} className="h-10 rounded-lg border border-hairline bg-canvas px-2 text-[15px] text-ink">
                    {STAGES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-[13px] text-muted">
                  Team note
                  <textarea name="note" rows={2} maxLength={2000} defaultValue={r.note ?? ""} className="rounded-lg border border-hairline bg-canvas px-3 py-2 text-[15px] text-ink" />
                </label>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-muted">{r.updatedAt ? `Updated ${ago(r.updatedAt)}` : ""}</span>
                  <button className="h-9 cursor-pointer rounded-full bg-indigo px-4 text-[14px] font-semibold text-canvas hover:bg-indigo-deep">Save</button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
