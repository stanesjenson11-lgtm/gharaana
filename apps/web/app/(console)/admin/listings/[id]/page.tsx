import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/nav/avatar";
import { Card, CardHead } from "@/components/console/card";
import { phone } from "@/lib/format";
import imageLoader from "@/lib/image-loader";
import { LISTING_STATUS, LISTING_STATUS_STYLE, type ListingStatus } from "@/lib/labels";
import { listingForEdit, MAX_PHOTOS, type Move } from "@/lib/listings-admin";
import { ROOMS } from "@/lib/listing-schema";
import { AMENITIES } from "@/lib/search";
import { requireAdmin } from "@/lib/session";
import { approve, markVisited, reject } from "../../actions";
import { FLAG_TEXT, REJECT_REASONS } from "../../reasons";
import { changeStatus, deleteListingAction, removePhotoAction, setRoomAction, shiftPhotoAction } from "../actions";
import { EditForm } from "./edit-form";
import { PhotoUploader } from "./photo-uploader";

// Neutral title: the static shell is served to everyone, and the page shouldn't advertise itself.
export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

export default function ListingPage({ params }: PageProps<"/admin/listings/[id]">) {
  return (
    <main className="pt-4 pb-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[22px] bg-surface" />}>
        <Listing params={params} />
      </Suspense>
    </main>
  );
}

const ROOM_LABEL: Record<(typeof ROOMS)[number], string> = { living: "Living room", bedroom: "Bedroom", kitchen: "Kitchen", bathroom: "Bathroom", exterior: "Building", balcony: "Balcony and view" };
const day = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const button = "h-10 cursor-pointer rounded-full border border-hairline bg-canvas px-4 text-[15px] font-semibold hover:border-muted";
const MOVE_BUTTONS: Record<ListingStatus, [Move, string][]> = {
  pending_review: [],
  active: [["rented", "Mark sold"], ["expired", "Take down"], ["pending_review", "Send back to review"]],
  rented: [["active", "Make live again"], ["pending_review", "Send back to review"]],
  expired: [["active", "Make live again"], ["pending_review", "Send back to review"]],
  rejected: [["pending_review", "Send back to review"]],
};

