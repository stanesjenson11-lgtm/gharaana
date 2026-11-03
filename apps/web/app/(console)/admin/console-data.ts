import { cache } from "react";
import type { IconName } from "@/components/nav/icons";
import { can, isStaffRole, ROLE_LABEL, sectionsOf, type Section } from "@/lib/roles";
import { getSession, staffGate } from "@/lib/session";

export type NavItem = { href: string; label: string; icon: IconName };

type Entry = NavItem & { section: Section | null };

// After Church's shell: the sections people use all day sit in the top pill, the rest in the icon rail. A role sees only
// what it may open. A null section is open to every staff member.
const TOP: Entry[] = [
  { href: "/admin", label: "Dashboard", icon: "dashboard", section: "overview" },
  { href: "/admin/docket", label: "Docket", icon: "docket", section: "docket" },
  { href: "/admin/queue", label: "Review queue", icon: "queue", section: "queue" },
  { href: "/admin/leads", label: "Sales leads", icon: "leads", section: "leads" },
  { href: "/admin/support", label: "Support", icon: "support", section: "support" },
  { href: "/admin/clients", label: "Clients", icon: "users", section: "users" },
  { href: "/admin/listings", label: "Properties", icon: "home", section: "listings" },
];

const RAIL: Entry[][] = [
  [
    { href: "/admin/projects", label: "Projects", icon: "projects", section: "projects" },
    { href: "/admin/plans", label: "Plans", icon: "plans", section: "plans" },
    { href: "/admin/pages", label: "Blog and areas", icon: "pages", section: "pages" },
    { href: "/admin/import", label: "Import", icon: "import", section: "import" },
  ],
  [
    { href: "/admin/staff", label: "Staff", icon: "staff", section: "staff" },
    { href: "/admin/security", label: "Security", icon: "security", section: null },
  ],
];

/** The phone's tab bar holds five; anything past that moves into the account menu, as the rail does. */
const TABS = 5;

/**
 * What the console's chrome needs, read once per request. Before the authenticator is passed (setting one up, entering a
 * code) only the account menu shows, so `ready` is false and the navigation is empty.
 */
export const consoleNav = cache(async () => {
  const session = await getSession();
  const role = session?.user.role;
  if (!session || !isStaffRole(role)) return null;
  const ready = (await staffGate(sectionsOf(role)[0])).gate === "ok";
  const open = (e: Entry): NavItem[] => (!e.section || can(role, e.section) ? [{ href: e.href, label: e.label, icon: e.icon }] : []);
  const top = ready ? TOP.flatMap(open) : [];
  const rail = ready ? RAIL.map((g) => g.flatMap(open)).filter((g) => g.length) : [];
  return {
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
    roleLabel: ROLE_LABEL[role],
    ready,
    top,
    tabs: top.slice(0, TABS),
    // Reachable from the account menu on a phone, where there is no rail.
    tools: [...top.slice(TABS), ...rail.flat()],
    rail,
    canSearchClients: ready && can(role, "users"),
  };
});
