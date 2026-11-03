import type { Metadata } from "next";
import { Suspense } from "react";
import { bhkLabel, daysAgo, inr, inrShort, sqft } from "@/lib/format";
import imageLoader from "@/lib/image-loader";
import { pendingListings, unvisitedListings } from "@/lib/listings";
import { requireAdmin } from "@/lib/session";
import { approve, markVisited, reject } from "../actions";
import { FLAG_TEXT, REJECT_REASONS } from "../reasons";

// Neutral title: the static shell is served to everyone, and the page shouldn't advertise itself.
export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

const visitButton = "h-11 cursor-pointer rounded-full border border-hairline px-5 font-semibold hover:border-muted";

const ROOM = { living: "Living", bedroom: "Bedroom", kitchen: "Kitchen", bathroom: "Bathroom", exterior: "Building", balcony: "Balcony" };

export default function QueuePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Queue />
      </Suspense>
    </main>
  );
}

async function Queue() {
  await requireAdmin("queue");
  const [queue, toVisit] = await Promise.all([pendingListings(), unvisitedListings()]);

  return (
    <>
      {/* Inside the Suspense boundary, after the admin check: the static shell must not reveal these pages. */}
      <h1 className="text-[2rem] leading-tight font-semibold">Review queue</h1>
      <p className="mt-1 text-muted">
        {queue.length === 0 ? "Nothing waiting. New listings appear here as owners send them." : `${queue.length} waiting, oldest first. Nothing goes live until it's approved here.`}
      </p>

      {queue.map((l) => (
        <article key={l.id} aria-labelledby={`h-${l.id}`} className="mt-10 border-t border-hairline pt-8">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`h-${l.id}`} className="text-xl font-semibold">
              {l.title}
            </h2>
            <p className="text-[14px] text-muted">Waiting {l.waitingDays === 0 ? "since today" : daysAgo(l.waitingDays).replace(" ago", "")}</p>
          </header>

          {l.riskFlags.length > 0 ? (
            <ul className="mt-3 grid gap-1 rounded-lg bg-danger/8 p-3 text-[15px] text-danger">
              {l.riskFlags.map((f) => (
                <li key={f}>{FLAG_TEXT[f] ?? f}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[14px] text-verified">No automatic flags.</p>
          )}

          <ul className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {l.photos.map((p) => (
              <li key={p.src} className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- reviewer thumbnails */}
                <img src={imageLoader({ src: p.src, width: 480 })} alt={`${ROOM[p.room]} photo`} className="h-36 w-48 rounded-lg object-cover" />
                <span className="text-[13px] text-muted">{ROOM[p.room]}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 grid gap-x-8 gap-y-3 text-[15px] sm:grid-cols-2">
            <div>
              <dt className="text-[13px] text-muted">Owner</dt>
              <dd className="tabular-nums">
                {l.owner.name || "No name"}, {l.owner.phoneNumber ?? "no phone"}
                <span className="block text-[14px] text-muted">
                  Joined {l.owner.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}, {l.owner.listingCount}{" "}
                  {l.owner.listingCount === 1 ? "listing" : "listings"} in total
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Private address</dt>
              <dd>{l.addressPrivate}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Home</dt>
              <dd>
                {bhkLabel(l.bhk)} {l.kind.replace("-", " ")}, {sqft(l.carpetSqft)}, floor {l.floor} of {l.totalFloors}, {l.furnishing} furnished, faces {l.facing}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted">Price</dt>
              <dd className="tabular-nums">
                {l.type === "rent" ? `${inr(l.price)} rent + ${inr(l.maintenance)} maintenance, ${inr(l.deposit)} deposit` : inrShort(l.price)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[13px] text-muted">Owner&rsquo;s description</dt>
              <dd className="max-w-[70ch]">{l.description}</dd>
            </div>
          </dl>

          {l.videoUrl && (
            <p className="mt-4">
              <a href={l.videoUrl} target="_blank" rel="noreferrer" className="font-semibold text-indigo hover:underline">
                Watch the owner&rsquo;s video tour
              </a>
            </p>
          )}

          <p className="mt-4">
            {l.proofKey ? (
              <a href={`/api/admin/proof/${l.proofKey}`} target="_blank" rel="noreferrer" className="font-semibold text-indigo hover:underline">
                Open the ownership proof
              </a>
            ) : (
              <span className="text-danger">No ownership proof uploaded</span>
            )}
          </p>

          <div className="mt-6 flex flex-wrap items-end gap-3">
            {l.visitVerifiedAt ? (
              <p className="self-center text-[15px] text-verified">Visited {l.visitVerifiedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
            ) : (
              <form action={markVisited.bind(null, l.id)}>
                <button className={visitButton}>Mark visited</button>
              </form>
            )}
            <form action={approve.bind(null, l.id)}>
              <button className="h-11 cursor-pointer rounded-full bg-verified px-6 font-semibold text-canvas hover:opacity-90">Approve and publish</button>
            </form>
            <form action={reject.bind(null, l.id)} className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-[13px] text-muted">
                Reason the owner will see
                <select name="reason" required defaultValue="" className="h-11 rounded-lg border border-hairline bg-canvas px-2 text-[15px] text-ink">
                  <option value="" disabled>
                    Choose a reason
                  </option>
                  {REJECT_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <button className="h-11 cursor-pointer rounded-full border border-danger px-5 font-semibold text-danger hover:bg-danger/8">Reject</button>
            </form>
          </div>
        </article>
      ))}

      <section aria-labelledby="to-visit" className="mt-16 border-t border-hairline pt-8">
        <h2 id="to-visit" className="text-xl font-semibold">
          Live homes to visit
        </h2>
        <p className="mt-1 text-muted">
          {toVisit.length === 0 ? "Every live home has been visited." : "Mark each one once someone from the team has seen it in person. Buyers see a “Visited by our team” badge."}
        </p>
        <ul className="mt-4">
          {toVisit.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-4 border-t border-hairline py-4">
              <div className="min-w-0 flex-1 text-[15px]">
                <p className="font-medium">{v.title}</p>
                <p className="text-muted">
                  {v.addressPrivate}. {v.owner.name || "Owner"}, <span className="tabular-nums">{v.owner.phoneNumber ?? "no phone"}</span>
                </p>
              </div>
              <form action={markVisited.bind(null, v.id)}>
                <button className={visitButton}>Mark visited</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
