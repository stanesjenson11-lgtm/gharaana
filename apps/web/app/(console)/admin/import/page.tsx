import type { Metadata } from "next";
import { Suspense } from "react";
import { COLUMNS, TEMPLATE_CSV } from "@/lib/import";
import { requireAdmin } from "@/lib/session";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

export default function ImportPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Import />
      </Suspense>
    </main>
  );
}

async function Import() {
  await requireAdmin("import");
  return (
    <>
      <h1 className="text-[2rem] leading-tight font-semibold">Import homes from a spreadsheet</h1>
      <p className="mt-2 max-w-[68ch] text-muted">
        Save the sheet as CSV (in Excel: File, Save As, CSV UTF-8; in Google Sheets: File, Download, CSV) with one home per row. Every imported home goes to the
        review queue first. Owners are matched by phone number, so they can sign in later with that number and see their homes.
      </p>
      <a
        href={`data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + TEMPLATE_CSV)}`}
        download="directnest-import-template.csv"
        className="mt-5 inline-flex h-11 items-center rounded-full border border-hairline px-5 font-semibold hover:border-muted"
      >
        Download the template
      </a>

      <ImportForm />

      <details className="mt-12 border-t border-hairline pt-6">
        <summary className="cursor-pointer text-lg font-semibold">What goes in each column</summary>
        <dl className="mt-4 grid gap-x-8 gap-y-3 text-[15px] sm:grid-cols-[max-content_1fr]">
          {COLUMNS.map(([name, what]) => (
            <div key={name} className="contents">
              <dt className="font-mono text-[14px]">{name}</dt>
              <dd className="text-muted">{what}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}
