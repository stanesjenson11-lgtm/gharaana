"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** The header lives in the layout, which doesn't re-render on client navigation; this nudges it once (e.g. unread counts). */
export function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
