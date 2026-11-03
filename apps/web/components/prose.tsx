import { toBlocks } from "@/lib/prose";

/** Renders the team's plain-text format (see lib/prose.ts). Everything is a text node, so nothing typed can inject HTML. */
export function Prose({ body }: { body: string }) {
  return (
    <div className="max-w-[68ch] text-[1.0625rem] leading-relaxed">
      {toBlocks(body).map((b, i) =>
        b.type === "h2" ? (
          <h2 key={i} className="mt-10 mb-3 text-xl font-semibold">
            {b.text}
          </h2>
        ) : b.type === "ul" ? (
          <ul key={i} className="my-4 grid list-disc gap-1.5 pl-6">
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="my-4">
            {b.text}
          </p>
        ),
      )}
    </div>
  );
}
