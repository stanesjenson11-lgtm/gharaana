import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { logAuditEvent } from "@/lib/audit";
import { addPhoto, isRoom, MAX_PHOTOS } from "@/lib/listings-admin";
import { MediaError } from "@/lib/media";
import { staffGate } from "@/lib/session";

// The team adds photos to someone's listing. A route and not a server action: photos are bigger than an action's body limit.
export async function POST(request: Request) {
  const gate = await staffGate("listings");
  if (gate.gate !== "ok") return NextResponse.json({ error: "Not allowed." }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  const listingId = String(form.get("listingId") ?? "");
  const room = form.get("room");
  if (!(file instanceof File) || !listingId || !isRoom(room)) return NextResponse.json({ error: "Choose a photo and a room." }, { status: 400 });

  try {
    const result = await addPhoto(listingId, Buffer.from(await file.arrayBuffer()), room);
    if (result === "gone") return NextResponse.json({ error: "This listing no longer exists." }, { status: 404 });
    if (result === "full") return NextResponse.json({ error: `A listing holds ${MAX_PHOTOS} photos at most.` }, { status: 422 });
  } catch (e) {
    if (e instanceof MediaError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
  await logAuditEvent("ADMIN_LISTING_PHOTOS", { userId: gate.user.id, targetId: listingId, details: { added: file.name.slice(0, 80) } });
  revalidateTag(`listing:${listingId}`, { expire: 0 });
  revalidatePath(`/admin/listings/${listingId}`);
  return NextResponse.json({ ok: true });
}
