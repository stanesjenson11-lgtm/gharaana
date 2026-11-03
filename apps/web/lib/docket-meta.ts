// The docket's words, options and date rules. Shared by the pages (browser and server) and lib/docket.ts, so it must not
// import anything server-only. Dates are India time throughout: a due date is a day in India, and means the end of it
// unless a time is given.
import { isStaffRole, type Section, type StaffRole } from "./roles.ts";

export const STATUSES = ["open", "doing", "waiting", "done", "dropped"] as const;
export type DocketStatus = (typeof STATUSES)[number];
export const OPEN_STATUSES = ["open", "doing", "waiting"] as const satisfies readonly DocketStatus[];
export const isStatus = (s: unknown): s is DocketStatus => STATUSES.includes(s as DocketStatus);
export const STATUS_LABEL: Record<DocketStatus, string> = { open: "To do", doing: "In progress", waiting: "Waiting on someone", done: "Done", dropped: "Dropped" };
export const STATUS_STYLE: Record<DocketStatus, string> = {
  open: "bg-surface text-muted",
  doing: "bg-indigo/10 text-indigo",
  waiting: "bg-streetlight/30 text-ink",
  done: "bg-verified-wash text-verified",
  dropped: "bg-surface text-muted",
};

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type DocketPriority = (typeof PRIORITIES)[number];
export const isPriority = (p: unknown): p is DocketPriority => PRIORITIES.includes(p as DocketPriority);
export const PRIORITY_LABEL: Record<DocketPriority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
export const PRIORITY_STYLE: Record<DocketPriority, string> = { low: "bg-surface text-muted", normal: "bg-surface text-ink", high: "bg-streetlight/30 text-ink", urgent: "bg-danger/10 text-danger" };

export const REPEATS = ["none", "daily", "weekly", "monthly"] as const;
export type DocketRepeat = (typeof REPEATS)[number];
export const isRepeat = (r: unknown): r is DocketRepeat => REPEATS.includes(r as DocketRepeat);
export const REPEAT_LABEL: Record<DocketRepeat, string> = { none: "Doesn't repeat", daily: "Every day", weekly: "Every week", monthly: "Every month" };

export const NOTE_KINDS = ["note", "call", "whatsapp", "visit"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
export const isNoteKind = (k: unknown): k is NoteKind => NOTE_KINDS.includes(k as NoteKind);
export const NOTE_LABEL: Record<NoteKind | "event", string> = { note: "Note", call: "Call", whatsapp: "WhatsApp", visit: "Visit", event: "Update" };

// What an item can be about, and the console section a person needs to be allowed to attach or open it.
export const SUBJECT_KINDS = ["client", "listing", "lead", "ticket"] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];
export const isSubjectKind = (k: unknown): k is SubjectKind => SUBJECT_KINDS.includes(k as SubjectKind);
export const SUBJECT_LABEL: Record<SubjectKind, string> = { client: "Client", listing: "Home", lead: "Request", ticket: "Support" };
export const SUBJECT_SECTION: Record<SubjectKind, Section> = { client: "users", listing: "listings", lead: "leads", ticket: "support" };

export const SCOPES = [
  ["mine", "Mine"],
  ["pool", "Up for grabs"],
  ["made", "Handed off"],
  ["team", "Everyone's"],
  ["done", "Finished"],
] as const;
export type Scope = (typeof SCOPES)[number][0];
export const isScope = (s: unknown): s is Scope => SCOPES.some(([v]) => v === s);
/** Everyone's open work is for the super admin; the rest see their own corner of it. */
export const scopesFor = (role: string) => SCOPES.filter(([v]) => v !== "team" || role === "admin");

export const PRESETS = [
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["3d", "In 3 days"],
  ["week", "In a week"],
] as const;

// ---------- Dates ----------

const DAY = 864e5;
const IST = 330 * 60_000; // India is UTC+5:30 all year

/** A date as India sees it: "2026-10-19". */
export const istDate = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const startOfDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - IST);

/** [start, end) of today in India, as instants. */
export const todayRange = (now: Date): [Date, Date] => {
  const start = startOfDay(istDate(now));
  return [start, new Date(start.getTime() + DAY)];
};

