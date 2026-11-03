import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/nav/avatar";
import { CLIENT_FILTERS, clientFilterCounts, isClientFilter, listClients, PAGE_SIZE, type ClientFilter } from "@/lib/clients";
import { phone } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

// Neutral title: the static shell is served to everyone, and the page shouldn't advertise itself.
export const metadata: Metadata = { title: "Gharaana", robots: { index: false } };

export default function ClientsPage({ searchParams }: PageProps<"/admin/clients">) {
  return (
    <main className="pt-4 pb-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[22px] bg-surface" />}>
        <Clients searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const joined = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const href = (q: string, filter: ClientFilter, page = 1) => {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (filter !== "all") p.set("filter", filter);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return `/admin/clients${s ? `?${s}` : ""}`;
};

async function Clients({ searchParams }: Pick<PageProps<"/admin/clients">, "searchParams">) {
  await requireAdmin("users");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const filter: ClientFilter = isClientFilter(sp.filter) ? sp.filter : "all";
  const page = Number(typeof sp.page === "string" ? sp.page : 1) || 1;
  const [list, counts] = await Promise.all([listClients({ q, filter, page }), clientFilterCounts()]);
  const from = list.total === 0 ? 0 : (list.page - 1) * PAGE_SIZE + 1;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className="text-[2rem] leading-[1.1] font-medium tracking-[-0.03em] md:text-[2.75rem]">Clients</h1>
          <p className="mt-1 text-muted">Everyone with an account: what they listed, asked for and wrote in about. Newest first.</p>
        </div>
        <form role="search" action="/admin/clients" className="flex gap-2">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <label htmlFor="client-q" className="sr-only">
            Search clients by name or phone number
          </label>
          <input
            id="client-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name, phone or email"
            className="h-11 w-64 rounded-full bg-surface px-5 text-[15px] focus-visible:outline-2 focus-visible:outline-indigo"
          />
          <button className="h-11 cursor-pointer rounded-full bg-indigo px-6 font-semibold text-canvas hover:bg-indigo-deep">Search</button>
        </form>
      </div>

      <nav aria-label="Filter clients" className="mt-6 flex flex-wrap gap-2">
        {CLIENT_FILTERS.map(([key, label]) => (
          <Link
            key={key}
            href={href(q, key)}
            aria-current={filter === key ? "page" : undefined}
            className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[15px] font-medium ${filter === key ? "bg-ink text-canvas" : "bg-surface text-muted hover:text-ink"}`}
          >
            {label}
            <span className="tabular-nums opacity-70">{counts[key]}</span>
          </Link>
        ))}
      </nav>

      <section className="mt-5 rounded-[22px] bg-surface p-2">
        {list.rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-muted">{q || filter !== "all" ? "No clients match that." : "No clients yet."}</p>
        ) : (
          <table className="w-full text-left text-[15px]">
            <caption className="sr-only">Clients, newest first</caption>
            <thead>
              <tr className="text-[13px] text-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  Client
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                  Joined
                </th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                  Homes
                </th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                  Requests
                </th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium lg:table-cell">
                  Support
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  <span className="sr-only">Status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((c) => (
                <tr key={c.id} className="hover:bg-canvas [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl">
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/clients/${c.id}`} className="flex items-center gap-3 rounded-xl">
                      <Avatar name={c.name} image={c.image} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.name || "No name"}</span>
                        <span className="block truncate text-[14px] text-muted tabular-nums">{c.phone ? phone(c.phone) : c.email.endsWith(".invalid") ? "No phone yet" : c.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2.5 text-muted md:table-cell">{joined(c.createdAt)}</td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{c.homes}</td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{c.requests}</td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums lg:table-cell">
                    {c.tickets}
                    {c.openTickets > 0 && <span className="ml-1.5 rounded-full bg-indigo px-1.5 py-0.5 text-[12px] font-semibold text-canvas">{c.openTickets} open</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">{c.banned && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[12px] font-semibold text-danger">Suspended</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {list.total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[14px] text-muted">
          <p className="tabular-nums">
            {from}–{Math.min(list.page * PAGE_SIZE, list.total)} of {list.total}
          </p>
          <div className="flex gap-2">
            {list.page > 1 && (
              <Link href={href(q, filter, list.page - 1)} className="inline-flex h-10 items-center rounded-full border border-hairline px-5 font-semibold text-ink hover:border-muted">
                Previous
              </Link>
            )}
            {list.page < list.pages && (
              <Link href={href(q, filter, list.page + 1)} className="inline-flex h-10 items-center rounded-full border border-hairline px-5 font-semibold text-ink hover:border-muted">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
