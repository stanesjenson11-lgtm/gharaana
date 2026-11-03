import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { consoleNeeds, homeFor, isStaffRole, meetsNeed } from "@/lib/roles";

// The door to the site. Two rules, both checked before any page or route runs:
//   1. Everyone signed in has confirmed a mobile number by a text-message code. Until they have (Google and Apple sign-in
//      don't send one), the only page they can open is the one that confirms it.
//   2. The staff console (/admin, /api/admin) opens only for a role that the URL's section allows (lib/roles.ts decides).
//      A console URL nobody listed is for the super admin only, so a forgotten page is closed, not open.
// It checks the role, not the authenticator: console pages and routes still call requireAdmin / staffGate, which also
// check the authenticator, so removing this file would not open anything.
const NO_PHONE_NEEDED = ["/verify-phone", "/sign-in", "/after-sign-in", "/new-day"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const need = consoleNeeds(pathname);

  // Visitors with no session have nothing to check, unless it is the console.
  if (need === null && (!getSessionCookie(request) || NO_PHONE_NEEDED.some((p) => pathname === p || pathname.startsWith(`${p}/`)))) return NextResponse.next();

  const session = await auth.api.getSession({ headers: request.headers });
  const isPage = request.method === "GET" && !pathname.startsWith("/api/");

  if (session && !session.user.phoneNumberVerified) {
    return isPage ? NextResponse.redirect(new URL(`/verify-phone?next=${encodeURIComponent(pathname + search)}`, request.url)) : new NextResponse("Confirm your mobile number first.", { status: 403 });
  }
  if (need === null) return NextResponse.next();

  const role = session?.user.role;
  // Not on the team: the console doesn't exist, as far as they can tell.
  if (!isStaffRole(role)) return new NextResponse("Not found", { status: 404 });
  // On the team but not for this section: back to their dashboard (pages) or a refusal (routes and actions).
  if (!meetsNeed(role, need)) return isPage ? NextResponse.redirect(new URL(homeFor(role), request.url)) : new NextResponse("Forbidden", { status: 403 });
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/((?!api/|_next/|media/|.*\\..*).*)", "/api/admin/:path*"] };
