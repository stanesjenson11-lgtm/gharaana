"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { revealContact } from "@/app/(app)/homes/[id]/actions";
import { authClient } from "@/lib/auth-client";
import { phone } from "@/lib/format";

type Result = Awaited<ReturnType<typeof revealContact>>;

const WHY = {
  gone: "This home isn't listed any more.",
  "no-phone": "This owner hasn't added a phone number yet.",
  limit: "You've reached today's limit for owner numbers. Numbers you've already seen still show; you can see new ones tomorrow.",
};

export function ContactOwner({ listingId, owner, sample, label, className = "" }: { listingId: string; owner: string; sample: boolean; label?: string; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const path = usePathname();
  const { data: session } = authClient.useSession();
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const first = owner.split(" ")[0];
  const id = useId();
  const signedOut = !session || (result && !result.ok && result.reason === "signed-out");

  const open = () => {
    dialog.current?.showModal();
    if (session && !sample && !result?.ok) start(async () => setResult(await revealContact(listingId)));
  };

  let body: ReactNode;
  if (sample) body = <p className="text-muted">This is a sample listing that shows how Gharaana works. There&rsquo;s no real owner to call.</p>;
  else if (signedOut)
    body = <p className="text-muted">Sign in with your phone to see the number and call {first} directly. We never share your number with owners or anyone else.</p>;
  else if (pending || !result) body = <p className="text-muted">Getting {first}&rsquo;s number&hellip;</p>;
  else if (result.ok)
    body = (
      <>
        <a href={`tel:${result.phone}`} className="mt-1 inline-block text-[1.75rem] font-semibold text-indigo tabular-nums hover:underline">
          {phone(result.phone)}
        </a>
        <p className="mt-2 text-muted">Say you found the home on Gharaana. Your number reaches {first} only if you call.</p>
      </>
    );
  else if (result.reason !== "signed-out" && result.reason !== "sample") body = <p className="text-muted">{WHY[result.reason]}</p>;

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={`h-12 w-full cursor-pointer rounded-full bg-indigo px-6 font-semibold text-canvas transition-[background-color,transform] duration-150 ease-out-quint hover:bg-indigo-deep active:scale-[0.98] ${className}`}
      >
        {label ?? <>Get {first}&rsquo;s number</>}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        className="m-auto w-[min(92vw,440px)] rounded-2xl bg-canvas p-6 text-ink shadow-2xl backdrop:bg-ink/40"
      >
        <h2 id={`${id}-title`} className="text-xl font-semibold">
          {first}&rsquo;s number
        </h2>
        <div aria-live="polite" className="mt-2">
          {body}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => dialog.current?.close()} className="h-11 cursor-pointer rounded-full px-5 font-semibold text-muted hover:text-ink">
            {signedOut && !sample ? "Cancel" : "Close"}
          </button>
          {signedOut && !sample && (
            <Link
              href={`/sign-in?next=${encodeURIComponent(path)}`}
              className="inline-flex h-11 items-center rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep"
            >
              Sign in to continue
            </Link>
          )}
        </div>
      </dialog>
    </>
  );
}
