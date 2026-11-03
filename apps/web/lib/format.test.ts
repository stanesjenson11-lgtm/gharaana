// Run: pnpm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { youtubeId } from "./format.ts";

test("YouTube links of every common shape give the video id; anything else gives null", () => {
  for (const link of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  ])
    assert.equal(youtubeId(link), "dQw4w9WgXcQ", link);
  for (const link of ["https://vimeo.com/123", "https://evil.example/watch?v=dQw4w9WgXcQ", "https://youtu.be/short", "not a link", ""]) assert.equal(youtubeId(link), null, link);
});
