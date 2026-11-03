"use client";

import { useState, useTransition } from "react";
import { deleteMyAccount } from "@/app/(app)/account/actions";

export function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[14px] font-medium text-danger">Permanently delete your account and all data?</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await deleteMyAccount(); })}
          className="h-9 cursor-pointer rounded-full bg-danger px-4 text-[13px] font-semibold text-canvas hover:opacity-90 disabled:opacity-70"
        >
          {pending ? "Deleting…" : "Yes, delete everything"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="h-9 cursor-pointer rounded-full border border-hairline px-3 text-[13px] font-medium text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="cursor-pointer text-[14px] text-muted underline decoration-hairline hover:text-danger hover:decoration-danger"
    >
      Delete account
    </button>
  );
}
