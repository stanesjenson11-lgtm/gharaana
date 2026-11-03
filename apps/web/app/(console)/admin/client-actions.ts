"use server";

import { revalidatePath } from "next/cache";
import { addNote, type NoteResult } from "@/lib/clients";
import { requireAdmin } from "@/lib/session";

export type NoteState = { error?: string; ok?: number };

const PROBLEM: Record<Exclude<NoteResult, "ok">, string> = {
  empty: "Write something first.",
  long: "Keep it under 2,000 characters.",
  gone: "That client no longer exists.",
};

/** A private note on a client's file. Only staff who can open Clients can write or read it. */
export async function addClientNote(clientId: string, prev: NoteState, form: FormData): Promise<NoteState> {
  const me = await requireAdmin("users");
  const r = await addNote(me.id, String(clientId), String(form.get("note") ?? ""));
  if (r !== "ok") return { error: PROBLEM[r] };
  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: (prev.ok ?? 0) + 1 };
}
