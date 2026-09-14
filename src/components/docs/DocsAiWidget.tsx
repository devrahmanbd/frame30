import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircleQuestion, Send, X } from "lucide-react";

import { askDocsAi } from "@/lib/docs-ai.functions";
import { CURRENT_VERSION, type DocVersionId } from "@/lib/docs";

/**
 * Floating "Ask AI" assistant for the documentation, in the style readers
 * already know from other developer docs: a pill in the bottom-right corner
 * that opens a small grounded chat. Answers come from `askDocsAi`, which
 * retrieves the matching doc sections first, so every reply links back to the
 * page it was drawn from.
 */

type DocsAiSource = {
  title: string;
  heading: string | null;
  path: string;
  excerpt: string;
};

type Turn = { role: "user" | "assistant"; content: string; sources?: DocsAiSource[] };

const SUGGESTIONS = [
  "How do I authenticate with the API?",
  "How do I verify a webhook signature?",
  "What are the rate limits?",
];

export function DocsAiWidget({ version = CURRENT_VERSION }: { version?: DocVersionId }) {
  const ask = useServerFn(askDocsAi);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    const history = turns.map((turn) => ({ role: turn.role, content: turn.content }));
    setTurns((prev) => [...prev, { role: "user", content: text }]);
    setBusy(true);
    try {
      const result = await ask({ data: { question: text, version, history } });
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: result.answer, sources: result.sources },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end p-4 sm:p-6">
      {open ? (
        <section
          aria-label="Ask AI about the documentation"
          className="pointer-events-auto flex h-[32rem] w-full max-w-sm flex-col overflow-hidden rounded-fq-lg border border-border bg-background shadow-lift"
        >
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Ask AI</p>
              <p className="truncate text-xs text-muted-foreground">
                Answers grounded in these docs
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Ask AI"
              className="grid size-9 place-items-center rounded-fq-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X aria-hidden className="size-4" />
            </button>
          </header>

          <div ref={logRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {turns.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ask anything about setup, the API, webhooks, payments or themes.
                </p>
                <ul className="space-y-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        onClick={() => void send(suggestion)}
                        className="w-full rounded-fq-md border border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {turns.map((turn, index) => (
              <div
                key={index}
                className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    turn.role === "user"
                      ? "max-w-[85%] rounded-fq-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "max-w-[92%] space-y-3"
                  }
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.content}</p>
                  {turn.sources && turn.sources.length > 0 ? (
                    <ul className="space-y-1 border-t border-border pt-2">
                      {turn.sources.slice(0, 4).map((source) => (
                        <li key={source.path}>
                          <a
                            href={source.path}
                            onClick={() => setOpen(false)}
                            className="text-xs text-primary hover:underline"
                          >
                            {source.title}
                            {source.heading ? ` · ${source.heading}` : ""}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ))}

            {busy ? (
              <p aria-live="polite" className="text-sm text-muted-foreground">
                Reading the docs…
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <form
            className="flex items-center gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask a question…"
              aria-label="Your question"
              className="min-h-11 flex-1 rounded-fq-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              disabled={busy || input.trim().length < 2}
              aria-label="Send question"
              className="grid size-11 shrink-0 place-items-center rounded-fq-md bg-primary text-primary-foreground transition-opacity disabled:opacity-50"
            >
              <Send aria-hidden className="size-4" />
            </button>
          </form>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-lift transition-transform hover:scale-[0.98]"
        >
          <MessageCircleQuestion aria-hidden className="size-4" />
          Ask AI
        </button>
      )}
    </div>
  );
}
