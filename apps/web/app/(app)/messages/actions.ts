"use server";

import { redirect } from "next/navigation";
import { MAX_MESSAGE, messagesAfter, sendMessage, startConversation, type ChatMessage } from "@/lib/chat";
import { getMember } from "@/lib/session";

const NOT_STARTED = {
  gone: "This home isn't listed any more.",
  sample: "This is a sample listing, so there's no owner to chat with.",
  own: "This is your own home. Buyers' messages show under Messages.",
};

/** Opens the thread about a home and goes to it. Returns a message when it can't. */
export async function startChat(listingId: string): Promise<string | undefined> {
  const id = String(listingId).slice(0, 200);
  const session = await getMember();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/homes/${id}`)}`);
  const r = await startConversation(session.user.id, id);
  if (r.ok) redirect(`/messages/${r.id}`);
  return NOT_STARTED[r.reason];
}

export async function pollMessages(conversationId: number, afterId: number): Promise<ChatMessage[]> {
  const session = await getMember();
  if (!session || !Number.isInteger(conversationId) || !Number.isInteger(afterId)) return [];
  return (await messagesAfter(conversationId, session.user.id, afterId)) ?? [];
}

const NOT_SENT = {
  empty: "Write a message first.",
  long: `Keep it under ${MAX_MESSAGE} characters.`,
  gone: "This conversation isn't available.",
  limit: "You've sent a lot of messages this hour. Try again a little later.",
};

/** Returns null when sent, or what went wrong. */
export async function postMessage(conversationId: number, body: string): Promise<string | null> {
  const session = await getMember();
  if (!session) return "Sign in again to send messages.";
  if (!Number.isInteger(conversationId)) return NOT_SENT.gone;
  const r = await sendMessage(conversationId, session.user.id, String(body));
  return r.ok ? null : NOT_SENT[r.reason];
}
