import { useEffect, useMemo, useRef, useState } from "react";
import { authorizeWidgetCall, type WidgetCall } from "@/lib/marketplace-scopes";
import { currentNonce } from "@/lib/ssr-nonce";
import { useLang } from "@/lib/i18n";
import { type RiskTier, resolvePolicy } from "@/lib/risk-tier";

/**
 * Sandbox host for third-party marketplace bundles.
 *
 * The bundle runs inside a `sandbox="allow-scripts"` iframe with a null origin,
 * so it has no DOM access, no cookies and no same-origin storage. It reaches the
 * app only through postMessage, and every message is checked against the scopes
 * the merchant approved at install time before the host answers.
 */
export type SandboxHandler = (
  method: string,
  params: unknown,
) => Promise<unknown>;

/**
 * Pure bridge decision: authorize the real frame message first, serve
 * `plugin.settings` from the mounted plugin's validated values, delegate
 * everything else to the host. Denial shapes match what the frame already
 * handles (`sandbox.<reason>`).
 */
export async function answerWidgetCall(
  msg: unknown,
  ctx: {
    settings?: Record<string, unknown>;
    granted: readonly string[];
    onCall: SandboxHandler;
  },
): Promise<{ result: unknown } | { error: string }> {
  const verdict = authorizeWidgetCall(msg, ctx.granted);
  if (!verdict.allowed) return { error: `sandbox.${verdict.reason}` };
  if (verdict.method === "plugin.settings") {
    return { result: { ...(ctx.settings ?? {}) } };
  }
  try {
    const params = (msg as { params?: unknown } | null)?.params;
    return { result: await ctx.onCall(verdict.method, params) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "sandbox.host_error",
    };
  }
}

/**
 * Per-request CSP nonce for the frame script. srcdoc frames inherit the
 * parent page's script-src (nonce-based, no unsafe-inline), so the frame's
 * script tag must carry the same nonce or nothing inside the island ever
 * executes — silently, in every browser. Uses the established currentNonce()
 * pattern (server store during SSR, csp-nonce meta on the client — the same
 * channel hydration payloads and custom JS islands use). Empty when absent
 * (fail closed: inert frame, same as before).
 */
export function pageNonce(): string {
  try {
    return currentNonce() ?? "";
  } catch {
    return "";
  }
}

export const FRAME_HTML = (
  entry: string,
  parentOrigin: string,
  nonce: string,
) => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; font-src 'none';">
<style>body{margin:0;font:14px/1.6 system-ui;color:#111}</style></head>
<body><div id="root"></div><script${nonce ? ` nonce="${nonce}"` : ""}>
const pending = new Map();
let seq = 0;
window.framique = {
  call(method, params) {
    const id = String(++seq);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      parent.postMessage({ v: 1, id, method, params }, "${parentOrigin}");
    });
  },
  mount(node) { document.getElementById("root").replaceChildren(node); },
};
window.addEventListener("message", (e) => {
  const d = e.data || {};
  if (!d.id || !pending.has(d.id)) return;
  const p = pending.get(d.id);
  pending.delete(d.id);
  if (d.error) p.reject(new Error(d.error)); else p.resolve(d.result);
});
try { ${entry} } catch (err) { document.getElementById("root").textContent = String(err); }
</script></body></html>`;

export function WidgetSandbox({
  title,
  entry,
  grantedScopes,
  settings,
  onCall,
  height = 320,
  riskTier = "low",
  bare = false,
}: {
  title: string;
  entry: string;
  grantedScopes: string[];
  /** Validated values for exactly the mounted plugin; served to `plugin.settings`. */
  settings?: Record<string, unknown>;
  onCall: SandboxHandler;
  height?: number;
  riskTier?: RiskTier;
  /**
   * Bare frame for floating widgets: no card chrome (border/rounded/bg) —
   * the entry paints its own shape edge-to-edge.
   */
  bare?: boolean;
}) {
  const { t } = useLang();
  const policy = resolvePolicy(riskTier);
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [denied, setDenied] = useState<string[]>([]);
  // SSR-safe: the origin is only needed once the frame posts back, which is
  // always client-side. Render must never touch `window` (storefront SSR).
  // The nonce is read lazily for the same reason (no `document` on server).
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const nonce = useMemo(() => pageNonce(), []);
  const srcDoc = useMemo(
    () => FRAME_HTML(entry, origin, nonce),
    [entry, origin, nonce],
  );

  useEffect(() => {
    async function onMessage(event: MessageEvent) {
      const frame = ref.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const msg = event.data as WidgetCall;
      const ans = await answerWidgetCall(msg, {
        settings,
        granted: grantedScopes,
        onCall,
      });
      if ("error" in ans && ans.error === "sandbox.scope_denied") {
        const method = (msg as { method?: unknown })?.method;
        if (typeof method === "string") {
          setDenied((d) => (d.includes(method) ? d : [...d, method]));
        }
      }
      // Target "*" is REQUIRED, not lax: the frame is sandboxed with the
      // same-origin permission withheld, so its origin is opaque ("null") and
      // addressing it by the page origin throws (the reply never delivers —
      // observed live:
      // "target origin does not match the recipient window's origin
      // ('null')"). This stays safe because we only ever reply to
      // event.source after verifying it is exactly our frame's window above,
      // and the payload is this install's validated settings plus the
      // request id — no secrets, no cross-install data.
      const reply = (body: Record<string, unknown>) =>
        frame.contentWindow?.postMessage(
          { id: (msg as { id?: string })?.id, ...body },
          "*",
        );
      reply(ans);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [grantedScopes, settings, onCall]);

  return (
    <div className="space-y-2">
      <iframe
        ref={ref}
        title={title}
        srcDoc={srcDoc}
        sandbox={policy.iframe.sandbox}
        referrerPolicy={
          policy.iframe.referrerPolicy as React.HTMLAttributeReferrerPolicy
        }
        loading="lazy"
        style={{ height }}
        className={
          bare
            ? "h-full w-full border-0 bg-transparent"
            : "w-full rounded-fq-md border border-border bg-background"
        }
      />
      {denied.length > 0 && (
        <p
          role="status"
          className="rounded-fq-md border border-destructive/40 bg-destructive/10 p-2 text-xs"
        >
          {t(
            "Blocked calls without permission:",
            "অনুমতি ছাড়া কল আটকানো হয়েছে:",
          )}{" "}
          {denied.join(", ")}
        </p>
      )}
    </div>
  );
}
