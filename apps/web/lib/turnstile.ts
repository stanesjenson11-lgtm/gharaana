/**
 * Cloudflare Turnstile server-side verification.
 * Validates bot-challenge responses against Cloudflare's siteverify endpoint.
 *
 * In local development and automated testing, verification automatically succeeds
 * if TURNSTILE_SECRET_KEY is omitted, so devs are never blocked without Cloudflare credentials.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(
  token: string | null | undefined,
  ip?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      return { success: true };
    }
    return { success: false, error: "Turnstile secret key is not configured" };
  }

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
