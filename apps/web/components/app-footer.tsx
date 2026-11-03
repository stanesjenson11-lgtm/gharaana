import Link from "next/link";
import { phone } from "@/lib/format";

// Product pages' footer: where to get help. The support number comes from SUPPORT_PHONE once the client has one.
export function AppFooter() {
  const support = process.env.SUPPORT_PHONE;
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-[14px] text-muted sm:px-6">
        <Link href="/help" className="font-medium text-ink hover:underline">
          Help and support
        </Link>
        <Link href="/plans" className="hover:text-ink hover:underline">
          Plans for owners
        </Link>
        <Link href="/projects" className="hover:text-ink hover:underline">
          New projects
        </Link>
        <Link href="/areas" className="hover:text-ink hover:underline">
          Area guides
        </Link>
        <Link href="/blog" className="hover:text-ink hover:underline">
          Blog
        </Link>
        {support && (
          <a href={`tel:${support}`} className="tabular-nums hover:text-ink">
            Call {phone(support)}
          </a>
        )}
        <span>Listings are approved by our team before they go live.</span>
      </div>
    </footer>
  );
}
