"use client";

import { useActionState } from "react";
import { ROLE_LABEL, STAFF_ROLES } from "@/lib/roles";
import { addStaff, inviteByEmail } from "../staff-actions";

const input = "h-11 rounded-xl border border-hairline bg-canvas px-4 text-[15px] focus-visible:border-indigo focus-visible:outline-none";

export function AddStaffForm() {
  const [state, action, pending] = useActionState(addStaff, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="staff-phone" className="block text-[14px] font-medium">
          Mobile number
        </label>
        <div className={`mt-1.5 flex items-center ${input} p-0`}>
          <span className="pl-4 text-muted tabular-nums">+91</span>
          <input id="staff-phone" name="phone" inputMode="numeric" autoComplete="off" required pattern="[6-9][0-9]{9}" maxLength={10} className="h-full w-40 bg-transparent px-2 tabular-nums focus-visible:outline-none" />
        </div>
      </div>
      <div>
        <label htmlFor="staff-role" className="block text-[14px] font-medium">
          Role
        </label>
        <select id="staff-role" name="role" defaultValue="reviewer" className={`mt-1.5 ${input}`}>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>
      <button disabled={pending} className="h-11 cursor-pointer rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep disabled:cursor-wait disabled:opacity-70">
        {pending ? "Saving…" : "Give access"}
      </button>
      <p role="status" className={`basis-full text-[14px] ${state.error ? "text-danger" : "text-muted"}`}>
        {state.error ?? state.ok}
      </p>
    </form>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteByEmail, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="invite-email" className="block text-[14px] font-medium">
          Google or Apple email
        </label>
        <input id="invite-email" name="email" type="email" autoComplete="off" required maxLength={254} className={`mt-1.5 w-72 max-w-full ${input}`} />
      </div>
      <div>
        <label htmlFor="invite-role" className="block text-[14px] font-medium">
          Role
        </label>
        <select id="invite-role" name="role" defaultValue="reviewer" className={`mt-1.5 ${input}`}>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>
      <button disabled={pending} className="h-11 cursor-pointer rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep disabled:cursor-wait disabled:opacity-70">
        {pending ? "Saving…" : "Invite"}
      </button>
      <p role="status" className={`basis-full text-[14px] ${state.error ? "text-danger" : "text-muted"}`}>
        {state.error ?? state.ok}
      </p>
    </form>
  );
}
