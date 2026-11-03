"use client";

import { useActionState } from "react";
import { startChat } from "@/app/(app)/messages/actions";

export function StartChat({ listingId, owner, sample }: { listingId: string; owner: string; sample: boolean }) {
  const [note, action, pending] = useActionState(
    async () => (sample ? "This is a sample listing, so there's no owner to chat with." : startChat(listingId)),
    undefined,
  );
  return (
    <form action={action} className="grid gap-1">
      <button
        disabled={pending}
        className="h-11 w-full cursor-pointer rounded-full border border-indigo px-4 text-[15px] font-semibold text-indigo transition-colors duration-150 ease-out-quint hover:bg-indigo hover:text-canvas disabled:opacity-60"
      >
        {pending ? "Opening chat…" : `Chat with ${owner.split(" ")[0]}`}
      </button>
      {note && (
        <p role="status" className="text-[14px] text-muted">
          {note}
        </p>
      )}
    </form>
  );
}
