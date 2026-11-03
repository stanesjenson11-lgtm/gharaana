"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addNote, claim, createItem, deleteItem, editItem, reassign, setStatus, type Reason, type Result, type Viewer } from "@/lib/docket";
import { isStatus, isSubjectKind, parseDue, parseTarget, presetDue, type Target } from "@/lib/docket-meta";
import type { StaffRole } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";

export type DocketState = { error?: string; ok?: number };

const PROBLEM: Record<Reason, string> = {
  gone: "That item is gone, or it isn't yours to change.",
  title: "Give it a short title, up to 160 characters.",
  long: "Keep the notes under 2,000 characters.",
  due: "That isn't a real date.",
  target: "You can't hand work to that person or team.",
  subject: "That client, home, request or ticket can't be attached.",
  forbidden: "Only whoever made it, or the super admin, can delete it.",
  bad: "Something in that wasn't right. Check the choices and try again.",
};

async function viewer(): Promise<Viewer> {
  const me = await requireAdmin("docket"); // every staff role may; the check is for the authenticator and a live session
  return { id: me.id, role: me.role as StaffRole, name: me.name };
}

function refresh(id?: number) {
  revalidatePath("/admin/docket");
  if (id) revalidatePath(`/admin/docket/${id}`);
  revalidatePath("/admin"); // the dashboard card
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

/** A day typed in the form wins over a quick choice; neither means no date. undefined: not a real date. */
const dueOf = (form: FormData) => {
  const date = text(form, "date").trim();
  return date ? parseDue(date, form.get("time")) : presetDue(form.get("due"), new Date());
};

export async function addItem(prev: DocketState, form: FormData): Promise<DocketState> {
  const me = await viewer();
  const due = dueOf(form);
  if (due === undefined) return { error: PROBLEM.due };
  const target = parseTarget(form.get("assignee"));
  if (!target) return { error: PROBLEM.target };
  const subject = text(form, "subject");
  const at = subject.indexOf(":");
  const kind = subject.slice(0, at);
  const r = await createItem(me, {
    title: text(form, "title"),
    detail: text(form, "detail"),
    priority: text(form, "priority") || "normal",
    repeat: text(form, "repeat") || "none",
    dueAt: due,
    target,
    subject: at > 0 && isSubjectKind(kind) ? { kind, id: subject.slice(at + 1) } : null,
  });
  if (!r.ok) return { error: PROBLEM[r.reason] };
  refresh(r.id);
  return { ok: (prev.ok ?? 0) + 1 };
}

const report = (r: Result, prev: DocketState, id: number): DocketState => {
  if (!r.ok) return { error: PROBLEM[r.reason] };
  refresh(id);
  return { ok: (prev.ok ?? 0) + 1 };
};

export async function saveItem(id: number, prev: DocketState, form: FormData): Promise<DocketState> {
  const me = await viewer();
  const due = parseDue(text(form, "date"), form.get("time"));
  if (due === undefined) return { error: PROBLEM.due };
  return report(await editItem(me, id, { title: text(form, "title"), detail: text(form, "detail"), priority: text(form, "priority"), repeat: text(form, "repeat"), dueAt: due }), prev, id);
}

export async function noteAction(id: number, prev: DocketState, form: FormData): Promise<DocketState> {
  return report(await addNote(await viewer(), id, text(form, "kind"), text(form, "body")), prev, id);
}

/** The buttons: start, wait, finish, drop, reopen. Run from forms, so they return nothing. */
export async function statusAction(id: number, status: string) {
  const me = await viewer();
  if (isStatus(status)) await setStatus(me, id, status);
  refresh(id);
}

export async function claimAction(id: number) {
  await claim(await viewer(), id);
  refresh(id);
}

export async function snoozeAction(id: number, preset: string) {
  const due = presetDue(preset, new Date());
  if (due) await editItem(await viewer(), id, { dueAt: due });
  refresh(id);
}

export async function reassignAction(id: number, form: FormData) {
  const target: Target | null = parseTarget(form.get("assignee"));
  if (target) await reassign(await viewer(), id, target);
  refresh(id);
}

export async function deleteAction(id: number) {
  const r = await deleteItem(await viewer(), id);
  refresh();
  if (r.ok) redirect("/admin/docket");
}
