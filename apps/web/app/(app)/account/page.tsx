import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DeleteAccountButton } from "@/components/auth/delete-account-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ListingTile } from "@/components/search/listing-tile";
import { daysAgo, inr, inrShort, phone as formatPhone } from "@/lib/format";
import imageLoader from "@/lib/image-loader";
import { leadsByRequester, leadsForOwner } from "@/lib/leads";
import { ownerListings, shortlistedCards } from "@/lib/listings";
import { savedSearchList } from "@/lib/saved";
import { visitTime } from "@/lib/search";
import { requireUser } from "@/lib/session";
import { answer, confirmAvailable, markRented, removeSavedSearch, setName } from "./actions";

export const metadata: Metadata = { title: "Your account | Gharaana", robots: { index: false } };

const STATUS = {
  pending_review: ["Waiting for review", "bg-surface text-muted"],
  active: ["Live", "bg-verified-wash text-verified"],
  rented: ["Rented", "bg-surface text-muted"],
  expired: ["Expired", "bg-danger/10 text-danger"],
  rejected: ["Not approved", "bg-danger/10 text-danger"],
} as const;

const LEAD = {
  new: ["New", "bg-indigo/10 text-indigo"],
  confirmed: ["Confirmed", "bg-verified-wash text-verified"],
  declined: ["Declined", "bg-surface text-muted"],
  done: ["Done", "bg-surface text-muted"],
} as const;

const primary = "h-9 cursor-pointer rounded-full bg-indigo px-4 text-[14px] font-semibold text-canvas hover:bg-indigo-deep";
const secondary = "h-9 cursor-pointer rounded-full border border-hairline px-4 text-[14px] font-semibold hover:border-muted";

/** "Sat 18 Oct, Evening, 4 to 8" for visits; when it was asked for callbacks. */
function when(r: { kind: string; preferredDate: string | null; preferredSlot: string | null; createdAt?: Date }) {
  if (r.kind === "visit" && r.preferredDate) return visitTime(r.preferredDate, r.preferredSlot);
  return r.createdAt ? `Asked ${daysAgo(Math.floor((Date.now() - r.createdAt.getTime()) / 86_400_000))}` : "";
}

export default function AccountPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Account />
      </Suspense>
    </main>
  );
}

