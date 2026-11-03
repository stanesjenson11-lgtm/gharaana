// Sign-in codes by email, sent with Resend (https://resend.com/docs/api-reference/emails/send-email). Server only.
// RESEND_API_KEY, and RESEND_FROM such as "Gharaana <codes@gharaana.in>" once that domain is verified in Resend. Until
// then Resend's shared sender (onboarding@resend.dev) only delivers to the Resend account's own address.
export const emailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendOtpEmail(to: string, code: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || "Gharaana <onboarding@resend.dev>",
      to: [to],
      subject: `${code} is your Gharaana code`,
      text: `Your Gharaana sign-in code is ${code}.\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email.`,
      html: `<p>Your Gharaana sign-in code is</p><p style="font-size:28px;font-weight:600;letter-spacing:4px">${code}</p><p>It works for 10 minutes. If you didn't ask for it, you can ignore this email.</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  // Never log the code or the key; the status and Resend's message are enough to debug.
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
