import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { MFA_COOKIE } from "@/lib/admin-mfa";
import { logAuditEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/session";

// The page signing someone out: because they asked to ("user"), or because nobody answered the idle warning ("idle").
// The reason is for the audit trail. Signing out is harmless to repeat, so a second tab doing it too does no harm.
export async function POST(request: Request) {
  if (request.headers.get("x-requested-with") !== "dn") return NextResponse.json({ ok: false }, { status: 400 });
  const reason = (await request.json().catch(() => null))?.reason === "idle" ? "idle" : "user";
  const session = await getSession();
  if (session) await logAuditEvent(reason === "idle" ? "AUTH_SESSION_IDLE" : "AUTH_SIGN_OUT", { userId: session.user.id, details: reason === "idle" ? { by: "browser" } : null });
  await auth.api.signOut({ headers: await headers() });
  (await cookies()).delete(MFA_COOKIE);
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
