"use server";

import { revalidatePath } from "next/cache";
import { isStaffRole } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import { inviteStaff, revokeInvite, setRole, type InviteResult, type RoleResult } from "@/lib/staff";

export type StaffState = { error?: string; ok?: string };

const PROBLEM: Record<Exclude<RoleResult, "ok">, string> = {
  "bad-phone": "Enter a 10-digit Indian mobile number.",
  "no-account": "No account has that number yet. They need to sign in once first.",
  self: "You can't change your own role.",
  banned: "That account is suspended.",
};

async function apply(form: FormData): Promise<StaffState> {
  const me = await requireAdmin("staff");
  const phone = `+91${String(form.get("phone") ?? "").replace(/\D/g, "").slice(-10)}`;
  const role = form.get("role");
  if (role !== "member" && !isStaffRole(role)) return { error: "Choose a role." };
  const r = await setRole(me.id, phone, role);
  if (r !== "ok") return { error: PROBLEM[r] };
  revalidatePath("/admin/staff");
  return { ok: role === "member" ? "Access removed." : "Saved." };
}

/** The add-someone form: shows what went wrong next to the field. */
export async function addStaff(_: StaffState, form: FormData) {
  return apply(form);
}

/** A row's role picker or Remove button. The people listed exist, so there is nothing to report back. */
export async function changeStaff(form: FormData) {
  await apply(form);
}

const INVITE_PROBLEM: Record<Exclude<InviteResult, "ok">, string> = {
  "bad-email": "Enter a full email address.",
  self: "That's your own account.",
  "has-role": "They're already on the team. Change their role from the list below.",
};

/** Reserves a role for an email. It takes effect when they next sign in with Google or Apple under that address. */
export async function inviteByEmail(_: StaffState, form: FormData): Promise<StaffState> {
  const me = await requireAdmin("staff");
  const role = form.get("role");
  if (!isStaffRole(role)) return { error: "Choose a role." };
  const email = String(form.get("email") ?? "");
  const r = await inviteStaff(me.id, email, role);
  if (r !== "ok") return { error: INVITE_PROBLEM[r] };
  revalidatePath("/admin/staff");
  return { ok: "Invited. The role is theirs the next time they sign in with that address." };
}

export async function withdrawInvite(form: FormData) {
  const me = await requireAdmin("staff");
  await revokeInvite(me.id, String(form.get("email") ?? ""));
  revalidatePath("/admin/staff");
}
