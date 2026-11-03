"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { NOTE_KINDS, NOTE_LABEL, PRIORITIES, PRIORITY_LABEL, REPEATS, REPEAT_LABEL } from "@/lib/docket-meta";
import { noteAction, saveItem, type DocketState } from "../actions";
import { field, small } from "../add-form";

export type Editable = { id: number; title: string; detail: string; priority: string; repeat: string; date: string; time: string };

/** The item's own fields. Sent by hand so a refused save keeps what was typed. */
export function ItemForm({ item }: { item: Editable }) {
  const [state, run, pending] = useActionState<DocketState, FormData>(saveItem.bind(null, item.id), {});
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => run(data));
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <label className={`${small} sm:col-span-2`}>
        Title
        <input name="title" required maxLength={160} defaultValue={item.title} className={field} />
      </label>
      <label className={`${small} sm:col-span-2`}>
        Notes
        <textarea name="detail" rows={4} maxLength={2000} defaultValue={item.detail} className="rounded-xl bg-canvas px-3.5 py-2.5 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-indigo" />
      </label>
      <label className={small}>
        Date
        <input name="date" type="date" defaultValue={item.date} className={field} />
      </label>
      <label className={small}>
        Time (optional)
        <input name="time" type="time" defaultValue={item.time} className={field} />
      </label>
      <label className={small}>
        Priority
        <select name="priority" defaultValue={item.priority} className={field}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      <label className={small}>
        Repeats
        <select name="repeat" defaultValue={item.repeat} className={field}>
          {REPEATS.map((r) => (
            <option key={r} value={r}>
              {REPEAT_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <button disabled={pending} className="h-11 cursor-pointer rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep disabled:cursor-wait disabled:opacity-70">
          {pending ? "Saving…" : "Save changes"}
        </button>
        <p role="status" className={`text-[14px] font-medium ${state.error ? "text-danger" : "text-verified"}`}>
          {state.error ?? (state.ok ? "Saved." : "")}
        </p>
      </div>
    </form>
  );
}

/** A note, or the outcome of a call, WhatsApp or visit. A saved one clears the box; a refused one keeps it. */
export function NoteForm({ id }: { id: number }) {
  const [state, run, pending] = useActionState<DocketState, FormData>(noteAction.bind(null, id), {});
  const form = useRef<HTMLFormElement>(null);
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
      className="grid gap-2"
    >
      <label className="sr-only" htmlFor="dk-note">
        What happened
      </label>
      <textarea id="dk-note" name="body" rows={3} maxLength={2000} required placeholder="What happened? A call, a promise, what's next." className="w-full resize-y rounded-2xl bg-canvas px-4 py-3 text-[15px] focus-visible:outline-2 focus-visible:outline-indigo" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="dk-kind">
          Kind
        </label>
        <select id="dk-kind" name="kind" defaultValue="note" className={`${field} h-10`}>
          {NOTE_KINDS.map((k) => (
            <option key={k} value={k}>
              {NOTE_LABEL[k]}
            </option>
          ))}
        </select>
        <button disabled={pending} className="h-10 cursor-pointer rounded-full bg-indigo px-5 text-[15px] font-semibold text-canvas hover:bg-indigo-deep disabled:cursor-wait disabled:opacity-70">
          {pending ? "Saving…" : "Add"}
        </button>
        <p role="status" className="text-[14px] text-danger">
          {state.error}
        </p>
      </div>
    </form>
  );
}
