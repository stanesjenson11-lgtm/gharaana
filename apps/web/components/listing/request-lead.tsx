"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useId, useRef } from "react";
import { requestLead, type LeadState } from "@/app/(app)/homes/[id]/actions";
import { authClient } from "@/lib/auth-client";
import { SLOTS } from "@/lib/search";

const field = "h-11 w-full rounded-lg border border-hairline bg-canvas px-3 text-[15px] text-ink focus-visible:border-indigo focus-visible:outline-none";
const dayAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-CA");

export function RequestLead({ listingId, owner, sample, kind }: { listingId: string; owner: string; sample: boolean; kind: "visit" | "callback" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const path = usePathname();
  const { data: session } = authClient.useSession();
  const [state, action, pending] = useActionState<LeadState, FormData>(requestLead, { status: "idle" });
  const first = owner.split(" ")[0];
  const id = useId();
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="h-11 w-full cursor-pointer rounded-full border border-hairline px-4 text-[15px] font-semibold transition-colors duration-150 ease-out-quint hover:border-muted"
      >
        {kind === "visit" ? "Schedule a visit" : "Call me back"}
      </button>
      <dialog ref={dialog} aria-labelledby={`${id}-title`} className="m-auto w-[min(92vw,460px)] rounded-2xl bg-canvas p-6 text-ink shadow-2xl backdrop:bg-ink/40">
        <h2 id={`${id}-title`} className="text-xl font-semibold">
          {kind === "visit" ? `Visit ${first}'s home` : `Ask ${first} to call you`}
        </h2>

        {sample || !session || state.status === "sent" ? (
          <>
            <p className="mt-2 text-muted" aria-live="polite">
              {sample
                ? "This is a sample listing that shows how Gharaana works. There's no real owner to ask."
                : !session
                  ? `Sign in with your phone so ${first} knows who's asking and can reach you.`
                  : `Sent. ${first} will ${kind === "visit" ? "confirm the visit" : "call you back"}, and you can see their answer in your account.`}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={close} className="h-11 cursor-pointer rounded-full px-5 font-semibold text-muted hover:text-ink">
                Close
              </button>
              {!session && !sample && (
                <Link href={`/sign-in?next=${encodeURIComponent(path)}`} className="inline-flex h-11 items-center rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep">
                  Sign in to continue
                </Link>
              )}
            </div>
          </>
        ) : (
          <form action={action} className="mt-4 grid gap-4">
            <input type="hidden" name="listingId" value={listingId} />
            <input type="hidden" name="kind" value={kind} />
            {kind === "visit" && (
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-[14px] font-medium">
                  Day
                  <input type="date" name="preferredDate" required min={dayAhead(0)} max={dayAhead(60)} className={field} suppressHydrationWarning />
                </label>
                <label className="grid gap-1.5 text-[14px] font-medium">
                  Time
                  <select name="preferredSlot" required defaultValue="" className={field}>
                    <option value="" disabled>
                      Choose
                    </option>
                    {SLOTS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <label className="grid gap-1.5 text-[14px] font-medium">
              <span>
                Anything {first} should know <span className="font-normal text-muted">(optional)</span>
              </span>
              <textarea name="note" rows={3} maxLength={500} className={`${field} h-auto py-2`} placeholder={kind === "visit" ? "Who's coming, or questions to ask on the day" : "A good time to call, or what you'd like to ask"} />
            </label>
            <p className="text-[14px] text-muted">
              {first} will see your phone number so they can {kind === "visit" ? "confirm the visit" : "call you back"}. Nobody else will.
            </p>
            {state.status === "error" && (
              <p role="alert" className="text-[14px] font-medium text-danger">
                {state.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="h-11 cursor-pointer rounded-full px-5 font-semibold text-muted hover:text-ink">
                Cancel
              </button>
              <button disabled={pending} className="h-11 cursor-pointer rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep disabled:opacity-60">
                {pending ? "Sending…" : "Send request"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
