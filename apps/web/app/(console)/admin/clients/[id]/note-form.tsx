"use client";

import { useActionState, useEffect, useRef } from "react";
import { addClientNote } from "../../client-actions";

export function NoteForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(addClientNote.bind(null, clientId), {});
  const box = useRef<HTMLTextAreaElement>(null);
  // A saved note clears the box; a failed one keeps what was typed.
  useEffect(() => {
    if (state.ok && box.current) box.current.value = "";
  }, [state.ok]);

  return (
    <form action={action} className="mt-4">
      <label htmlFor="note" className="sr-only">
        Add a private note
      </label>
      <textarea
        ref={box}
        id="note"
        name="note"
        rows={3}
        maxLength={2000}
        placeholder="A call, a promise, a worry. Only the team sees this."
        aria-invalid={!!state.error}
        aria-describedby={state.error ? "note-error" : undefined}
        className="w-full resize-y rounded-2xl bg-canvas px-4 py-3 text-[15px] focus-visible:outline-2 focus-visible:outline-indigo"
      />
      <div className="mt-2 flex items-center gap-3">
        <button disabled={pending} className="h-10 cursor-pointer rounded-full bg-indigo px-5 text-[15px] font-semibold text-canvas hover:bg-indigo-deep disabled:cursor-wait disabled:opacity-70">
          {pending ? "Saving…" : "Add note"}
        </button>
        <p id="note-error" role="status" className="text-[14px] text-danger">
          {state.error}
        </p>
      </div>
    </form>
  );
}
