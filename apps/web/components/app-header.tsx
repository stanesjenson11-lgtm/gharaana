import { connection } from "next/server";
import { Suspense } from "react";
import { IdleGuard } from "@/components/auth/idle-guard";
import { HeaderShell } from "@/components/nav/header-shell";
import { SiteHeader, type Member } from "@/components/nav/site-header";
import { inbox, unreadTotal } from "@/lib/chat";
import { latestNotifications, unreadCount } from "@/lib/notify";
import { homeFor, isStaffRole, ROLE_LABEL } from "@/lib/roles";
import { RENTALS } from "@/lib/search";
import { getSession } from "@/lib/session";

// The header every page shares. The bar itself is static; who is signed in streams into it, so pages stay cacheable.
// A fixed 64px bar, so search and chat can size against it.
export function AppHeader() {
  return (
    <Suspense fallback={<HeaderShell rentals={RENTALS} />}>
      <WithMember />
    </Suspense>
  );
}

const when = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

async function WithMember() {
  await connection(); // who is signed in is decided per request, never prerendered
  const session = await getSession();
  let member: Member | null = null;
  if (session) {
    const id = session.user.id;
    const [alerts, chats, unread, unreadAlerts] = await Promise.all([latestNotifications(id, 5), inbox(id, 5), unreadTotal(id), unreadCount(id)]);
    const role = session.user.role;
    member = {
      name: session.user.name,
      image: session.user.image ?? null,
      alerts: unreadAlerts,
      unread,
      alertItems: alerts.map((a) => ({ id: a.id, text: a.text, href: a.href, unread: !a.readAt, when: when(a.createdAt) })),
      chatItems: chats.map((c) => ({ id: c.id, title: c.title, who: c.otherName || "Owner", last: c.last, unread: c.unread, when: when(c.lastMessageAt) })),
      console: isStaffRole(role) ? { href: homeFor(role), label: ROLE_LABEL[role] } : null,
    };
  }
  return (
    <>
      <SiteHeader member={member} rentals={RENTALS} />
      {session && <IdleGuard />}
    </>
  );
}
