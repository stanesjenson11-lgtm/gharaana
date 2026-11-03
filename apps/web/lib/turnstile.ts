/**
 * Cloudflare Turnstile server-side verification.
 * Validates bot-challenge responses against Cloudflare's siteverify endpoint.
 *
 * Switched off (every check passes) while TURNSTILE_SECRET_KEY is unset: in development, and on the live site until the
 * client's Cloudflare keys exist. The per-IP and per-address limits in lib/auth.ts apply either way. Set both keys
 * (this one and NEXT_PUBLIC_TURNSTILE_SITE_KEY for the widget) to turn the bot check back on.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(
  token: string | null | undefined,
  ip?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) return { success: true };

  if (!token || !token.trim()) {
    return { success: false, error: "Turnstile token is required" };
  }

  try {
    const body = new URLSearchParams({
      secret,
      response: token.trim(),
    });
    if (ip) body.append("remoteip", ip);

    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) {
      return { success: false, error: `Verification request failed with status ${res.status}` };
    }

    const outcome = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
      challenge_ts?: string;
      hostname?: string;
    };

    if (!outcome.success) {
      return {
        success: false,
        error: outcome["error-codes"]?.join(", ") || "Bot verification failed",
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Verification request failed",
    };
  }
}
