import { Suspense, type ReactNode } from "react";
import { IdleGuard } from "@/components/auth/idle-guard";
import { CommandPalette, Logo, PillNav, Rail, TabBar, UserMenu } from "./console-chrome";
import { consoleNav } from "./console-data";

/**
 * The staff console's frame, after the Church CRM's shell. The frame is static and each piece of chrome streams in on its
 * own, so nothing here blocks the page. Presentation only: every page and action still runs its own requireAdmin(section).
 */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-[15px] focus:font-semibold focus:text-canvas"
      >
        Skip to content
      </a>
      <Suspense fallback={<div className="h-[4.25rem]" />}>
        <Header />
      </Suspense>
      <div className="flex flex-1 gap-5 px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] md:px-6 md:pb-8">
        <Suspense fallback={<div aria-hidden="true" className="hidden w-14 shrink-0 md:block" />}>
          <Sidebar />
        </Suspense>
        <div id="content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </div>
      </div>
      <Suspense fallback={null}>
        <Tabs />
      </Suspense>
    </div>
  );
}

async function Header() {
  const nav = await consoleNav();
  if (!nav) return null; // not staff: the pages answer with a plain 404
  return (
    <>
      <IdleGuard />
      <header className="sticky top-0 z-40 bg-canvas px-3 pt-3 pb-2 md:px-6">
        <div className="flex h-12 items-center gap-3">
          <Logo />
          <div className="hidden min-w-0 flex-1 justify-center md:flex">
            <PillNav items={nav.top} />
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {nav.ready && <CommandPalette pages={[...nav.top, ...nav.rail.flat()]} clients={nav.canSearchClients} />}
            <UserMenu name={nav.name} email={nav.email} image={nav.image} roleLabel={nav.roleLabel} tools={nav.tools} />
          </div>
        </div>
      </header>
    </>
  );
}

async function Sidebar() {
  const nav = await consoleNav();
  return nav && nav.rail.length > 0 ? <Rail groups={nav.rail} /> : null;
}

async function Tabs() {
  const nav = await consoleNav();
  return nav && nav.tabs.length > 0 ? <TabBar items={nav.tabs} /> : null;
}
