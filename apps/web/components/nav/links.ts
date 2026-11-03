// The site's main links, shared by the header and its loading shell (a server component can't import values from a
// "use client" file, so they live here).
export const NAV_LINKS = [
  { href: "/search", label: "Buy" },
  { href: "/projects", label: "New projects" },
  { href: "/areas", label: "Area guides" },
  { href: "/help", label: "Help" },
] as const;

export const RENT_LINK = { href: "/search?type=rent", label: "Rent" } as const;
