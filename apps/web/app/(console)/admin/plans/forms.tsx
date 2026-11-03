"use client";

import { useActionState } from "react";
import { featureAction, savePlanAction, type AdminFormState } from "../actions";

const field = "h-10 rounded-lg border border-hairline bg-canvas px-3 text-[15px] text-ink";
const label = "grid gap-1 text-[13px] text-muted";

function Status({ state }: { state: AdminFormState }) {
  return (
    <p aria-live="polite" className={`text-[14px] font-medium ${state.error ? "text-danger" : "text-verified"}`}>
      {state.error ?? state.ok}
    </p>
  );
}

type Plan = { id: number; name: string; price: number; days: number; perks: string[]; active: boolean; position: number };

export function PlanForm({ plan }: { plan?: Plan }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(savePlanAction.bind(null, plan?.id ?? null), {});
  return (
    <form action={action} className="grid gap-3 border-t border-hairline py-5 sm:grid-cols-[1fr_120px_90px_70px]">
      <label className={label}>
        Name
        <input name="name" required maxLength={60} defaultValue={plan?.name} className={field} />
      </label>
      <label className={label}>
        Price (₹)
        <input name="price" required inputMode="numeric" defaultValue={plan?.price} className={`${field} tabular-nums`} />
      </label>
      <label className={label}>
        Days
        <input name="days" type="number" required min={1} max={365} defaultValue={plan?.days ?? 30} className={field} />
      </label>
      <label className={label}>
        Order
        <input name="position" type="number" min={0} max={99} defaultValue={plan?.position ?? 0} className={field} />
      </label>
      <label className={`${label} sm:col-span-4`}>
        What it includes, one per line
        <textarea name="perks" rows={3} defaultValue={plan?.perks.join("\n")} className="rounded-lg border border-hairline bg-canvas px-3 py-2 text-[15px] text-ink" />
      </label>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-4">
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="active" defaultChecked={plan?.active ?? true} className="h-4 w-4 accent-indigo" />
          Offered on the plans page
        </label>
        <button disabled={pending} className="h-9 cursor-pointer rounded-full bg-indigo px-4 text-[14px] font-semibold text-canvas hover:bg-indigo-deep disabled:opacity-60">
          {plan ? "Save" : "Add plan"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function FeatureForm() {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(featureAction, {});
  return (
    <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
      <label className={`${label} min-w-64 flex-1`}>
        Listing link or id
        <input name="listing" required placeholder="https://…/homes/2bhk-…" className={field} />
      </label>
      <label className={label}>
        Days
        <input name="days" type="number" required min={0} max={365} defaultValue={30} className={`${field} w-24`} />
      </label>
      <button disabled={pending} className="h-10 cursor-pointer rounded-full bg-indigo px-5 font-semibold text-canvas hover:bg-indigo-deep disabled:opacity-60">
        Feature
      </button>
      <div className="w-full">
        <Status state={state} />
        <p className="text-[13px] text-muted">0 days stops featuring it.</p>
      </div>
    </form>
  );
}
