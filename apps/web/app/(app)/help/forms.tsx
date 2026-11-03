"use client";

import { useActionState } from "react";
import { TOPICS } from "@/lib/support-topics";
import { replyTicket, startTicket, type HelpState } from "./actions";

const box = "w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-[15px] focus-visible:border-indigo focus-visible:outline-none";
const send = "h-11 cursor-pointer rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep disabled:opacity-60";

export function TicketForm({ topic, listing }: { topic?: string; listing?: { id: string; title: string } }) {
  const [state, action, pending] = useActionState<HelpState, FormData>(startTicket, {});
  return (
    <form action={action} className="mt-4 grid max-w-xl gap-4">
      {listing && <input type="hidden" name="listing" value={listing.id} />}
      <label className="grid gap-1.5 text-[14px] font-medium">
        What&rsquo;s it about?
        <select name="topic" required defaultValue={topic ?? ""} className={`${box} h-11`}>
          <option value="" disabled>
            Choose one
          </option>
          {TOPICS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {listing && <p className="text-[15px] text-muted">About: {listing.title}</p>}
      <label className="grid gap-1.5 text-[14px] font-medium">
        Tell us what happened
        <textarea key={state.body} name="body" rows={5} required minLength={10} maxLength={3000} defaultValue={state.body} className={box} />
      </label>
      {state.error && (
        <p role="alert" className="text-[14px] font-medium text-danger">
          {state.error}
        </p>
      )}
      <div>
        <button disabled={pending} className={send}>
          {pending ? "Sending…" : "Send to our team"}
        </button>
      </div>
    </form>
  );
}

export function ReplyForm({ id, staff }: { id: number; staff: boolean }) {
  const [state, action, pending] = useActionState<HelpState, FormData>(replyTicket.bind(null, id), {});
  return (
    <form action={action} className="mt-6 grid gap-3 border-t border-hairline pt-6">
      <label className="grid gap-1.5 text-[14px] font-medium">
        {staff ? "Reply as the team" : "Add a message"}
        <textarea key={`${state.sent ?? 0}-${state.body ?? ""}`} name="body" rows={4} required minLength={10} maxLength={3000} defaultValue={state.body} className={box} />
      </label>
      {state.error && (
        <p role="alert" className="text-[14px] font-medium text-danger">
          {state.error}
        </p>
      )}
      <div>
        <button disabled={pending} className={send}>
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
