"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const ROOMS: [string, string][] = [["living", "Living room"], ["bedroom", "Bedroom"], ["kitchen", "Kitchen"], ["bathroom", "Bathroom"], ["exterior", "Building"], ["balcony", "Balcony and view"]];

/** Sends photos one at a time to the team's upload route, then refreshes the page to show them. */
export function PhotoUploader({ listingId, room: first = "living" }: { listingId: string; room?: string }) {
  const router = useRouter();
  const files = useRef<HTMLInputElement>(null);
  const [room, setRoom] = useState(first);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const chosen = [...(files.current?.files ?? [])];
    if (!chosen.length) return;
    setBusy(true);
    let added = 0;
    const problems: string[] = [];
    for (const file of chosen) {
      setNote(`Uploading ${added + problems.length + 1} of ${chosen.length}…`);
      const body = new FormData();
      body.set("listingId", listingId);
      body.set("room", room);
      body.set("file", file);
      const res = await fetch("/api/admin/photo", { method: "POST", body }).catch(() => null);
      if (res?.ok) added++;
      else problems.push(`${file.name}: ${(await res?.json().catch(() => null))?.error ?? "the upload failed"}`);
    }
    if (files.current) files.current.value = "";
    setBusy(false);
    setNote([added ? `Added ${added}.` : "", ...problems].filter(Boolean).join(" "));
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-[13px] text-muted">
        Room
        <select value={room} onChange={(e) => setRoom(e.target.value)} className="h-11 rounded-lg border border-hairline bg-canvas px-3 text-[15px] text-ink">
          {ROOMS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[13px] text-muted">
        Photos (JPG or PNG, at least 600 px wide)
        <input ref={files} type="file" accept="image/*" multiple className="h-11 rounded-lg border border-hairline bg-canvas px-2 py-2 text-[14px] text-ink file:mr-3 file:rounded-full file:border-0 file:bg-surface file:px-3 file:py-1 file:font-semibold" />
      </label>
      <button type="button" disabled={busy} onClick={send} className="h-11 cursor-pointer rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep disabled:opacity-60">
        {busy ? "Uploading…" : "Add photos"}
      </button>
      <p aria-live="polite" className="w-full text-[14px] text-muted">
        {note}
      </p>
    </div>
  );
}
