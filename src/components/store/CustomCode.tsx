/**
 * Phase 4 — storefront delivery for merchant custom code.
 *
 * CSS ships inline in a <style> that is already prefix-scoped server-side, so
 * it can only ever paint inside `.fq-theme-scope`. JS is *never* inlined in the
 * SSR document: it is attached after hydration (and after consent when the
 * script is analytics-adjacent) as a non-parser-inserted script, which is what
 * `script-src 'strict-dynamic'` with a per-request nonce permits.
 */
import { useEffect, useState } from "react";
import type { CompiledCustomCode } from "@/lib/custom-code";

type Props = {
  code: CompiledCustomCode | null;
  /** Visitor consent state from the storefront consent banner. */
  consented?: boolean;
};

export function CustomCodeStyles({ code }: { code: CompiledCustomCode | null }) {
  if (!code?.css) return null;
  return <style data-fq-custom-css="">{code.css}</style>;
}

export function CustomCodeBody({
  code,
  slot,
}: {
  code: CompiledCustomCode | null;
  slot: "start" | "end";
}) {
  const html = slot === "start" ? code?.bodyStart : code?.bodyEnd;
  if (!html) return null;
  // The markup was allowlisted server-side: tags, attributes and URL schemes
  // are all filtered, and scripts can never survive the filter.
  return <div data-fq-snippet={slot} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Deferred custom JS island. Runs once, after paint, never during SSR. */
export function CustomCodeScript({ code, consented = false }: Props) {
  const [ran, setRan] = useState(false);

  useEffect(() => {
    if (ran || !code?.js) return;
    if (code.jsRequiresConsent && !consented) return;
    const attach = () => {
      const el = document.createElement("script");
      el.type = "text/javascript";
      el.defer = true;
      el.dataset["fqCustomJs"] = "";
      el.textContent = code.js;
      document.body.appendChild(el);
      setRan(true);
    };
    // Idle time only: custom code never competes with the storefront's own
    // hydration or with LCP.
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(attach);
    else window.setTimeout(attach, 1200);
  }, [code, consented, ran]);

  return null;
}

/** Everything the storefront needs in one place, minus the head tags. */
export function CustomCodeSurface({ code, consented }: Props) {
  return (
    <>
      <CustomCodeStyles code={code} />
      <CustomCodeScript code={code} consented={consented ?? false} />
    </>
  );
}
