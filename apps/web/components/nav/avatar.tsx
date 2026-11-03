"use client";

import { useState } from "react";
import { ICONS } from "./icons";

/** "Stanes Jenson" → "SJ". One name gives one letter; no name at all gives null. */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

const SIZE = { md: "h-9 w-9 text-[14px]", lg: "h-12 w-12 text-[17px]" } as const;

/**
 * A round profile picture: their photo when they have one (Google gives us it), otherwise their first and last initials.
 * A photo that fails to load falls back to the initials rather than a broken image.
 */
export function Avatar({ name, image, size = "md", className = "" }: { name: string; image?: string | null; size?: keyof typeof SIZE; className?: string }) {
  const [broken, setBroken] = useState(false);
  const letters = initials(name);
  return (
    <span aria-hidden="true" className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-indigo font-semibold text-canvas ${SIZE[size]} ${className}`}>
      {image && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small provider-hosted photo; next/image would need every host allow-listed
        <img src={image} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : letters ? (
        letters
      ) : (
        <ICONS.user className="h-5 w-5" />
      )}
    </span>
  );
}
