"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type CSSProperties, type KeyboardEvent } from "react";
import { Logo as Lockup } from "@/components/brand/Logo";
import { Avatar } from "@/components/nav/avatar";
import { ICONS } from "@/components/nav/icons";
import { signOutAndReload } from "@/lib/sign-out";
import { phone } from "@/lib/format";
import type { NavItem } from "./console-data";
import { searchClients } from "./palette-actions";

// The staff console's chrome, after the Church CRM's shell: a logo pill, a centred pill of sections, a search button and
// an account menu along the top; an icon rail down the left; a tab bar on phones. Flat grey capsules on white, no glass.

/** The console home ("/admin") is a prefix of every other path, so it matches only itself. */
const isHere = (path: string, href: string) => (href === "/admin" ? path === href : path === href || path.startsWith(`${href}/`));

const capsule = "rounded-full bg-surface";

export function Logo() {
  return (
    <Link href="/admin" aria-label="Gharaana console home" className={`flex h-11 shrink-0 items-center px-4 ${capsule}`}>
      <Lockup className="block h-7 w-auto" />
    </Link>
  );
}

/** The centred capsule of sections in the top bar, from a tablet up. */
export function PillNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Sections" className={`hidden items-center gap-0.5 p-1 md:flex ${capsule}`}>
      {items.map((i) => {
        const here = isHere(path, i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={here ? "page" : undefined}
            className={`inline-flex h-9 items-center rounded-full px-3.5 text-[15px] whitespace-nowrap transition-colors lg:px-4 ${here ? "bg-canvas font-semibold text-ink" : "font-medium text-muted hover:text-ink"}`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** A label beside a rail icon on hover or keyboard focus; the icon alone is the touch target. */
function Tip({ children }: { children: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-full z-50 ml-3 rounded-full bg-ink px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-canvas opacity-0 group-hover/rail:opacity-100 group-focus-visible/rail:opacity-100"
    >
      {children}
    </span>
  );
}

/** The icon groups down the left, from a tablet up. The page you are on is the filled one. */
export function Rail({ groups }: { groups: NavItem[][] }) {
  const path = usePathname();
  return (
    <aside aria-label="Tools" className="sticky top-[5.25rem] hidden shrink-0 self-start md:flex md:flex-col md:gap-3">
      {groups.map((items, g) => (
        <div key={g} className={`flex flex-col items-center gap-1 p-1.5 ${capsule}`}>
          {items.map((i) => {
            const Icon = ICONS[i.icon];
            const here = isHere(path, i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-label={i.label}
                aria-current={here ? "page" : undefined}
                className={`group/rail relative grid h-11 w-11 place-items-center rounded-full transition-colors ${here ? "bg-indigo text-canvas" : "text-muted hover:bg-canvas hover:text-ink"}`}
              >
                <Icon className="h-5 w-5" />
                <Tip>{i.label}</Tip>
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

/** The phone's tab bar: the same sections as the pill, under the thumb. */
export function TabBar({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Sections" className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-40 flex rounded-full border border-hairline bg-canvas p-1.5 md:hidden">
      {items.map((i) => {
        const Icon = ICONS[i.icon];
        const here = isHere(path, i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={here ? "page" : undefined}
            className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium ${here ? "bg-surface text-ink" : "text-muted"}`}
          >
            <Icon className="h-5 w-5" />
            <span className="max-w-full truncate px-1">{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** The signed-in person: their photo or initials, and on a phone the tools the rail would hold. */
export function UserMenu({ name, email, image, roleLabel, tools }: { name: string; email: string; image: string | null; roleLabel: string; tools: NavItem[] }) {
  const path = usePathname();
  useEffect(() => document.getElementById("console-user")?.hidePopover?.(), [path]);

  const signOut = async () => {
    document.getElementById("console-user")?.hidePopover?.();
    await signOutAndReload("user");
  };

  const row = "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium hover:bg-surface";
  return (
    <>
      <button type="button" popoverTarget="console-user" aria-label="Account menu" style={{ anchorName: "--console-user" } as CSSProperties} className={`flex h-11 items-center gap-1 p-0.5 md:pr-2.5 ${capsule}`}>
        <Avatar name={name} image={image} />
        <ICONS.chevron className="hidden h-4 w-4 rotate-90 text-muted md:block" />
      </button>
      <div id="console-user" popover="auto" className="menu-pop" style={{ positionAnchor: "--console-user" } as CSSProperties}>
        <p className="flex items-center gap-3 px-3 pt-2 pb-2">
          <Avatar name={name} image={image} size="lg" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{name || "Staff"}</span>
            <span className="block truncate text-[13px] text-muted">{roleLabel}</span>
            <span className="block truncate text-[13px] text-muted">{email.endsWith(".invalid") ? "" : email}</span>
          </span>
        </p>
        {tools.length > 0 && (
          <div className="border-t border-hairline pt-1 md:hidden">
            {tools.map((t) => {
              const Icon = ICONS[t.icon];
              return (
                <Link key={t.href} href={t.href} className={row}>
                  <Icon className="h-5 w-5 text-muted" />
                  {t.label}
                </Link>
              );
            })}
          </div>
        )}
        <div className="mt-1 border-t border-hairline pt-1">
          <Link href="/" className={row}>
            <ICONS.home className="h-5 w-5 text-muted" />
            Back to Gharaana
          </Link>
          <button type="button" onClick={signOut} className={`${row} w-full cursor-pointer text-left text-muted hover:text-ink`}>
            <ICONS.signout className="h-5 w-5" />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}

type Row = { id: string; heading: string; label: string; hint?: string; href: string; icon: NavItem["icon"] };
type Hit = { id: string; name: string; phone: string | null };

/**
 * Ctrl K or ⌘K from anywhere, or the search button: jump to a section, or find a client by name or phone. A native modal
 * dialog, so the page behind is inert, Escape closes it and focus returns to the button.
 */
export function CommandPalette({ pages, clients }: { pages: NavItem[]; clients: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [searching, start] = useTransition();

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const d = dialog.current;
        if (d?.open) d.close();
        else d?.showModal();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const rows: Row[] = [
    ...pages.filter((p) => !q || p.label.toLowerCase().includes(q)).map((p) => ({ id: `go-${p.href}`, heading: "Go to", label: p.label, href: p.href, icon: p.icon })),
    ...hits.map((h) => ({ id: `client-${h.id}`, heading: "Clients", label: h.name || "No name", hint: h.phone ? phone(h.phone) : "", href: `/admin/clients/${h.id}`, icon: "users" as const })),
  ];
  const current = Math.min(active, Math.max(0, rows.length - 1));

  const type = (text: string) => {
    setQuery(text);
    setActive(0);
    clearTimeout(timer.current);
    if (!clients || text.trim().length < 2) return setHits([]);
    // A short pause, so a quick typist sends one search rather than five.
    timer.current = setTimeout(() => start(async () => setHits(await searchClients(text))), 150);
  };
  const go = (r: Row) => {
    dialog.current?.close();
    router.push(r.href);
  };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (rows.length ? (i + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length : 0));
    } else if (e.key === "Enter" && rows[current]) {
      e.preventDefault();
      go(rows[current]);
    }
  };

  return (
    <>
      <button type="button" aria-label="Search" onClick={() => dialog.current?.showModal()} className={`flex h-11 shrink-0 items-center gap-2 px-3.5 text-muted hover:text-ink lg:pr-2.5 ${capsule}`}>
        <ICONS.search className="h-5 w-5 text-ink" />
        <span className="hidden text-[15px] lg:inline">Search</span>
        {/* The server can't know the platform, so the first paint may correct itself. */}
        <kbd suppressHydrationWarning className="hidden h-5 items-center rounded-md bg-canvas px-1.5 font-sans text-[11px] font-medium lg:inline-flex">
          {typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <dialog
        ref={dialog}
        aria-label="Search the console"
        className="palette"
        onClose={() => type("")}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      >
        <div className="flex items-center gap-3 border-b border-hairline px-5">
          <ICONS.search className="h-5 w-5 shrink-0 text-muted" />
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={rows[current]?.id}
            aria-label="Search"
            autoComplete="off"
            value={query}
            onChange={(e) => type(e.target.value)}
            onKeyDown={keys}
            placeholder={clients ? "Search sections and clients…" : "Search sections…"}
            className="h-14 w-full bg-transparent text-[1.0625rem] focus-visible:outline-none"
          />
          {searching && <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-muted border-r-transparent" />}
        </div>
        <div className="max-h-[min(26rem,60dvh)] overflow-y-auto overscroll-contain p-2">
          {rows.length === 0 ? (
            <p className="px-3 py-10 text-center text-[15px] text-muted">{searching ? "Searching…" : `Nothing matches "${query}".`}</p>
          ) : (
            <ul id="palette-list" role="listbox" aria-label="Results">
              {rows.map((r, i) => {
                const Icon = ICONS[r.icon];
                return (
                  <li key={r.id} role="presentation">
                    {r.heading !== rows[i - 1]?.heading && <p className="px-3 pt-2 pb-1 text-[13px] font-semibold text-muted">{r.heading}</p>}
                    <div
                      id={r.id}
                      role="option"
                      aria-selected={i === current}
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(r)}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-[15px] ${i === current ? "bg-surface" : ""}`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      {r.hint && <span className="shrink-0 text-[13px] text-muted tabular-nums">{r.hint}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p aria-hidden="true" className="hidden items-center gap-4 border-t border-hairline px-5 py-2.5 text-[13px] text-muted md:flex">
          <span>↑ ↓ to move</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
        </p>
      </dialog>
    </>
  );
}
