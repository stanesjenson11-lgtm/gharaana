import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { NAV_LINKS, RENT_LINK } from "./links";

/**
 * The header as it is before we know who is signed in: the same bar, with the same links, drawn without any hook that
 * needs the URL (those must sit inside Suspense on pages whose address has a variable in it, like /homes/[id]).
 * The real header (site-header.tsx) streams in over it with the current page marked and the account controls added.
 */
export function HeaderShell({ rentals }: { rentals: boolean }) {
  const links = rentals ? [RENT_LINK, ...NAV_LINKS] : NAV_LINKS;
  const touch = "inline-flex h-11 items-center justify-center rounded-full";
  return (
    <header className="sticky top-0 z-30 h-16 bg-canvas">
      <div className="flex h-full items-center gap-3 px-3 text-ink md:px-6">
        <Link href="/" aria-label="Gharaana home" className="flex h-11 shrink-0 items-center rounded-full bg-surface px-4">
          <Logo className="block h-7 w-auto" />
        </Link>
        <div className="hidden min-w-0 flex-1 justify-center md:flex">
          <nav aria-label="Main" className="flex items-center gap-0.5 rounded-full bg-surface p-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="inline-flex h-9 items-center rounded-full px-3.5 text-[15px] font-medium whitespace-nowrap text-muted lg:px-4">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link href="/post" className={`${touch} bg-indigo px-4 text-[15px] font-semibold text-canvas`}>
            <span className="sm:hidden">Post</span>
            <span className="hidden sm:inline">Post your property</span>
          </Link>
          <span aria-hidden="true" className="hidden h-11 w-[5.5rem] md:block" />
        </div>
      </div>
    </header>
  );
}
