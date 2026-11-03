import type { ReactNode } from "react";

// Signing in and confirming a number: a screen of their own, without the site's header and footer.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="content" tabIndex={-1} className="outline-none">
      {children}
    </main>
  );
}
