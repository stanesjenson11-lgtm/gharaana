"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { closeTicket, isTopic, openTicket, replyToTicket } from "@/lib/support";
import { requireAdmin, requireUser, staffGate } from "@/lib/session";

// `body` comes back on errors so the form can put the text back (React resets forms after every action).
export type HelpState = { error?: string; body?: string; sent?: number };

const PROBLEM = {
  short: "Tell us a little more (at least 10 characters).",
  long: "Keep it under 3,000 characters.",
  limit: "You've opened several requests today. Reply in one of them, or call us.",
  gone: "That request isn't available.",
};

export async function startTicket(_: HelpState, form: FormData): Promise<HelpState> {
  const me = await requireUser("/help");
  const body = String(form.get("body") ?? "");
  const topic = form.get("topic");
  if (!isTopic(topic)) return { error: "Choose what it's about.", body };
  const listing = form.get("listing");
  const r = await openTicket(me.id, topic, body, typeof listing === "string" && listing ? listing.slice(0, 200) : null);
  if (!r.ok) return { error: PROBLEM[r.reason], body };
  redirect(`/help/${r.id}`);
}

export async function replyTicket(id: number, prev: HelpState, form: FormData): Promise<HelpState> {
  const me = await requireUser(`/help/${id}`);
  const body = String(form.get("body") ?? "");
  if (!Number.isInteger(id)) return { error: PROBLEM.gone };
  const r = await replyToTicket(id, { id: me.id, staff: (await staffGate("support")).gate === "ok" }, body);
  if (!r.ok) return { error: PROBLEM[r.reason], body };
  revalidatePath(`/help/${id}`);
  return { sent: (prev.sent ?? 0) + 1 };
}

export async function closeTicketAction(id: number) {
  await requireAdmin("support");
  if (!Number.isInteger(id)) return;
  await closeTicket(id);
  revalidatePath(`/help/${id}`);
}
