import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";

// Free stand-in that ships today. Adobe's Neue Haas Grotesk takes over the moment a kit ID is set
// (see ADOBE_FONTS.md); the stack in globals.css already names the Adobe families first.
const fallback = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-fallback",
  display: "swap",
});

const ADOBE_KIT = process.env.NEXT_PUBLIC_ADOBE_KIT_ID;

export const metadata: Metadata = {
  title: "Gharaana | Step inside your next address",
  description:
    "Gharaana is a real-estate brokerage. Scroll from the skyline into a tower, through a window into a home, across its floor plan and out into the neighbourhood.",
};

export const viewport: Viewport = {
  themeColor: "#1560BD",
  width: "device-width",
  initialScale: 1,
};

// Runs before paint so the motion layout is chosen once, with no flash.
const MOTION_FLAG = `document.documentElement.dataset.motion=matchMedia("(prefers-reduced-motion: reduce)").matches?"off":"on"`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={fallback.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_FLAG }} />
        {ADOBE_KIT ? (
          <>
            <link rel="preconnect" href="https://use.typekit.net" crossOrigin="" />
            <link rel="stylesheet" href={`https://use.typekit.net/${ADOBE_KIT}.css`} />
          </>
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
