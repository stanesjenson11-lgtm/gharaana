// Who may open what in the staff console. "admin" is the super admin: every section, and the only one who manages
// staff. The other roles see just their own sections. A person's role is read from their user row on every request,
// so changing it takes effect at once.
// ponytail: a fixed map in code. If the super admin ever needs to edit permissions in the UI, move it to a table.
export const STAFF_ROLES = ["admin", "reviewer", "support", "sales"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Super admin",
  reviewer: "Reviewer",
  support: "Support",
  sales: "Sales",
};

export const SECTIONS = ["overview", "docket", "queue", "leads", "support", "users", "listings", "projects", "plans", "pages", "import", "staff"] as const;
export type Section = (typeof SECTIONS)[number];

// "overview" is the dashboard and "docket" the team's work list: every role opens both. The dashboard shows the cards for
// each role's own sections.
const ACCESS: Record<StaffRole, readonly Section[]> = {
  admin: SECTIONS,
  reviewer: ["overview", "docket", "queue", "listings", "projects", "pages"],
  support: ["overview", "docket", "support", "users"],
  sales: ["overview", "docket", "leads", "users"],
};

export const SECTION_LABEL: Record<Section, string> = {
  overview: "Dashboard",
  docket: "Docket",
  queue: "Review queue",
  leads: "Sales leads",
  support: "Support",
  users: "Clients",
  listings: "Properties",
  projects: "Projects",
  plans: "Plans",
  pages: "Blog and areas",
  import: "Import",
  staff: "Staff",
};

export const sectionsOf = (role: StaffRole) => ACCESS[role];

export const isStaffRole = (role: unknown): role is StaffRole => STAFF_ROLES.includes(role as StaffRole);

export const can = (role: unknown, section: Section) => isStaffRole(role) && ACCESS[role].includes(section);

/** Where each role lands in the console: its dashboard. */
const HOME: Record<StaffRole, string> = { admin: "/admin", reviewer: "/admin", support: "/admin", sales: "/admin" };
export const homeFor = (role: StaffRole) => HOME[role];

// Who may hand work to whom (the docket). Everyone can keep an item or give it to a colleague in their own role. Across
// roles, work moves the way it does in practice: a listing problem from support to a reviewer, a warm client from support
// to sales, a client who needs help from sales back to support. The super admin can hand work to anyone.
const HAND_OFF: Record<StaffRole, readonly StaffRole[]> = {
  admin: STAFF_ROLES,
  reviewer: ["reviewer", "support"],
  support: ["support", "reviewer", "sales"],
  sales: ["sales", "support"],
};
export const canHandOff = (from: unknown, to: unknown) => isStaffRole(from) && isStaffRole(to) && HAND_OFF[from].includes(to);
export const handOffTargets = (from: StaffRole) => HAND_OFF[from];

// The first part of each console URL and the section that guards it. proxy.ts reads this to turn away everyone else
// before a page or route runs. "any" is for staff with any role (setting up and passing the authenticator). A console
// URL missing here is for the super admin only, so a new page can never be opened to every role by forgetting this list.
const PAGE_ROUTES: Record<string, Section | "any"> = {
  queue: "queue",
  leads: "leads",
  support: "support",
  clients: "users",
  users: "users",
  listings: "listings",
  projects: "projects",
  plans: "plans",
  pages: "pages",
  import: "import",
  staff: "staff",
  docket: "docket",
  verify: "any",
  security: "any",
};
const API_ROUTES: Record<string, Section> = { proof: "queue", photo: "listings" };

/** What a URL needs: a section, "any" staff, "admin" (unlisted console URLs), or null when it isn't a console URL. */
export function consoleNeeds(pathname: string): Section | "any" | "admin" | null {
  const [root, first, second] = pathname.split("/").filter(Boolean);
  if (root === "admin") return first === undefined ? "overview" : (PAGE_ROUTES[first] ?? "admin");
  if (root === "api" && first === "admin") return second === undefined ? "admin" : (API_ROUTES[second] ?? "admin");
  return null;
}

export const meetsNeed = (role: unknown, need: Section | "any" | "admin") => (need === "any" ? isStaffRole(role) : need === "admin" ? role === "admin" : can(role, need));

export const CONSOLE_PAGE_ROUTES = Object.keys(PAGE_ROUTES);
