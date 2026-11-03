import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { verifyTurnstileToken } from "@/lib/turnstile";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;

export const POST = async (req: Request) => {
  const url = new URL(req.url);

  // Cloudflare Turnstile bot defense: verify token before issuing SMS OTP codes
  if (url.pathname.endsWith("/phone-number/send-otp")) {
    const token = req.headers.get("x-turnstile-token");
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for");
    const check = await verifyTurnstileToken(token, ip);

    if (!check.success) {
      return Response.json(
        {
          code: "BOT_DETECTED",
          message: check.error || "Bot verification failed. Please try again.",
        },
        { status: 403 },
      );
    }
  }

  return handler.POST(req);
};
