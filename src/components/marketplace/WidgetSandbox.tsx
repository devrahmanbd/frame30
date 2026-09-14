import { useEffect, useMemo, useRef, useState } from "react";
import { authorizeWidgetCall, type WidgetCall } from "@/lib/marketplace-scopes";
import { useLang } from "@/lib/i18n";

/**
 * Sandbox host for third-party marketplace bundles.
 *
 * The bundle runs inside a `sandbox="allow-scripts"` iframe with a null origin,
 * so it has no DOM access, no cookies and no same-origin storage. It reaches the
 * app only through postMessage, and every message is checked against the scopes
 * the merchant approved at install time before the host answers.
 */
export type SandboxHandler = (method: string, params: unknown) => Promise<unknown>;

const FRAME_HTML = (entry: string) => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>body{margin:0;font:14px/1.6 system-ui;color:#111}</style></head>
<body><div id="root"></div><script>
const pending = new Map();
let seq = 0;
window.framique = {
  call(method, params) {
    const id = String(++seq);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      parent.postMessage({ v: 1, id, method, params }, "*");
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
  onCall,
  height = 320,
}: {
  title: string;
  entry: string;
  grantedScopes: string[];
  onCall: SandboxHandler;
  height?: number;
}) {
  const { t } = useLang();
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [denied, setDenied] = useState<string[]>([]);
  const srcDoc = useMemo(() => FRAME_HTML(entry), [entry]);

  useEffect(() => {
    async function onMessage(event: MessageEvent) {
      const frame = ref.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const msg = event.data as WidgetCall;
      const verdict = authorizeWidgetCall(msg, grantedScopes);
      const reply = (body: Record<string, unknown>) =>
        frame.contentWindow?.postMessage({ id: (msg as { id?: string })?.id, ...body }, "*");

      if (!verdict.allowed) {
        if (verdict.reason === "scope_denied" && verdict.method) {
          setDenied((d) => (d.includes(verdict.method!) ? d : [...d, verdict.method!]));
        }
        reply({ error: `sandbox.${verdict.reason}` });
        return;
      }
      try {
        reply({ result: await onCall(verdict.method, msg.params) });
      } catch (err) {
        reply({ error: err instanceof Error ? err.message : "sandbox.host_error" });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [grantedScopes, onCall]);

  return (
    <div className="space-y-2">
      <iframe
        ref={ref}
        title={title}
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        loading="lazy"
        style={{ height }}
        className="w-full rounded-fq-md border border-border bg-background"
      />
      {denied.length > 0 && (
        <p role="status" className="rounded-fq-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
          {t("Blocked calls without permission:", "অনুমতি ছাড়া কল আটকানো হয়েছে:")} {denied.join(", ")}
        </p>
      )}
    </div>
  );
}
