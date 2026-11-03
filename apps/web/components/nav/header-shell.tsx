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
    <header className="sticky top-0 z-30 h-16 border-b border-hairline bg-canvas">
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-2 px-4 text-ink sm:px-6">
        <Link href="/" aria-label="Gharaana home" className="shrink-0 rounded-full">
          <Logo className="block h-8 w-auto" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`${touch} px-3.5 text-[15px] font-medium text-muted`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-1.5">
          <Link href="/post" className={`${touch} px-4 text-[15px] font-semibold border border-indigo text-indigo`}>
            <span className="sm:hidden">Post</span>
            <span className="hidden sm:inline">Post your property</span>
          </Link>
          <span aria-hidden="true" className="hidden h-11 w-[5.5rem] md:block" />
        </div>
      </div>
    </header>
  );
}
