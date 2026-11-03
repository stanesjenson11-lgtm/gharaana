import type { Metadata } from "next";
import { Suspense } from "react";
import { phone } from "@/lib/format";
import { ROLE_LABEL, SECTION_LABEL, sectionsOf, STAFF_ROLES } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import { listInvites, listStaff } from "@/lib/staff";
import { changeStaff, withdrawInvite } from "../staff-actions";
import { AddStaffForm, InviteForm } from "./add-form";

// Neutral title, like the review queue.
export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

export default function StaffPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface" />}>
        <Staff />
      </Suspense>
    </main>
  );
}

async function Staff() {
  const me = await requireAdmin("staff");
  const [people, invites] = await Promise.all([listStaff(), listInvites()]);

  return (
    <>
      <h1 className="text-[2rem] leading-tight font-semibold">Staff</h1>
      <p className="mt-1 text-muted">Each role opens only its own sections. Everyone sets up an authenticator the first time they sign in to the console.</p>

      <dl className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {STAFF_ROLES.map((r) => (
          <div key={r}>
            <dt className="text-[15px] font-semibold">{ROLE_LABEL[r]}</dt>
            <dd className="text-[14px] text-muted">{sectionsOf(r).map((s) => SECTION_LABEL[s]).join(", ")}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 text-[1.25rem] font-semibold">Invite by email</h2>
      <p className="mt-1 mb-4 text-muted">For someone who hasn&rsquo;t signed in yet. They sign in with Google or Apple under this address and land in the console.</p>
      <InviteForm />
      {invites.length > 0 && (
        <ul className="mt-4">
          {invites.map((i) => (
            <li key={i.email} className="flex flex-wrap items-center gap-4 border-t border-hairline py-3">
              <p className="min-w-0 flex-1 text-[15px]">
                <span className="font-medium break-all">{i.email}</span>
                <span className="ml-2 rounded bg-indigo/10 px-1.5 py-0.5 text-[12px] font-semibold text-indigo">{ROLE_LABEL[i.role as keyof typeof ROLE_LABEL]}</span>
                <span className="ml-2 text-[14px] text-muted">waiting for their first sign-in</span>
              </p>
              <form action={withdrawInvite}>
                <input type="hidden" name="email" value={i.email} />
                <button className="h-9 cursor-pointer rounded-full border border-hairline px-4 text-[14px] font-semibold hover:border-muted">Withdraw</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-[1.25rem] font-semibold">Give access by mobile number</h2>
      <p className="mt-1 mb-4 text-muted">For someone who already has an account. They must have signed in to Gharaana once with this number.</p>
      <AddStaffForm />

      <ul className="mt-10">
        {people.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-4 border-t border-hairline py-4">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.name || "No name"}</span>
                <span className="rounded bg-indigo/10 px-1.5 py-0.5 text-[12px] font-semibold text-indigo">{ROLE_LABEL[p.role as keyof typeof ROLE_LABEL]}</span>
                {p.id === me.id && <span className="text-[13px] text-muted">You</span>}
              </p>
              <p className="text-[14px] text-muted tabular-nums">
                {p.phone ? phone(p.phone) : "No phone"} · {p.authenticator ? "authenticator on" : "authenticator not set up yet"}
              </p>
            </div>
            {p.id !== me.id && p.phone && (
              <form action={changeStaff} className="flex items-center gap-2">
                <input type="hidden" name="phone" value={p.phone} />
                <label htmlFor={`role-${p.id}`} className="sr-only">
                  Role for {p.name || p.phone}
                </label>
                <select id={`role-${p.id}`} name="role" defaultValue={p.role ?? ""} className="h-9 rounded-full border border-hairline bg-canvas px-3 text-[14px]">
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                  <option value="member">Remove access</option>
                </select>
                <button className="h-9 cursor-pointer rounded-full border border-hairline px-4 text-[14px] font-semibold hover:border-muted">Save</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
