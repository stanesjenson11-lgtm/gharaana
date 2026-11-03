"use client";

import Link from "next/link";
import { useState } from "react";
import { importBatch, previewImport } from "../actions";
import { parseCsv, toCsv } from "@/lib/csv";
import { inrShort } from "@/lib/format";
import type { ImportResult } from "@/lib/import";

type Preview = Awaited<ReturnType<typeof previewImport>>;
const BATCH = 10; // rows per request: each row may download several photos

export function ImportForm() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const valid = preview?.rows.filter((r) => !r.errors.length) ?? [];

  const choose = async (file: File | undefined) => {
    setPreview(null);
    setResults(null);
    setProblem(null);
    if (!file) return;
    if (file.size > 900_000) return setProblem("That file is over 900 KB. Split it into smaller sheets and import them one by one.");
    const t = await file.text();
    setText(t);
    setBusy("Checking the sheet…");
    setPreview(await previewImport(t).catch(() => ({ errors: ["Couldn't check the file. Try again."], rows: [] })));
    setBusy(null);
  };

  const run = async () => {
    const [header, ...rows] = parseCsv(text);
    const done: ImportResult[] = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      setBusy(`Importing rows ${i + 1} to ${Math.min(i + BATCH, rows.length)} of ${rows.length}…`);
      const batch = await importBatch(toCsv([header, ...rows.slice(i, i + BATCH)])).catch(() => null);
      if (!batch) {
        setProblem(`Stopped at row ${i + 2}: the server didn't answer. Import the same file again; homes already imported are skipped.`);
        break;
      }
      done.push(...batch.map((r) => ({ ...r, line: r.line + i }))); // lines are per batch; make them match the sheet
      setResults([...done]);
    }
    setBusy(null);
  };

  return (
    <section aria-labelledby="upload" className="mt-10 border-t border-hairline pt-8">
      <h2 id="upload" className="text-xl font-semibold">
        Upload the sheet
      </h2>
      <label className="mt-4 flex max-w-xl cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-hairline px-6 py-8 text-center hover:border-indigo has-focus-visible:border-indigo">
        <span className="font-semibold text-indigo">Choose a CSV file</span>
        <span className="text-[14px] text-muted">Nothing is imported until you confirm</span>
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
      </label>

      <div aria-live="polite" className="mt-4">
        {busy && <p className="text-muted">{busy}</p>}
        {problem && <p className="font-medium text-danger">{problem}</p>}
        {preview?.errors.map((e) => (
          <p key={e} className="font-medium text-danger">
            {e}
          </p>
        ))}
      </div>

      {preview && !preview.errors.length && !results && (
        <>
          <p className="mt-4">
            <strong>{valid.length}</strong> of {preview.rows.length} rows are ready.
            {valid.length < preview.rows.length && " Rows with problems are skipped; fix them and import the file again later."}
          </p>
          <ul className="mt-4 max-h-[28rem] overflow-y-auto rounded-xl border border-hairline">
            {preview.rows.map((r) => (
              <li key={r.line} className="border-b border-hairline px-4 py-3 text-[15px] last:border-0">
                <span className="text-muted tabular-nums">Row {r.line}: </span>
                {r.errors.length ? (
                  <span className="text-danger">{r.errors.join("; ")}</span>
                ) : (
                  <span>
                    {r.title}, {inrShort(r.price!)}, {r.owner}, {r.photos} {r.photos === 1 ? "photo" : "photos"}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {valid.length > 0 && (
            <button type="button" disabled={!!busy} onClick={run} className="mt-5 h-11 cursor-pointer rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep disabled:opacity-60">
              Import {valid.length} {valid.length === 1 ? "home" : "homes"} to the review queue
            </button>
          )}
        </>
      )}

      {results && (
        <>
          <p className="mt-4">
            Imported <strong>{results.filter((r) => r.status === "imported").length}</strong>, skipped {results.filter((r) => r.status === "skipped").length}, failed{" "}
            {results.filter((r) => r.status === "failed").length}.{" "}
            <Link href="/admin/queue" className="font-semibold text-indigo hover:underline">
              Open the review queue
            </Link>
          </p>
          <ul className="mt-4 max-h-[28rem] overflow-y-auto rounded-xl border border-hairline">
            {results.map((r) => (
              <li key={r.line} className="border-b border-hairline px-4 py-3 text-[15px] last:border-0">
                <span className="text-muted tabular-nums">Row {r.line}: </span>
                <span className={r.status === "failed" ? "text-danger" : r.status === "imported" ? "text-verified" : "text-muted"}>
                  {r.status}, {r.message}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
