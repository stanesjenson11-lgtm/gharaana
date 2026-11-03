// Sign-in codes by SMS through MSG91. The client's DLT-approved template holds the wording; MSG91 fills its ##OTP## with our code.
// Better Auth makes and checks the code itself, so MSG91 only delivers it.

export const smsConfigured = () => !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID);

export async function sendOtpSms(phone: string, code: string) {
  const url = new URL("https://control.msg91.com/api/v5/otp");
  url.search = new URLSearchParams({ template_id: process.env.MSG91_OTP_TEMPLATE_ID!, mobile: phone.replace(/^\+/, ""), otp: code }).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { authkey: process.env.MSG91_AUTH_KEY!, "content-type": "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as { type?: string; message?: string } | null;
  // Never log the code or the key; the status and MSG91's message are enough to debug.
  if (!res.ok || body?.type !== "success") throw new Error(`MSG91 didn't send the code (${res.status}${body?.message ? `: ${body.message}` : ""})`);
}
