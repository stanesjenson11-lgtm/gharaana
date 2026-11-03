"use client";

import { useTransition } from "react";
import { signOutAndReload } from "@/lib/sign-out";

export function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await signOutAndReload("user");
        })
      }
      className="h-10 cursor-pointer rounded-full border border-hairline px-4 text-[15px] font-medium hover:border-muted disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
