"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { pollMessages, postMessage } from "@/app/(app)/messages/actions";
import type { ChatMessage } from "@/lib/chat";

const stamp = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function ChatThread({ id, initial }: { id: number; initial: ChatMessage[] }) {
  const [msgs, setMsgs] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const lastId = useRef(initial.at(-1)?.id ?? 0);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLLIElement>(null);
  const router = useRouter();

  // Opening the thread read it; refresh so the header's unread count (in the layout) catches up.
  useEffect(() => router.refresh(), [router]);

  const pull = useCallback(async () => {
    const more = await pollMessages(id, lastId.current).catch(() => []);
    if (!more.length) return;
    lastId.current = more.at(-1)!.id;
    setMsgs((m) => [...m, ...more.filter((x) => !m.some((y) => y.id === x.id))]);
  }, [id]);

  useEffect(() => {
    // ponytail: polls every 5 s while the tab is visible; server-sent events if chats get busy.
    const t = setInterval(() => !document.hidden && pull(), 5000);
    return () => clearInterval(t);
  }, [pull]);

  // Braces matter: newer browsers return a promise from scrollIntoView, and an effect may only return a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);

  const send = async () => {
    const body = box.current?.value ?? "";
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    const err = await postMessage(id, body).catch(() => "Couldn't send. Check your connection and try again.");
    setSending(false);
    if (err) return setError(err);
    if (box.current) box.current.value = "";
    await pull();
  };

  return (
    <>
      <ol aria-live="polite" className="min-h-0 flex-1 overflow-y-auto py-4">
        {msgs.length === 0 && <li className="mx-auto mt-10 max-w-sm text-center text-muted">Ask about the home, the price, or a good time to visit.</li>}
        {msgs.map((m) => (
          <li key={m.id} className={`mb-2 flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${m.mine ? "rounded-br-md bg-indigo text-canvas" : "rounded-bl-md bg-surface text-ink"}`}>
              <span className="sr-only">{m.mine ? "You: " : "Them: "}</span>
              <p className="break-words whitespace-pre-wrap">{m.body}</p>
              <time dateTime={new Date(m.createdAt).toISOString()} className={`mt-0.5 block text-[12px] ${m.mine ? "text-canvas/75" : "text-muted"}`}>
                {stamp(new Date(m.createdAt))}
              </time>
            </div>
          </li>
        ))}
        <li ref={end} aria-hidden="true" />
      </ol>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-hairline py-3"
      >
        <label htmlFor="chat-body" className="sr-only">
          Message
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="chat-body"
            ref={box}
            rows={1}
            maxLength={2000}
            placeholder="Write a message"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-hairline bg-canvas px-4 py-2.5 text-[15px] field-sizing-content focus-visible:border-indigo focus-visible:outline-none"
          />
          <button disabled={sending} className="h-11 shrink-0 cursor-pointer rounded-full bg-indigo px-5 font-semibold text-canvas hover:bg-indigo-deep disabled:opacity-60">
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-[14px] font-medium text-danger">
            {error}
          </p>
        )}
        <p className="mt-2 text-[13px] text-muted">Never pay a token amount before you&rsquo;ve visited the home and seen the papers.</p>
      </form>
    </>
  );
}
