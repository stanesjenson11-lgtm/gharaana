import type { ReactNode, SVGProps } from "react";

// Small outline icons for navigation, all drawn on a 24px grid. Decorative: the label next to each one carries the meaning.
type P = SVGProps<SVGSVGElement>;
const icon = (paths: ReactNode) =>
  function Icon(p: P) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
        {paths}
      </svg>
    );
  };

export const ICONS = {
  bell: icon(<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" />),
  message: icon(<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-3.6A8 8 0 1 1 20 12Z" />),
  user: icon(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>,
  ),
  heart: icon(<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />),
  help: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 17h.01" />
    </>,
  ),
  console: icon(
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M3 9h18M8 14h3" />
    </>,
  ),
  search: icon(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>,
  ),
  signout: icon(<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H9" />),
  close: icon(<path d="M6 6l12 12M18 6 6 18" />),
  menu: icon(<path d="M4 8h16M4 16h16" />),
  chevron: icon(<path d="m9 6 6 6-6 6" />),
  // Staff console
  docket: icon(<path d="M9 6.5h11M9 12h11M9 17.5h11M3.8 6.5l1.2 1.2 2.2-2.4M3.8 12l1.2 1.2 2.2-2.4M3.8 17.5l1.2 1.2 2.2-2.4" />),
  queue: icon(
    <>
      <rect x="5" y="4" width="14" height="17" rx="2.5" />
      <path d="M9 4.5h6M9 12l2 2 4-4" />
    </>,
  ),
  leads: icon(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.2a5.5 5.5 0 0 1 2.5 4.8" />
    </>,
  ),
  support: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="m5.6 5.6 3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" />
    </>,
  ),
  users: icon(
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>,
  ),
  projects: icon(
    <>
      <path d="M4 21V6l8-3 8 3v15M2 21h20" />
      <path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01M10.5 21v-3.5h3V21" />
    </>,
  ),
  plans: icon(
    <>
      <path d="M3 12V4h8l10 10-8 8Z" />
      <circle cx="7.5" cy="8.5" r="1.2" />
    </>,
  ),
  pages: icon(
    <>
      <path d="M6 3h8l4 4v14H6Z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </>,
  ),
  import: icon(<path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />),
  staff: icon(
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16a3.5 3.5 0 0 1 6 0M14.5 10h3M14.5 13h3" />
    </>,
  ),
  security: icon(
    <>
      <path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6Z" />
      <path d="m9 12 2 2 4-4" />
    </>,
  ),
  more: icon(<path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />),
  dashboard: icon(
    <>
      <rect x="3.5" y="3.5" width="7" height="8" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="2" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="2" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="2" />
    </>,
  ),
  arrow: icon(<path d="M7 17 17 7M8 7h9v9" />),
  home: icon(<path d="M3 11 12 4l9 7M5.5 9.5V20h13V9.5M10 20v-5h4v5" />),
  chart: icon(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />),
  clock: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  ),
} satisfies Record<string, (p: P) => ReactNode>;

export type IconName = keyof typeof ICONS;
