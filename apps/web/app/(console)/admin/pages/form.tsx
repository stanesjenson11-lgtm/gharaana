"use client";

import { useActionState, useState } from "react";
import { savePageAction, type AdminFormState } from "../actions";

type Page = { id: number; kind: "post" | "area"; slug: string; title: string; summary: string; body: string; published: boolean };
const field = "rounded-lg border border-hairline bg-canvas px-3 text-[15px] text-ink";
const label = "grid gap-1 text-[13px] text-muted";

export function PageForm({ page, areas }: { page?: Page; areas: { name: string; slug: string }[] }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(savePageAction.bind(null, page?.id ?? null), {});
  const [kind, setKind] = useState(page?.kind ?? "post");
  return (
    <form action={action} className="grid gap-3 py-4">
      <div className="flex flex-wrap gap-3">
        <label className={label}>
          Type
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as Page["kind"])} disabled={!!page} className={`${field} h-10`}>
            <option value="post">Blog post</option>
            <option value="area">Area guide</option>
          </select>
        </label>
        {page && <input type="hidden" name="kind" value={page.kind} />}
        {kind === "area" ? (
          <label className={label}>
            Area
            <select name="area" required defaultValue={page?.slug ?? ""} className={`${field} h-10`}>
              <option value="" disabled>
                Choose
              </option>
              {areas.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className={`${label} min-w-56 flex-1`}>
            Web address (leave empty to use the title)
            <input name="slug" defaultValue={page?.slug} placeholder="stamp-duty-in-karnataka" className={`${field} h-10`} />
          </label>
        )}
      </div>
      <label className={label}>
        Title
        <input name="title" required maxLength={120} defaultValue={page?.title} className={`${field} h-10`} />
      </label>
      <label className={label}>
        Summary for search results and lists (optional)
        <input name="summary" maxLength={300} defaultValue={page?.summary} className={`${field} h-10`} />
      </label>
      <label className={label}>
        Text. Leave a blank line between paragraphs; start a line with &ldquo;## &rdquo; for a heading or &ldquo;- &rdquo; for a list item.
        <textarea name="body" required rows={12} defaultValue={page?.body} className={`${field} py-2 leading-relaxed`} />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="published" defaultChecked={page?.published} className="h-4 w-4 accent-indigo" />
          Published
        </label>
        <button disabled={pending} className="h-10 cursor-pointer rounded-full bg-indigo px-5 font-semibold text-canvas hover:bg-indigo-deep disabled:opacity-60">
          {page ? "Save" : "Create"}
        </button>
        <p aria-live="polite" className={`text-[14px] font-medium ${state.error ? "text-danger" : "text-verified"}`}>
          {state.error ?? state.ok}
        </p>
      </div>
    </form>
  );
}