async function Listing({ params }: Pick<PageProps<"/admin/listings/[id]">, "params">) {
  await requireAdmin("listings");
  const { id } = await params;
  const l = await listingForEdit(id);
  if (!l) notFound();
  const lastLivePhoto = l.status === "active" && l.photos.length <= 1;

  return (
    <>
      <p className="text-[14px]">
        <Link href="/admin/listings" className="text-muted hover:text-ink">
          ← Properties
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-[1.75rem] leading-[1.1] font-medium tracking-[-0.03em] md:text-[2.25rem]">{l.title}</h1>
        <span className={`rounded-full px-2.5 py-1 text-[13px] font-semibold ${LISTING_STATUS_STYLE[l.status]}`}>{LISTING_STATUS[l.status]}</span>
        {l.status === "active" && (
          <Link href={`/homes/${l.id}`} className="text-[15px] font-semibold text-indigo hover:underline">
            See it on the site
          </Link>
        )}
        <Link href={`/admin/docket?subject=listing:${l.id}`} className="text-[15px] font-semibold text-indigo hover:underline">
          Add to docket
        </Link>
      </div>
      <p className="mt-1 text-[14px] text-muted">
        {l.id} · posted {day(l.createdAt)}
        {l.sample && " · sample listing"}
      </p>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-4">
          <Card>
            <CardHead icon="home" title="Photos" description={`${l.photos.length} of ${MAX_PHOTOS}. The first one is the picture on search results.`} />
            {l.photos.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-canvas px-4 py-8 text-center text-muted">No photos yet. Add some below.</p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {l.photos.map((p, i) => (
                  <li key={p.id} className="overflow-hidden rounded-2xl bg-canvas">
                    {/* eslint-disable-next-line @next/next/no-img-element -- team thumbnails */}
                    <img src={imageLoader({ src: p.src, width: 480 })} alt={`${ROOM_LABEL[p.room]}, photo ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                    <div className="grid gap-2 p-3">
                      <form action={setRoomAction.bind(null, l.id, p.id)} className="flex gap-2">
                        <label className="sr-only" htmlFor={`room-${p.id}`}>
                          Room for photo {i + 1}
                        </label>
                        <select id={`room-${p.id}`} name="room" defaultValue={p.room} className="h-10 min-w-0 flex-1 rounded-lg border border-hairline bg-canvas px-2 text-[14px]">
                          {ROOMS.map((r) => (
                            <option key={r} value={r}>
                              {ROOM_LABEL[r]}
                            </option>
                          ))}
                        </select>
                        <button className={button}>Set</button>
                      </form>
                      <div className="flex flex-wrap gap-2">
                        <form action={shiftPhotoAction.bind(null, l.id, p.id, -1)}>
                          <button disabled={i === 0} aria-label={`Move photo ${i + 1} earlier`} className={`${button} disabled:opacity-40`}>
                            ←
                          </button>
                        </form>
                        <form action={shiftPhotoAction.bind(null, l.id, p.id, 1)}>
                          <button disabled={i === l.photos.length - 1} aria-label={`Move photo ${i + 1} later`} className={`${button} disabled:opacity-40`}>
                            →
                          </button>
                        </form>
                        <form action={removePhotoAction.bind(null, l.id, p.id)} className="ml-auto">
                          <button disabled={lastLivePhoto} title={lastLivePhoto ? "A live home keeps at least one photo" : undefined} className={`${button} text-danger disabled:opacity-40`}>
                            Remove
                          </button>
                        </form>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 border-t border-hairline pt-5">
              <PhotoUploader listingId={l.id} />
            </div>
          </Card>

          <Card>
            <CardHead icon="pages" title="Details" description="What buyers see, plus the private address. The map pin and the type of listing stay as they are." />
            <div className="mt-5">
              <EditForm
                amenities={AMENITIES}
                d={{
                  id: l.id,
                  type: l.type,
                  kind: l.kind,
                  bhk: l.bhk,
                  carpetSqft: l.carpetSqft,
                  floor: l.floor,
                  totalFloors: l.totalFloors,
                  facing: l.facing,
                  furnishing: l.furnishing,
                  saleCondition: l.saleCondition,
                  bathrooms: l.bathrooms,
                  balconies: l.balconies,
                  ageYears: l.ageYears,
                  locality: l.locality,
                  area: l.area,
                  address: l.addressPrivate,
                  description: l.description,
                  price: l.price,
                  maintenance: l.maintenance,
                  deposit: l.deposit,
                  availableFrom: l.availableFrom,
                  tenants: l.tenants,
                  pets: l.pets,
                  nonVeg: l.nonVeg,
                  parking: l.parking,
                  amenities: l.amenities,
                  videoUrl: l.videoUrl,
                }}
              />
            </div>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHead icon="queue" title="Where it stands" description={LISTING_STATUS[l.status]} />
            <div className="mt-4 grid gap-3">
              {l.status === "pending_review" && (
                <>
                  <form action={approve.bind(null, l.id)}>
                    <button className="h-11 w-full cursor-pointer rounded-full bg-verified px-6 font-semibold text-canvas hover:opacity-90">Approve and publish</button>
                  </form>
                  <form action={reject.bind(null, l.id)} className="grid gap-2">
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
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {MOVE_BUTTONS[l.status].map(([to, label]) => (
                  <form key={to} action={changeStatus.bind(null, l.id, to)}>
                    <button className={button}>{label}</button>
                  </form>
                ))}
              </div>
              {l.visitVerifiedAt ? (
                <p className="text-[15px] text-verified">Visited by our team on {day(l.visitVerifiedAt)}</p>
              ) : (
                <form action={markVisited.bind(null, l.id)}>
                  <button className={button}>Mark visited</button>
                </form>
              )}
            </div>
            <dl className="mt-5 grid gap-2 border-t border-hairline pt-4 text-[14px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Runs until</dt>
                <dd className="tabular-nums">{day(l.expiresAt)}</dd>
              </div>
              {l.reviewedAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Reviewed</dt>
                  <dd className="tabular-nums">{day(l.reviewedAt)}</dd>
                </div>
              )}
              {l.rejectReason && (
                <div>
                  <dt className="text-muted">Reason given</dt>
                  <dd>{l.rejectReason}</dd>
                </div>
              )}
            </dl>
            {l.riskFlags.length > 0 && (
              <ul className="mt-4 grid gap-1 rounded-xl bg-danger/8 p-3 text-[14px] text-danger">
                {l.riskFlags.map((f) => (
                  <li key={f}>{FLAG_TEXT[f] ?? f}</li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[15px]">
              {l.proofKey ? (
                <a href={`/api/admin/proof/${l.proofKey}`} target="_blank" rel="noreferrer" className="font-semibold text-indigo hover:underline">
                  Open the ownership proof
                </a>
              ) : (
                <span className="text-muted">No ownership proof on file</span>
              )}
            </p>
          </Card>

          <Card>
            <CardHead icon="user" title="Owner" />
            <Link href={`/admin/clients/${l.owner.id}`} className="mt-4 flex items-center gap-3 rounded-xl hover:bg-canvas">
              <Avatar name={l.owner.name} image={l.owner.image} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{l.owner.name || "No name"}</span>
                <span className="block truncate text-[14px] text-muted tabular-nums">{l.owner.phone ? phone(l.owner.phone) : "No phone yet"}</span>
              </span>
            </Link>
            {l.owner.banned && <p className="mt-3 text-[14px] font-medium text-danger">This account is suspended.</p>}
          </Card>

          <Card className="border border-danger/30 bg-canvas">
            <CardHead title="Delete this home" description="Removes it, its photos and its proof for good. To just hide it, take it down instead." />
            <details className="mt-4">
              <summary className="inline-flex h-10 cursor-pointer items-center rounded-full border border-danger px-4 text-[15px] font-semibold text-danger hover:bg-danger/8">Delete…</summary>
              <form action={deleteListingAction.bind(null, l.id)} className="mt-3 grid gap-2">
                <p className="text-[14px]">This cannot be undone. Requests and chats about it go too.</p>
                <button className="h-11 cursor-pointer rounded-full bg-danger px-5 font-semibold text-canvas hover:opacity-90">Yes, delete it for good</button>
              </form>
            </details>
          </Card>
        </div>
      </div>
    </>
  );
}
