import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { homeFor, isStaffRole } from "@/lib/roles";
import { getSession, safeNext } from "@/lib/session";
import { DAY_COOKIE, dayUser, skipPhoneOtp, startedToday } from "@/lib/staff-day";
import { claimInvite } from "@/lib/staff";

// The one place every sign-in ends up, whether by mobile number, Google or Apple. The account decides the door:
// team members land in the console, everyone else goes where they were headed. Everyone has confirmed a mobile number
// by a text-message code first: it is what owners and buyers rely on, and for staff it opens each day.
export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);

  // A role reserved for this email (Staff page) is handed over here, on the first sign-in with a verified address.
  const role = (await claimInvite(session.user)) ?? session.user.role;
  if (!session.user.phoneNumberVerified) redirect(`/verify-phone?next=${encodeURIComponent(next)}`);

  if (isStaffRole(role)) {
    // Staff need today's text-message code, checked in this browser (lib/staff-day.ts); anything else starts again at /new-day.
    const { secret } = await auth.$context;
    if (!startedToday(session.session.createdAt) || (!skipPhoneOtp() && dayUser(secret, (await cookies()).get(DAY_COOKIE)?.value) !== session.user.id)) redirect("/new-day");
    redirect(next.startsWith("/admin") ? next : homeFor(role));
  }
  redirect(next);
}