/** A day (and optionally a time) typed in a form. null: nothing typed. undefined: not a real date. */
export function parseDue(date: unknown, time: unknown = ""): Date | null | undefined {
  const d = String(date ?? "").trim();
  if (!d) return null;
  const t = String(time ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || (t && !/^\d{2}:\d{2}$/.test(t))) return undefined;
  const at = new Date(`${d}T${t || "23:59"}:00+05:30`);
  // JavaScript rolls 31 February over into March; a date that doesn't come back as typed was never real.
  return Number.isNaN(at.getTime()) || istDate(at) !== d ? undefined : at;
}

/** "Today", "Tomorrow", "In 3 days", "In a week": the quick choices. */
export function presetDue(preset: unknown, now: Date): Date | null | undefined {
  const days = { today: 0, tomorrow: 1, "3d": 3, week: 7 }[String(preset) as "today"];
  return days === undefined ? (preset ? undefined : null) : parseDue(addDays(istDate(now), days));
}

export type Bucket = "none" | "overdue" | "today" | "soon" | "later";
export function dueBucket(due: Date | null, now: Date): Bucket {
  if (!due) return "none";
  if (due.getTime() < now.getTime()) return "overdue";
  const [, tomorrow] = todayRange(now);
  if (due.getTime() < tomorrow.getTime()) return "today";
  return due.getTime() < startOfDay(addDays(istDate(now), 8)).getTime() ? "soon" : "later";
}

/** The next time a repeating item falls due: after now, skipping any periods that were missed. */
export function nextDue(due: Date | null, repeat: DocketRepeat, now: Date): Date | null {
  if (repeat === "none") return null;
  const base = due ?? now;
  const step = (d: Date): Date => {
    if (repeat !== "monthly") return new Date(d.getTime() + (repeat === "daily" ? 1 : 7) * DAY);
    const local = new Date(d.getTime() + IST);
    const [y, m, day] = [local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()];
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // days in the next month
    local.setUTCFullYear(y, m, Math.min(day, last));
    return new Date(local.getTime() - IST);
  };
  let next = step(base);
  while (next.getTime() <= now.getTime()) next = step(next);
  return next;
}

const clock = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const dayName = (d: Date) => d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const isEndOfDay = (d: Date) => clock(d) === "11:59 pm";

/** How a due date reads in a list: "Overdue by 2 days", "Today", "Tomorrow", "Thu 23 Oct". */
export function dueText(due: Date | null, now: Date) {
  if (!due) return "No date";
  const at = isEndOfDay(due) ? "" : `, ${clock(due)}`;
  const bucket = dueBucket(due, now);
  if (bucket === "overdue") {
    const days = Math.round((Date.parse(istDate(now)) - Date.parse(istDate(due))) / DAY);
    return days <= 0 ? `Overdue${at}` : days === 1 ? "Overdue by a day" : `Overdue by ${days} days`;
  }
  if (bucket === "today") return `Today${at}`;
  if (istDate(due) === addDays(istDate(now), 1)) return `Tomorrow${at}`;
  return `${dayName(due)}${at}`;
}

/** The value for a date input and a time input, in India time. */
export const dueInputs = (due: Date | null) => (due ? { date: istDate(due), time: isEndOfDay(due) ? "" : new Date(due.getTime() + IST).toISOString().slice(11, 16) } : { date: "", time: "" });

// ---------- Who an item is given to ----------

/** One person, or a role's shared pool. */
export type Target = { userId: string } | { role: StaffRole };

/** The value of an assignee choice in a form: "u:<user id>" or "r:<role>". */
export function parseTarget(value: unknown): Target | null {
  const [kind, rest] = [String(value ?? "").slice(0, 1), String(value ?? "").slice(2)];
  if (kind === "u" && rest) return { userId: rest };
  if (kind === "r" && isStaffRole(rest)) return { role: rest };
  return null;
}
export const targetValue = (t: Target) => ("userId" in t ? `u:${t.userId}` : `r:${t.role}`);
