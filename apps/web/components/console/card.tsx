import Link from "next/link";
import type { ReactNode } from "react";
import { ICONS, type IconName } from "@/components/nav/icons";

// The pieces every dashboard card is made of, after the Church CRM dashboard: a round icon tile, a title over a quiet
// subtitle, and a round arrow to the full page. Flat surfaces on white, as DESIGN.md asks.

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-[22px] bg-surface p-5 ${className}`}>{children}</section>;
}

const tile = "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas text-ink";

export function CardHead({ icon, title, description, href, children }: { icon?: IconName; title: string; description?: ReactNode; href?: string; children?: ReactNode }) {
  const Icon = icon && ICONS[icon];
  return (
    <header className="flex flex-wrap items-center gap-3">
      {Icon && (
        <span aria-hidden="true" className={tile}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-[1.0625rem] leading-tight font-semibold">{title}</h2>
        {description && <p className="text-[14px] text-muted">{description}</p>}
      </div>
      {children}
      {href && (
        <Link href={href} aria-label={`Open ${title}`} className={`${tile} hover:bg-ink hover:text-canvas`}>
          <ICONS.arrow className="h-[18px] w-[18px]" />
        </Link>
      )}
    </header>
  );
}

/** "+12%" in indigo when up, a quiet "−5%" when down, nothing when there is nothing to compare with. */
export function Delta({ pct, suffix = "%" }: { pct: number | null; suffix?: string }) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${up ? "bg-indigo text-canvas" : "bg-ink/10 text-muted"}`}>
      <span className="sr-only">{up ? "Up " : "Down "}</span>
      {up ? "+" : "−"}
      {Math.abs(pct)}
      {suffix}
    </span>
  );
}

/** One big figure with its label. */
export function Figure({ value, label, children }: { value: number | string; label: string; children?: ReactNode }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <span className="text-[2.5rem] leading-none font-medium tracking-[-0.03em] tabular-nums">{value}</span>
      <span className="text-[15px] text-muted">{label}</span>
      {children}
    </p>
  );
}
