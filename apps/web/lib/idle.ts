// Idle sign-out: after IDLE_MS with no activity a warning asks whether to stay; WARN_MS later, with no answer, the person
// is signed out. Shared by the page that shows the warning (browser) and the server, so it imports nothing server-only.
//
// The browser does the counting, but it cannot be the only guard: a closed tab, a sleeping laptop or a script can't be
// relied on to sign anyone out. So every session also carries its last activity on the server (session.updatedAt, moved
// by /api/session/touch), and one unused for SERVER_IDLE_MS is dropped the next time it is looked at.
export const IDLE_MS = 5 * 60_000;
export const WARN_MS = 60_000;
export const SERVER_IDLE_MS = IDLE_MS + WARN_MS + 60_000; // the warning's minute, and a minute of slack for slow networks
export const TOUCH_EVERY_MS = 60_000; // while someone is active, the server hears of it this often at most

export type IdlePhase = { phase: "active" } | { phase: "warning"; secondsLeft: number } | { phase: "expired" };

/** Where the countdown stands, given the last moment of activity. */
export function idlePhase(lastActivity: number, now: number): IdlePhase {
  const idle = now - lastActivity;
  if (idle < IDLE_MS) return { phase: "active" };
  if (idle < IDLE_MS + WARN_MS) return { phase: "warning", secondsLeft: Math.ceil((IDLE_MS + WARN_MS - idle) / 1000) };
  return { phase: "expired" };
}

/** Whether a session untouched since `lastSeen` has been idle past what the server allows. */
export const idleTooLong = (lastSeen: Date | number, now = Date.now()) => now - new Date(lastSeen).getTime() > SERVER_IDLE_MS;
