"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveThisSearch } from "@/app/(app)/account/actions";
import { authClient } from "@/lib/auth-client";

export function SaveSearch({ query }: { query: string }) {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "full">("idle");
  const [shown, setShown] = useState(query);
  if (shown !== query) {
    // A different search gets a fresh button.
    setShown(query);
    setState("idle");
  }

  const save = async () => {
    if (isPending) return;
    if (!session) return router.push(`/sign-in?next=${encodeURIComponent(`/search?${query}`)}`);
    setState("saving");
    const r = await saveThisSearch(query).catch(() => null);
    setState(r?.ok ? "saved" : r && !r.ok && r.reason === "full" ? "full" : "idle");
  };

  return (
    <span aria-live="polite" className="text-[14px]">
      {state === "saved" ? (
        <Link href="/account#saved-searches" className="inline-flex h-9 items-center font-medium text-verified hover:underline">
          Saved to your account
        </Link>
      ) : state === "full" ? (
        <Link href="/account#saved-searches" className="inline-flex h-9 items-center text-muted hover:underline">
          You have 20 saved. Remove one first.
        </Link>
      ) : (
        <button
          type="button"
          onClick={save}
          disabled={state === "saving"}
          className="h-9 cursor-pointer rounded-full border border-hairline px-4 font-medium text-ink transition-colors duration-150 hover:border-muted disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : "Save search"}
        </button>
      )}
    </span>
  );
}
