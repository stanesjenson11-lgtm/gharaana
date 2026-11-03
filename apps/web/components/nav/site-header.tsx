"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { signOutAndReload } from "@/lib/sign-out";
import { Avatar } from "./avatar";
import { ICONS } from "./icons";
import { NAV_LINKS, RENT_LINK } from "./links";

export type AlertItem = { id: number; text: string; href: string; unread: boolean; when: string };
export type ChatItem = { id: number; title: string; who: string; last: string | null; unread: number; when: string };

/** What the header needs to know about the signed-in person. `undefined` = still loading, `null` = signed out. */
export type Member = {
  name: string;
  image: string | null;
  alerts: number; // unread notifications
  unread: number; // unread chat messages
  alertItems: AlertItem[];
  chatItems: ChatItem[];
  console: { href: string; label: string } | null; // staff only
};

const active = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/**
 * The site navigation: a solid white 64px bar that stays in the page, because search and chat size against it.
 * The inbox and account menus are native popovers and the phone menu a native modal dialog, so Escape, focus and
 * "everything behind is inert" come from the browser instead of from us.
 */
export function SiteHeader({ member, rentals = false }: { member?: Member | null; rentals?: boolean }) {
  const path = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);

  // Following a link closes whatever was open: the phone menu and both popovers.
  useEffect(() => {
    sheet.current?.close();
    document.getElementById("account-menu")?.hidePopover?.();
    document.getElementById("inbox-menu")?.hidePopover?.();
  }, [path]);

  const next = path === "/sign-in" || path === "/verify-phone" ? "/" : path;
  const links = rentals ? [RENT_LINK, ...NAV_LINKS] : NAV_LINKS;

  const tone = "text-muted hover:text-ink";
  const here = "text-ink";
  const touch = "inline-flex h-11 items-center justify-center rounded-full transition-colors duration-150";
  const total = member ? member.alerts + member.unread : 0;

  const signOut = async () => {
    document.getElementById("account-menu")?.hidePopover?.();
    sheet.current?.close();
    await signOutAndReload("user");
  };

  return (
    <>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-[15px] focus:font-semibold focus:text-canvas"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 h-16 border-b border-hairline bg-canvas">
        <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-2 px-4 text-ink sm:px-6">
          <Link href="/" aria-label="Gharaana home" className="shrink-0 rounded-full">
            <Logo className="block h-8 w-auto" />
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {links.map((l) => {
              const current = active(path, l.href.split("?")[0]) && !l.href.includes("?");
              return (
                <Link key={l.href} href={l.href} aria-current={current ? "page" : undefined} className={`${touch} px-3.5 text-[15px] font-medium ${current ? `${here} font-semibold` : tone}`}>
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1 sm:gap-1.5">
            <Link
              href="/post"
              className={`${touch} px-4 text-[15px] font-semibold border border-indigo text-indigo hover:bg-indigo hover:text-canvas`}
            >
              <span className="sm:hidden">Post</span>
              <span className="hidden sm:inline">Post your property</span>
            </Link>

            {member === undefined && <span aria-hidden="true" className="hidden h-11 w-[5.5rem] md:block" />}

            {member === null && (
              <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className={`${touch} hidden px-3.5 text-[15px] font-medium md:inline-flex ${tone}`}>
                Sign in
              </Link>
            )}

            {member && (
              <>
                <button
                  type="button"
                  popoverTarget="inbox-menu"
                  aria-label={total ? `Alerts and messages, ${total} new` : "Alerts and messages"}
                  style={{ anchorName: "--inbox-menu" } as CSSProperties}
                  className={`${touch} relative hidden w-11 md:inline-flex ${tone}`}
                >
                  <ICONS.bell className="h-[22px] w-[22px]" />
                  {total > 0 && (
                    <span aria-hidden="true" className="absolute top-1 right-0.5 min-w-4 rounded-full bg-indigo px-1 text-center text-[11px] leading-4 font-semibold text-canvas tabular-nums">
                      {total > 9 ? "9+" : total}
                    </span>
                  )}
                </button>
                <div id="inbox-menu" popover="auto" className="menu-pop menu-pop-wide" style={{ positionAnchor: "--inbox-menu" } as CSSProperties}>
                  <Inbox member={member} />
                </div>

                <button
                  type="button"
                  popoverTarget="account-menu"
                  aria-label="Account menu"
                  style={{ anchorName: "--account-menu" } as CSSProperties}
                  className={`${touch} hidden w-11 md:inline-flex`}
                >
                  <Avatar name={member.name} image={member.image} className="ring-1 ring-hairline" />
                </button>
                <div id="account-menu" popover="auto" className="menu-pop" style={{ positionAnchor: "--account-menu" } as CSSProperties}>
                  <p className="px-3 pt-2 pb-1">
                    <span className="block truncate font-semibold">{member.name || "Your account"}</span>
                    {member.console && <span className="block text-[13px] text-muted">{member.console.label}</span>}
                  </p>
                  <MenuLink href="/account" icon="user">
                    Your account
                  </MenuLink>
                  <MenuLink href="/account#saved-homes" icon="heart">
                    Saved homes
                  </MenuLink>
                  <MenuLink href="/help" icon="help">
                    Help and support
                  </MenuLink>
                  {member.console && (
                    <MenuLink href={member.console.href} icon="console">
                      Staff console
                    </MenuLink>
                  )}
                  <button type="button" onClick={signOut} className="mt-1 flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl border-t border-hairline px-3 text-left text-[15px] font-medium text-muted hover:bg-surface hover:text-ink">
                    <ICONS.signout className="h-5 w-5" />
                    Sign out
                  </button>
                </div>
              </>
            )}

            <button type="button" aria-haspopup="dialog" aria-controls="site-menu" onClick={() => sheet.current?.showModal()} className={`${touch} relative w-11 md:hidden ${tone}`}>
              <span className="sr-only">{total ? `Open menu, ${total} new` : "Open menu"}</span>
              <ICONS.menu className="h-6 w-6" />
              {total > 0 && <span aria-hidden="true" className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-indigo ring-2 ring-canvas" />}
            </button>
          </div>
        </div>
      </header>

      <dialog ref={sheet} id="site-menu" aria-label="Menu" className="sheet" onClick={(e) => e.target === sheet.current && sheet.current?.close()}>
        <div data-lenis-prevent className="mx-auto flex h-full max-w-xl flex-col overflow-y-auto px-5 pb-10">
          <div className="flex h-16 shrink-0 items-center justify-between">
            <Logo className="block h-8 w-auto" />
            <button type="button" onClick={() => sheet.current?.close()} className="-mr-2 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full hover:bg-surface">
              <span className="sr-only">Close menu</span>
              <ICONS.close className="h-6 w-6" />
            </button>
          </div>

          {member && (
            <p className="mt-2 flex items-center gap-3">
              <Avatar name={member.name} image={member.image} size="lg" />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{member.name || "Your account"}</span>
                {member.console && <span className="block text-[14px] text-muted">{member.console.label}</span>}
              </span>
            </p>
          )}

          <nav aria-label="Main" className="mt-4 flex flex-col">
            {links.map((l) => (
              <SheetLink key={l.href} href={l.href} current={active(path, l.href.split("?")[0]) && !l.href.includes("?")}>
                {l.label}
              </SheetLink>
            ))}
          </nav>

          <nav aria-label="Account" className="mt-8 flex flex-col">
            {member === null && <SheetLink href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in</SheetLink>}
            {member && (
              <>
                <SheetLink href="/notifications" current={active(path, "/notifications")} count={member.alerts} noun="new">
                  Alerts
                </SheetLink>
                <SheetLink href="/messages" current={active(path, "/messages")} count={member.unread} noun="unread">
                  Messages
                </SheetLink>
                <SheetLink href="/account" current={path === "/account"}>
                  Your account
                </SheetLink>
                {member.console && <SheetLink href={member.console.href}>Staff console</SheetLink>}
                <button type="button" onClick={signOut} className="flex h-14 w-full cursor-pointer items-center border-b border-hairline text-left text-[1.25rem] font-medium text-muted hover:text-ink">
                  Sign out
                </button>
              </>
            )}
          </nav>

          <Link href="/post" className="mt-8 inline-flex h-14 items-center justify-center rounded-full bg-indigo text-[1.0625rem] font-semibold text-canvas transition-colors hover:bg-indigo-deep">
            Post your property
          </Link>
        </div>
      </dialog>
    </>
  );
}

/** One panel for everything waiting on you: alerts and chat messages, a tab each. */
function Inbox({ member }: { member: Member }) {
  const [tab, setTab] = useState<"alerts" | "messages">(member.alerts === 0 && member.unread > 0 ? "messages" : "alerts");
  const tabs = [
    { id: "alerts", label: "Alerts", count: member.alerts },
    { id: "messages", label: "Messages", count: member.unread },
  ] as const;
  const move = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setTab((t) => (t === "alerts" ? "messages" : "alerts"));
    }
  };

  return (
    <div>
      <div role="tablist" aria-label="Inbox" onKeyDown={move} className="flex gap-1 border-b border-hairline px-1 pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`inbox-tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`inbox-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={`flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl text-[15px] font-medium ${tab === t.id ? "bg-surface text-ink" : "text-muted hover:text-ink"}`}
          >
            {t.label}
            <Badge count={t.count} noun="new" />
          </button>
        ))}
      </div>

      <div id="inbox-panel-alerts" role="tabpanel" aria-labelledby="inbox-tab-alerts" hidden={tab !== "alerts"} className="pt-1">
        {member.alertItems.length === 0 ? (
          <p className="px-3 py-6 text-[14px] text-muted">Nothing yet. You&rsquo;ll hear here when an owner answers you or a new home matches a saved search.</p>
        ) : (
          <ul>
            {member.alertItems.map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 hover:bg-surface">
                  <span aria-hidden="true" className={`mt-2 h-2 w-2 shrink-0 rounded-full ${a.unread ? "bg-indigo" : "bg-transparent"}`} />
                  <span className="min-w-0 text-[14px]">
                    <span className={`block ${a.unread ? "font-medium" : "text-muted"}`}>
                      {a.unread && <span className="sr-only">New: </span>}
                      {a.text}
                    </span>
                    <span className="block text-[13px] text-muted">{a.when}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/notifications" className="mt-1 flex h-11 items-center rounded-xl border-t border-hairline px-3 text-[14px] font-medium text-indigo hover:bg-surface">
          See all alerts
        </Link>
      </div>

      <div id="inbox-panel-messages" role="tabpanel" aria-labelledby="inbox-tab-messages" hidden={tab !== "messages"} className="pt-1">
        {member.chatItems.length === 0 ? (
          <p className="px-3 py-6 text-[14px] text-muted">No conversations yet. Message an owner from any home&rsquo;s page.</p>
        ) : (
          <ul>
            {member.chatItems.map((c) => (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 hover:bg-surface">
                  <span aria-hidden="true" className={`mt-2 h-2 w-2 shrink-0 rounded-full ${c.unread ? "bg-indigo" : "bg-transparent"}`} />
                  <span className="min-w-0 flex-1 text-[14px]">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate ${c.unread ? "font-semibold" : "font-medium"}`}>{c.who}</span>
                      <span className="shrink-0 text-[13px] text-muted">{c.when}</span>
                    </span>
                    <span className="block truncate text-muted">{c.title}</span>
                    {c.last && <span className={`block truncate ${c.unread ? "text-ink" : "text-muted"}`}>{c.last}</span>}
                  </span>
                  <Badge count={c.unread} noun="unread" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/messages" className="mt-1 flex h-11 items-center rounded-xl border-t border-hairline px-3 text-[14px] font-medium text-indigo hover:bg-surface">
          Open all messages
        </Link>
      </div>
    </div>
  );
}

function Badge({ count, noun }: { count: number; noun: string }) {
  if (!count) return null;
  return (
    <span className="rounded-full bg-indigo px-1.5 text-center text-[12px] leading-5 font-semibold text-canvas tabular-nums">
      {count > 9 ? "9+" : count}
      <span className="sr-only"> {noun}</span>
    </span>
  );
}

function MenuLink({ href, icon, children }: { href: string; icon: keyof typeof ICONS; children: ReactNode }) {
  const Icon = ICONS[icon];
  return (
    <Link href={href} className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium hover:bg-surface">
      <Icon className="h-5 w-5 text-muted" />
      {children}
    </Link>
  );
}

function SheetLink({ href, current, count = 0, noun = "", children }: { href: string; current?: boolean; count?: number; noun?: string; children: ReactNode }) {
  return (
    <Link href={href} aria-current={current ? "page" : undefined} className={`flex h-14 items-center justify-between border-b border-hairline text-[1.25rem] ${current ? "font-semibold text-ink" : "font-medium text-muted"} hover:text-ink`}>
      {children}
      <Badge count={count} noun={noun} />
    </Link>
  );
}
