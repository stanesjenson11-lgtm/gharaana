import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";

// The photo from the design. ponytail: served from 21st.dev's CDN; swap in one of the client's own photos before launch.
const HERO = "https://cdn.21st.dev/assets/mirror/ec/ecff1664e7fc3185d0e947571f984ea5fa3de9580fb0e73a03cd9c9b3461cb09.jpg";

// The design shows customer quotes here. Gharaana has no real ones yet and made-up reviews would mislead buyers, so the
// same cards carry what the site promises. Replace with real testimonials when the client has them.
const CARDS = [
  { name: "Owner verified", handle: "Every home", text: "Owners show an electricity bill or property tax receipt before their home goes live." },
  { name: "Checked by our team", handle: "Every listing", text: "A person on our team reviews each home. Brokers don't get through." },
  { name: "No brokerage", handle: "Ever", text: "You deal with the owner directly. Nobody takes a month's rent." },
];

function Card({ card, delay }: { card: (typeof CARDS)[number]; delay: string }) {
  return (
    <div className={`animate-testimonial ${delay} flex w-64 shrink-0 items-start gap-3 rounded-3xl border border-white/10 bg-canvas/40 p-5 backdrop-blur-xl`}>
      <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-ink text-canvas">
        <svg viewBox="0 0 28 28" className="h-5 w-5">
          <path d="M3 13 L14 4 L25 13 M6.5 10.5 V24 H21.5 V10.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="14" cy="15.5" r="2.6" fill="currentColor" />
        </svg>
      </span>
      <div className="text-sm leading-snug">
        <p className="flex items-center gap-1 font-medium text-ink">{card.name}</p>
        <p className="text-muted">{card.handle}</p>
        <p className="mt-1 text-ink/80">{card.text}</p>
      </div>
    </div>
  );
}

/**
 * The sign-in screens' frame, as in the design: the form on the left, a photo with three cards on the right (wide
 * screens only). `inset` is for the staff steps inside the console, which keeps its own slim top bar.
 */
export function AuthShell({ children, inset = false }: { children: ReactNode; inset?: boolean }) {
  return (
    // The design's own typeface (Geist, loaded in app/layout.tsx), for the sign-in screens only; the rest of the site keeps Anek.
    <div className={`[font-family:var(--font-geist),system-ui,sans-serif] flex w-full flex-col bg-canvas text-ink md:flex-row ${inset ? "min-h-[calc(100dvh-5.5rem)]" : "min-h-[100dvh]"}`}>
      {/* Left column: the form */}
      <section className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-6">
            {/* The Gharaana logo, leading back home. The staff steps inside the console
                already have it in the console's top bar. */}
            {!inset && (
              <Link href="/" aria-label="Gharaana home" className="animate-element self-start rounded-full">
                <Logo className="block h-8 w-auto" />
              </Link>
            )}
            {children}
          </div>
        </div>
      </section>

      {/* Right column: photo and cards. Held in view while a long step (the authenticator setup) scrolls beside it. */}
      <section aria-label="Why Gharaana" className={`relative hidden flex-1 overflow-hidden p-4 md:sticky md:block md:self-start ${inset ? "md:top-[4.75rem] md:h-[calc(100dvh-5.5rem)]" : "md:top-0 md:h-[100dvh]"}`}>
        <div className="animate-slide-right animate-delay-300 absolute inset-4 rounded-3xl bg-cover bg-center" style={{ backgroundImage: `url(${HERO})` }} />
        <div className="absolute bottom-8 left-1/2 flex w-full -translate-x-1/2 justify-center gap-4 px-8">
          <Card card={CARDS[0]} delay="animate-delay-1000" />
          <div className="hidden xl:flex">
            <Card card={CARDS[1]} delay="animate-delay-1200" />
          </div>
          {/* The design shows the third card from 1536px; the photo column is only wide enough for it from about 1800px. */}
          <div className="hidden min-[1800px]:flex">
            <Card card={CARDS[2]} delay="animate-delay-1400" />
          </div>
        </div>
      </section>
    </div>
  );
}
