// Shared by the help form (browser) and lib/support.ts (server), so it must not import anything server-only.
export const TOPICS = [
  ["account", "My account or signing in"],
  ["listing", "A home I listed"],
  ["report", "Report a broker or a fake listing"],
  ["other", "Something else"],
] as const;
export type Topic = (typeof TOPICS)[number][0];
export const isTopic = (t: unknown): t is Topic => TOPICS.some(([v]) => v === t);
export const TICKET_STATUS = {
  open: ["Waiting for our team", "bg-indigo/10 text-indigo"],
  answered: ["We replied", "bg-verified-wash text-verified"],
  closed: ["Closed", "bg-surface text-muted"],
} as const;
export const topicLabel = (t: Topic) => TOPICS.find(([v]) => v === t)![1];
