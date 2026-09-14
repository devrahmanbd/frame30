import { useCallback, useState } from "react";

import { TOKEN_CLASS, highlight, type CodeLang } from "@/lib/docs-highlight";

/**
 * A code sample a reader can trust and take away.
 *
 * - Highlighting is server-rendered from the pure tokeniser, so the sample is
 *   readable before hydration and identical after it — no flash of plain text.
 * - Copy uses the async clipboard API with a `document.execCommand` fallback,
 *   because the clipboard API is unavailable on insecure origins and in some
 *   in-app browsers, which is exactly where a mobile reader will be.
 * - The status is announced politely for screen readers instead of relying on
 *   the icon colour change alone.
 */
export function CodeBlock({
  code,
  lang = "text",
  caption,
  label,
}: {
  code: string;
  lang?: CodeLang;
  caption?: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const tokens = highlight(code, lang);

  const copy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const area = document.createElement("textarea");
        area.value = code;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(area);
        if (!ok) throw new Error("execCommand refused");
      }
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2200);
  }, [code]);

  return (
    <figure className="group relative my-6">
      {caption && (
        <figcaption className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {caption}
        </figcaption>
      )}
      <div className="relative overflow-hidden rounded-fq-md border border-border bg-muted/40">
        <button
          type="button"
          onClick={copy}
          className="absolute right-2 top-2 z-10 rounded-fq-md border border-border bg-background px-3 py-1.5 text-xs font-medium opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 md:text-xs"
          aria-label={label ? `Copy ${label}` : "Copy code sample"}
        >
          {state === "copied" ? "Copied" : state === "failed" ? "Press ⌘C" : "Copy"}
        </button>
        <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
          <code className="font-mono">
            {tokens.map((token, index) => (
              <span key={index} className={TOKEN_CLASS[token.kind]}>
                {token.text}
              </span>
            ))}
          </code>
        </pre>
      </div>
      <span aria-live="polite" className="sr-only">
        {state === "copied" ? "Code copied to clipboard" : state === "failed" ? "Copy failed" : ""}
      </span>
    </figure>
  );
}
