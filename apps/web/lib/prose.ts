// The team's plain-text format for blog and area pages: blank lines between paragraphs, "## " for a heading,
// "- " for list items. Rendered as React text, so nothing typed can inject HTML.
// ponytail: no links or bold; add a Markdown library only if the team really needs them.

export type Block = { type: "h2" | "p"; text: string } | { type: "ul"; items: string[] };

export function toBlocks(body: string): Block[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk): Block => {
      if (chunk.startsWith("## ")) return { type: "h2", text: chunk.slice(3).trim() };
      const lines = chunk.split("\n").map((l) => l.trim());
      if (lines.every((l) => l.startsWith("- "))) return { type: "ul", items: lines.map((l) => l.slice(2).trim()) };
      return { type: "p", text: lines.join(" ") };
    });
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
