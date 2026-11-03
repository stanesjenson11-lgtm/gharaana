"use server";

import { revealPhone, type Reveal } from "@/lib/contact";
import { createLead, leadSchema } from "@/lib/leads";
import { getMember } from "@/lib/session";

export async function revealContact(listingId: string): Promise<Reveal | { ok: false; reason: "signed-out" }> {
  const session = await getMember();
  if (!session) return { ok: false, reason: "signed-out" };
  return revealPhone(session.user.id, String(listingId).slice(0, 200));
}

export type LeadState = { status: "idle" | "sent" } | { status: "error"; message: string };

const NOT_SENT = {
  gone: "This home isn't listed any more.",
  sample: "This is a sample listing, so there's no owner to send it to.",
  own: "This is your own home.",
  duplicate: "You've already asked about this home. The owner's answer will show in your account.",
  limit: "You've sent a lot of requests today. Try again tomorrow.",
};

export async function requestLead(_: LeadState, form: FormData): Promise<LeadState> {
  const session = await getMember();
  if (!session) return { status: "error", message: "Sign in first, so the owner knows who's asking." };
  const field = (k: string) => form.get(k) || undefined;
  const parsed = leadSchema.safeParse({
    listingId: field("listingId"),
    kind: field("kind"),
    preferredDate: field("preferredDate"),
    preferredSlot: field("preferredSlot"),
    note: field("note"),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const r = await createLead(session.user.id, parsed.data);
  return r.ok ? { status: "sent" } : { status: "error", message: NOT_SENT[r.reason] };
}
