import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { MFA_COOKIE } from "@/lib/admin-mfa";
import { auth } from "@/lib/auth";
import { homeFor, isStaffRole } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { DAY_COOKIE, dayUser, skipPhoneOtp, startedToday } from "@/lib/staff-day";

// Where a team member's sign-in ends when it has run out: the session began on an earlier day, or today's text-message
// code was never checked in this browser (Google and Apple sign-in don't send one). They are signed out and start again
// from their mobile number. A sign-in that is fine is left alone, so this can't be used to sign anyone out.
export async function GET() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const role = session.user.role;
  if (!isStaffRole(role)) redirect("/");
  const { secret } = await auth.$context;
  const finished = !startedToday(session.session.createdAt) || (!skipPhoneOtp() && dayUser(secret, (await cookies()).get(DAY_COOKIE)?.value) !== session.user.id);
  if (!finished) redirect(homeFor(role));
  await auth.api.signOut({ headers: await headers() });
  (await cookies()).delete(MFA_COOKIE);
  redirect("/sign-in?team=1");
}
