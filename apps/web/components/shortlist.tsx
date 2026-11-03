"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { myShortlist, shortlist } from "@/app/(app)/account/actions";
import { authClient } from "@/lib/auth-client";

// One copy of the signed-in person's shortlist for every heart on the page: loaded once, updated optimistically.
const EMPTY = new Set<string>();
const subscribers = new Set<() => void>();
let ids = EMPTY;
let owner: string | undefined; // whose list `ids` is

const notify = () => subscribers.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

function loadFor(userId: string | undefined) {
  if (owner === userId) return;
  owner = userId;
  ids = EMPTY;
  notify();
  if (userId)
    myShortlist().then((list) => {
      if (owner !== userId) return;
      ids = new Set(list);
      notify();
    });
}

function flip(id: string, on: boolean) {
  const next = new Set(ids);
  if (on) next.add(id);
  else next.delete(id);
  ids = next;
  notify();
}

async function toggle(id: string) {
  const on = !ids.has(id);
  flip(id, on);
  if (!(await shortlist(id, on).catch(() => false))) flip(id, !on); // put it back if the save failed
}

export function ShortlistButton({
  id,
  title,
  className = "",
  onLight = false,
}: {
  id: string;
  title: string;
  className?: string;
  onLight?: boolean; // dark outline for white surfaces; default is for photos
}) {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const path = usePathname();
  const userId = session?.user.id;
  useEffect(() => {
    if (!isPending) loadFor(userId);
  }, [userId, isPending]);
  const saved = useSyncExternalStore(subscribe, () => ids, () => EMPTY).has(id);

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from your shortlist` : `Add ${title} to your shortlist`}
      onClick={(e) => {
        e.preventDefault();
        if (isPending) return;
        if (!userId) router.push(`/sign-in?next=${encodeURIComponent(path + location.search)}`);
        else toggle(id);
      }}
      className={`grid h-10 w-10 cursor-pointer place-items-center rounded-full transition-transform duration-150 ease-out-quint active:scale-90 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 drop-shadow-[0_1px_2px_oklch(0.2_0.03_266/0.5)]" aria-hidden="true">
        <path
          d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z"
          fill={saved ? "var(--color-indigo)" : onLight ? "none" : "oklch(0.2 0.03 266 / 0.25)"}
          stroke={onLight && !saved ? "var(--color-ink)" : "white"}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
