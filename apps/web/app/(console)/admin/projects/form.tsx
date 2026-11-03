"use client";

import { useActionState } from "react";
import { saveProjectAction, type AdminFormState } from "../actions";

type Project = { id: string; name: string; builder: string; rera: string; possession: string | null; locality: string; description: string; published: boolean };
const field = "h-10 rounded-lg border border-hairline bg-canvas px-3 text-[15px] text-ink";
const label = "grid gap-1 text-[13px] text-muted";

export function ProjectForm({ project, units, localities }: { project?: Project; units?: string[]; localities: string[] }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveProjectAction.bind(null, project?.id ?? null), {});
  return (
    <form action={action} className="grid gap-3 py-4 sm:grid-cols-2">
      <label className={label}>
        Project name
        <input name="name" required maxLength={80} defaultValue={project?.name} className={field} />
      </label>
      <label className={label}>
        Builder
        <input name="builder" required maxLength={80} defaultValue={project?.builder} className={field} />
      </label>
      <label className={label}>
        RERA registration number
        <input name="rera" required maxLength={60} defaultValue={project?.rera} placeholder="PRM/KA/RERA/…" className={field} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Locality
          <select name="locality" required defaultValue={project?.locality ?? ""} className={field}>
            <option value="" disabled>
              Choose
            </option>
            {localities.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          Possession (empty if ready)
          <input name="possession" type="date" defaultValue={project?.possession ?? ""} className={field} />
        </label>
      </div>
      <label className={`${label} sm:col-span-2`}>
        About the project. Blank lines between paragraphs; &ldquo;## &rdquo; for headings, &ldquo;- &rdquo; for lists.
        <textarea name="description" required rows={6} defaultValue={project?.description} className="rounded-lg border border-hairline bg-canvas px-3 py-2 text-[15px] text-ink" />
      </label>
      <label className={`${label} sm:col-span-2`}>
        Units: links to the project&rsquo;s sale listings, one per line. Import them first, with the builder&rsquo;s phone as the owner.
        <textarea name="units" rows={4} defaultValue={units?.join("\n")} className="rounded-lg border border-hairline bg-canvas px-3 py-2 font-mono text-[14px] text-ink" />
      </label>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="published" defaultChecked={project?.published} className="h-4 w-4 accent-indigo" />
          Published
        </label>
        <button disabled={pending} className="h-10 cursor-pointer rounded-full bg-indigo px-5 font-semibold text-canvas hover:bg-indigo-deep disabled:opacity-60">
          {project ? "Save" : "Create project"}
        </button>
        <p aria-live="polite" className={`text-[14px] font-medium ${state.error ? "text-danger" : "text-verified"}`}>
          {state.error ?? state.ok}
        </p>
      </div>
    </form>
  );
}