async function Account() {
  const me = await requireUser("/account");
  const [homes, incoming, mine, saved, searches] = await Promise.all([
    ownerListings(me.id),
    leadsForOwner(me.id),
    leadsByRequester(me.id),
    shortlistedCards(me.id),
    savedSearchList(me.id),
  ]);
  const phone = me.phoneNumber ? formatPhone(me.phoneNumber) : null;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[2rem] leading-tight font-semibold">Your account</h1>
          <p className="mt-1 text-muted tabular-nums">{[me.name, phone].filter(Boolean).join(", ") || "Signed in"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/messages" className="inline-flex h-10 items-center rounded-full border border-hairline px-4 text-[15px] font-medium hover:border-muted">
            Messages
          </Link>
          <SignOutButton />
        </div>
      </header>

      <form action={setName} className="mt-6 flex flex-wrap items-end gap-2">
        <label className="grid gap-1.5 text-[14px] font-medium">
          Your name
          <input
            name="name"
            defaultValue={me.name}
            required
            maxLength={60}
            autoComplete="name"
            className="h-10 w-64 rounded-lg border border-hairline bg-canvas px-3 text-[15px] focus-visible:border-indigo focus-visible:outline-none"
          />
        </label>
        <button className="h-10 cursor-pointer rounded-full border border-hairline px-4 text-[15px] font-medium hover:border-muted">Save</button>
        {!me.name && <p className="w-full text-[14px] text-muted">Owners and buyers see this name in chats and requests.</p>}
      </form>

      <section aria-labelledby="homes" className="mt-12">
        <div className="flex items-end justify-between gap-4">
          <h2 id="homes" className="text-xl font-semibold">
            Your homes
          </h2>
          {homes.length > 0 && (
            <span className="flex gap-4">
              <Link href="/plans" className="text-[15px] font-medium text-indigo hover:underline">
                Get more buyers
              </Link>
              <Link href="/post" className="text-[15px] font-medium text-indigo hover:underline">
                Post another home
              </Link>
            </span>
          )}
        </div>

        {homes.length === 0 ? (
          <div className="mt-4 border-t border-hairline pt-8">
            <p className="text-muted">You haven&rsquo;t listed a home yet. It&rsquo;s free, and a person reviews it before it goes live.</p>
            <Link href="/post" className="mt-5 inline-flex h-11 items-center rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep">
              Post your property
            </Link>
          </div>
        ) : (
          <ul className="mt-4">
            {homes.map((home) => {
              // Past its 30 days without a confirmation, a listing is already hidden from search.
              const h = { ...home, status: home.status === "active" && home.expiresInDays < 0 ? ("expired" as const) : home.status };
              const [status, tone] = STATUS[h.status];
              const label = h.status === "rented" && h.type === "buy" ? "Sold" : status;
              return (
                <li key={h.id} className="flex flex-wrap gap-4 border-t border-hairline py-5">
                  {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnail from the listing's own photos */}
                  {h.cover ? <img src={imageLoader({ src: h.cover, width: 240 })} alt="" className="aspect-[4/3] w-28 shrink-0 rounded-lg object-cover" /> : <span className="aspect-[4/3] w-28 shrink-0 rounded-lg bg-surface" />}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ${tone}`}>{label}</span>
                      <span className="text-[14px] text-muted tabular-nums">{h.type === "rent" ? `${inr(h.price + h.maintenance)} /month` : inrShort(h.price)}</span>
                    </p>
                    <p className="mt-1 truncate font-medium">
                      {h.status === "active" ? (
                        <Link href={`/homes/${h.id}`} className="hover:underline">
                          {h.title}
                        </Link>
                      ) : (
                        h.title
                      )}
                    </p>
                    <p className="mt-0.5 text-[14px] text-muted">
                      {h.status === "active" &&
                        (h.expiresInDays <= 7
                          ? `Confirm it's still available within ${Math.max(h.expiresInDays, 0)} days, or it comes down.`
                          : `You confirmed it ${daysAgo(h.confirmedDaysAgo)}.`)}
                      {h.status === "pending_review" && "We review new homes within a day."}
                      {h.status === "expired" && "Confirm it's still available to put it back up."}
                      {h.status === "rejected" && `${h.rejectReason ?? "It wasn't approved"}. Fix it and post it again.`}
                    </p>
                  </div>
                  {(h.status === "active" || h.status === "expired") && (
                    <div className="flex w-full gap-2 sm:w-auto sm:flex-col">
                      <form action={confirmAvailable.bind(null, h.id)}>
                        <button className="h-9 cursor-pointer rounded-full bg-indigo px-4 text-[14px] font-semibold text-canvas hover:bg-indigo-deep">Still available</button>
                      </form>
                      {h.status === "active" && (
                        <form action={markRented.bind(null, h.id)}>
                          <button className="h-9 cursor-pointer rounded-full border border-hairline px-4 text-[14px] font-semibold hover:border-muted">
                            {h.type === "rent" ? "Mark as rented" : "Mark as sold"}
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {incoming.length > 0 && (
        <section aria-labelledby="requests" className="mt-12">
          <h2 id="requests" className="text-xl font-semibold">
            Requests from buyers
          </h2>
          <ul className="mt-4">
            {incoming.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-4 border-t border-hairline py-5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ${LEAD[r.status][1]}`}>{LEAD[r.status][0]}</span>
                    <span className="text-[14px] text-muted">{when(r)}</span>
                  </p>
                  <p className="mt-1 font-medium">
                    {r.kind === "visit" ? "Wants to visit " : "Wants a call back about "}
                    <Link href={`/homes/${r.listingId}`} className="hover:underline">
                      {r.title}
                    </Link>
                  </p>
                  <p className="mt-0.5 text-[14px] text-muted">
                    {r.name || "A buyer"},{" "}
                    {r.phone ? (
                      <a href={`tel:${r.phone}`} className="font-medium text-indigo tabular-nums hover:underline">
                        {formatPhone(r.phone)}
                      </a>
                    ) : (
                      "no phone number"
                    )}
                  </p>
                  {r.note && <p className="mt-2 max-w-prose text-[15px] whitespace-pre-line">{r.note}</p>}
                </div>
                {(r.status === "new" || (r.status === "confirmed" && r.kind === "visit")) && (
                  <div className="flex w-full gap-2 sm:w-auto sm:flex-col">
                    {r.status === "confirmed" ? (
                      <form action={answer.bind(null, r.id, "done")}>
                        <button className={secondary}>Visit done</button>
                      </form>
                    ) : r.kind === "visit" ? (
                      <>
                        <form action={answer.bind(null, r.id, "confirmed")}>
                          <button className={primary}>Confirm visit</button>
                        </form>
                        <form action={answer.bind(null, r.id, "declined")}>
                          <button className={secondary}>Decline</button>
                        </form>
                      </>
                    ) : (
                      <form action={answer.bind(null, r.id, "done")}>
                        <button className={primary}>I called them</button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="saved-homes" className="mt-12">
        <h2 id="saved-homes" className="text-xl font-semibold">
          Saved homes
        </h2>
        {saved.length ? (
          <div className="mt-4 grid gap-x-3 gap-y-4 sm:grid-cols-2">
            {saved.map((c) => (
              <ListingTile key={c.id} card={c} />
            ))}
          </div>
        ) : (
          <p className="mt-3 border-t border-hairline pt-5 text-muted">Tap the heart on any home to keep it here.</p>
        )}
      </section>

      <section aria-labelledby="saved-searches-title" id="saved-searches" className="mt-12 scroll-mt-24">
        <h2 id="saved-searches-title" className="text-xl font-semibold">
          Saved searches
        </h2>
        {searches.length ? (
          <ul className="mt-4">
            {searches.map((s) => (
              <li key={s.id} className="flex items-center gap-4 border-t border-hairline py-3">
                <Link href={`/search?${s.query}`} className="min-w-0 flex-1 font-medium hover:underline">
                  {s.label}
                </Link>
                <form action={removeSavedSearch.bind(null, s.id)}>
                  <button className="h-9 cursor-pointer rounded-full px-3 text-[14px] font-semibold text-muted hover:text-ink">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 border-t border-hairline pt-5 text-muted">
            Use &ldquo;Save search&rdquo; on the{" "}
            <Link href="/search" className="text-indigo hover:underline">
              search page
            </Link>{" "}
            to come back to the same filters in one tap.
          </p>
        )}
      </section>

      {mine.length > 0 && (
        <section aria-labelledby="asked" className="mt-12">
          <h2 id="asked" className="text-xl font-semibold">
            Your requests
          </h2>
          <ul className="mt-4">
            {mine.map((r) => (
              <li key={r.id} className="border-t border-hairline py-4">
                <p className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ${LEAD[r.status][1]}`}>{r.status === "new" ? "Waiting for the owner" : LEAD[r.status][0]}</span>
                  <span className="text-[14px] text-muted">{r.kind === "visit" ? `Visit, ${when(r)}` : "Call back"}</span>
                </p>
                <Link href={`/homes/${r.listingId}`} className="mt-1 block truncate font-medium hover:underline">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="privacy" className="mt-16 border-t border-hairline pt-8">
        <h2 id="privacy" className="text-[15px] font-semibold text-muted">
          Privacy and data
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Your personal data is handled under India&rsquo;s Digital Personal Data Protection Act. You have the right to erase your account and associated listings, chats, and records at any time.
        </p>
        <div className="mt-4">
          <DeleteAccountButton />
        </div>
      </section>
    </>
  );
}
