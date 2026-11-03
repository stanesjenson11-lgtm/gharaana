"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { PRESETS, PRIORITIES, PRIORITY_LABEL, REPEATS, REPEAT_LABEL } from "@/lib/docket-meta";
import { ROLE_LABEL, type StaffRole } from "@/lib/roles";
import { addItem, type DocketState } from "./actions";

export const field = "h-11 rounded-xl bg-canvas px-3.5 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-indigo";
export const small = "grid gap-1 text-[13px] text-muted";

export type Person = { id: string; name: string; role: StaffRole };
export type Pool = { role: StaffRole; label: string };

/** The "give it to" choices: yourself, the people your role may hand work to, and the shared pools. */
export function AssigneeSelect({ people, pools, meId, value, name = "assignee", id }: { people: Person[]; pools: Pool[]; meId: string; value?: string; name?: string; id?: string }) {
  const others = people.filter((p) => p.id !== meId);
  return (
    <select id={id} name={name} defaultValue={value ?? `u:${meId}`} className={field}>
      <option value={`u:${meId}`}>Me</option>
      {others.length > 0 && (
        <optgroup label="Teammates">
          {others.map((p) => (
            <option key={p.id} value={`u:${p.id}`}>
              {p.name}, {ROLE_LABEL[p.role]}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Up for grabs">
        {pools.map((p) => (
          <option key={p.role} value={`r:${p.role}`}>
            Anyone in {p.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

export function AddForm({ people, pools, meId, subject }: { people: Person[]; pools: Pool[]; meId: string; subject: { value: string; label: string } | null }) {
  const [state, run, pending] = useActionState<DocketState, FormData>(addItem, {});
  const form = useRef<HTMLFormElement>(null);
  // A saved item clears the form; a refused one keeps what was typed.
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state.ok]);

  return (
    <form
      ref={form}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => run(data));
      }}
      className="grid gap-3"
    >
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
        <label className="sr-only" htmlFor="dk-title">
          What needs doing
        </label>
        <input id="dk-title" name="title" required maxLength={160} placeholder="What needs doing? e.g. Call Mrs Rao about the sale papers" className={`${field} w-full`} />
        <div>
          <label className="sr-only" htmlFor="dk-who">
            Give it to
          </label>
          <AssigneeSelect id="dk-who" people={people} pools={pools} meId={meId} />
        </div>
        <div>
          <label className="sr-only" htmlFor="dk-due">
            Due
          </label>
          <select id="dk-due" name="due" defaultValue="" className={field}>
            <option value="">No date</option>
            {PRESETS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <button disabled={pending} className="h-11 cursor-pointer rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep disabled:cursor-wait disabled:opacity-70">
          {pending ? "Adding…" : "Add"}
        </button>
      </div>

      {subject && (
        <p className="text-[14px] text-muted">
          About: <span className="font-medium text-ink">{subject.label}</span>
          <input type="hidden" name="subject" value={subject.value} />
        </p>
      )}

      <details open={!!subject} className="group">
        <summary className="inline-flex h-9 cursor-pointer items-center text-[14px] font-medium text-indigo hover:underline">More: notes, a date and time, priority, repeat</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={`${small} sm:col-span-2 lg:col-span-4`}>
            Notes
            <textarea name="detail" rows={3} maxLength={2000} className="rounded-xl bg-canvas px-3.5 py-2.5 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-indigo" />
          </label>
          <label className={small}>
            Date
            <input name="date" type="date" className={field} />
          </label>
          <label className={small}>
            Time (optional)
            <input name="time" type="time" className={field} />
          </label>
          <label className={small}>
            Priority
            <select name="priority" defaultValue="normal" className={field}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className={small}>
            Repeats
            <select name="repeat" defaultValue="none" className={field}>
              {REPEATS.map((r) => (
                <option key={r} value={r}>
                  {REPEAT_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-[13px] text-muted">A date here replaces the quick choice above. With no time, it&rsquo;s due by the end of that day.</p>
      </details>

      <p role="status" className={`min-h-5 text-[14px] ${state.error ? "font-medium text-danger" : "text-verified"}`}>
        {state.error ?? (state.ok ? "Added." : "")}
      </p>
    </form>
  );
}
