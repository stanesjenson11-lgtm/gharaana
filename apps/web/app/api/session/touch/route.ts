import { NextResponse } from "next/server";
import { touchSession } from "@/lib/idle-server";
import { getSession } from "@/lib/session";

// "I'm here": the page calls this while someone is active, and when they answer the idle warning with "stay signed in".
// The custom header can't be added by another site's form or image, so this can't be triggered from outside.
export async function POST(request: Request) {
  if (request.headers.get("x-requested-with") !== "dn") return NextResponse.json({ ok: false }, { status: 400 });
  const session = await getSession(); // also drops a session that has already been idle too long
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  await touchSession(session.session.id);
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
