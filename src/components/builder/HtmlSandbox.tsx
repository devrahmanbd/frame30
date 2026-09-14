/**
 * Phase 4 — the `html` widget's isolation boundary.
 *
 * Merchant markup renders inside an iframe with `sandbox="allow-forms
 * allow-popups"` and no `allow-same-origin`, so it has no reach into the
 * storefront's cookies, storage or DOM. Height is negotiated over
 * `postMessage`: the frame measures itself and posts up, the host clamps the
 * value so a runaway document can never take over the page.
 */
import { useEffect, useRef, useState } from "react";
import { sandboxSrcDoc } from "@/lib/custom-code";

const MAX_HEIGHT = 4000;

type Props = {
  markup: string;
  /** Optional scoped CSS injected into the frame (never the host document). */
  css?: string;
  title: string;
  className?: string;
};

export function HtmlSandbox({ markup, css, title, className }: Props) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(120);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // A sandboxed frame without allow-same-origin posts with a null origin,
      // so identity is established by matching the frame's own window.
      if (!ref.current || event.source !== ref.current.contentWindow) return;
      const data = event.data as { type?: string; height?: number } | null;
      if (!data || data.type !== "fq:html-height") return;
      const next = Number(data.height);
      if (!Number.isFinite(next)) return;
      setHeight(Math.max(40, Math.min(MAX_HEIGHT, Math.ceil(next))));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (!markup.trim()) return null;

  return (
    <iframe
      ref={ref}
      title={title}
      sandbox="allow-forms allow-popups"
      referrerPolicy="no-referrer"
      loading="lazy"
      srcDoc={sandboxSrcDoc(markup, css ? { css } : {})}
      className={className ?? "w-full border-0"}
      style={{ height }}
    />
  );
}
