"use client";

import { useEffect, useEffectEvent, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: (error: unknown) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "flexible" | "compact";
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

interface TurnstileProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: (error: unknown) => void;
  className?: string;
}

export function Turnstile({ onVerify, onExpire, onError, className }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  // Effect events read the latest callbacks, so a parent re-render (a keystroke) doesn't rebuild the widget.
  const verified = useEffectEvent((token: string) => onVerify(token));
  const expired = useEffectEvent(() => onExpire?.());
  const failed = useEffectEvent((err: unknown) => onError?.(err));

  useEffect(() => {
    // If no site key is configured, pass dev bypass token automatically so developers are never stuck
    if (!siteKey) {
      verified("dev-turnstile-bypass");
      return;
    }

    let isMounted = true;
    let interval: ReturnType<typeof setInterval> | undefined;

    function renderWidget() {
      if (!isMounted || !containerRef.current || !window.turnstile || !siteKey) return;
      if (widgetIdRef.current) return;

      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => {
            if (isMounted) verified(token);
          },
          "expired-callback": () => {
            if (isMounted) expired();
          },
          "error-callback": (err) => {
            if (isMounted) failed(err);
          },
          theme: "auto",
          size: "normal",
        });
      } catch (e) {
        console.error("[turnstile] render error:", e);
      }
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      const existingScript = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.onload = () => renderWidget();
        document.head.appendChild(script);
      } else {
        interval = setInterval(() => {
          if (window.turnstile) {
            clearInterval(interval);
            renderWidget();
          }
        }, 100);
      }
    }

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;

  return <div ref={containerRef} className={className ?? "my-3 flex justify-center"} />;
}
