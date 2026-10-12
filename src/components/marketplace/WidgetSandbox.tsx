import { useEffect, useMemo, useRef, useState } from "react";
import {
  authorizeWidgetCall,
  isMenuSlot,
  menuReadGranted,
  type WidgetCall,
} from "@/lib/marketplace-scopes";
import {
  answerWithTimeout,
  checkFloodGuard,
  createFloodGuard,
  normalizeTimeoutMs,
  resetFloodGuard,
  type BridgeTimers,
  type FloodGuardState,
} from "@/lib/bridge-flood-guard";
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

/** True for a well-formed `menus.list` bridge envelope (any scope state). */
export function isMenusListCall(msg: unknown): boolean {
  const m = msg as { v?: unknown; id?: unknown; method?: unknown } | null;
  return (
    !!m && m.v === 1 && typeof m.id === "string" && m.method === "menus.list"
  );
}

/**
 * Optional fill-point selector carried on `menus.list` params
 * (`{ slot: "menu_bar" | ... }`). `undefined` means "no preference" — the
 * host answers with the default rows. Presence is validated by the caller.
 */
export function menusListSlot(msg: unknown): unknown {
  const params = (msg as { params?: unknown } | null)?.params;
  if (!params || typeof params !== "object" || Array.isArray(params))
    return undefined;
  const slot = (params as Record<string, unknown>).slot;
  return slot === undefined ? undefined : slot;
}

/**
 * Pure bridge decision: authorize the real frame message first, serve
 * `plugin.settings` from the mounted plugin's validated values, delegate
 * everything else to the host. Denial shapes match what the frame already
 * handles (`sandbox.<reason>`).
 *
 * TRACK M — menu fill points (`menu_bar` / `menu_dropdown` / `menu_drawer`):
 * a well-formed `menus.list` request naming an unsanctioned fill point never
 * reaches the host (`sandbox.unknown_slot`). Menus stay readable by default:
 * when the single-scope allow-list denies `menus.list` but the install holds
 * any storefront grant (`menuReadGranted` — `read_menus` or the
 * `render_storefront` every widget contribution already requires), the call
 * still delegates to the host. Replacement (a full renderer swap) is NOT a
 * bridge method — it is gated by `replace_menus` + the review approval flag
 * (`decideMenuRenderer` in `plugin-manifest.ts`).
 */
export async function answerWidgetCall(
  msg: unknown,
  ctx: {
    settings?: Record<string, unknown>;
    granted: readonly string[];
    onCall: SandboxHandler;
  },
): Promise<{ result: unknown } | { error: string }> {
  if (isMenusListCall(msg)) {
    const slot = menusListSlot(msg);
    if (slot !== undefined && !isMenuSlot(slot))
      return { error: "sandbox.unknown_slot" };
  }
  const verdict = authorizeWidgetCall(msg, ctx.granted);
  if (!verdict.allowed) {
    if (
      verdict.reason === "scope_denied" &&
      isMenusListCall(msg) &&
      menuReadGranted(ctx.granted)
    ) {
      try {
        return {
          result: await ctx.onCall(
            "menus.list",
            (msg as { params?: unknown }).params,
          ),
        };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : "sandbox.host_error",
        };
      }
    }
    return { error: `sandbox.${verdict.reason}` };
  }
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
 * Host-side gate in front of `answerWidgetCall`: per-frame rate limiting (max
 * 30 handled messages per rolling 10s window) and duplicate-`id` rejection
 * within the frame lifetime. Both rejections answer with a `sandbox.*` error
 * the frame already handles and never reach `onCall`. Admitted calls race a
 * per-call budget (`timeoutMs`, default 5000ms): a hung `onCall` answers
 * `{error: "sandbox.timeout"}` and the timed-out id stays retired in the
 * flood guard, so a late host resolution can never answer a recycled id.
 * Pure except for the clock (`now` injectable) and the timeout timers
 * (`timers` injectable) so the flood/duplicate/oversize/timeout contract is
 * unit-testable under node — the `useEffect` message listener below cannot be
 * driven without jsdom, so it delegates to this function.
 */
export async function handleSandboxMessage(
  msg: unknown,
  ctx: {
    settings?: Record<string, unknown>;
    granted: readonly string[];
    onCall: SandboxHandler;
    guard: FloodGuardState;
    now?: number;
    /** Per-call budget in ms; non-finite/negative falls back to the default. */
    timeoutMs?: number;
    /** Injectable clock for tests; defaults to the host setTimeout pair. */
    timers?: BridgeTimers;
  },
): Promise<{ result: unknown } | { error: string }> {
  const gate = checkFloodGuard(
    ctx.guard,
    (msg as { id?: unknown } | null)?.id,
    ctx.now ?? Date.now(),
  );
  if (!gate.ok) return { error: gate.error };
  return answerWithTimeout(
    answerWidgetCall(msg, ctx),
    normalizeTimeoutMs(ctx.timeoutMs),
    ctx.timers,
  );
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; font-src 'none';"> <!-- sast-allow: csp-sandbox -- frame CSP is default-src none with img/connect/font none, isolation comes from resolvePolicy sandbox without allow-same-origin plus authorizeWidgetCall scope checks and flood guard -->
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

  // Flood/duplicate state lives in a ref: the hot path must not re-render
  // per message (only the existing denied-state pattern sets state). The
  // guard is keyed to the mounted frame — a new `entry` is a new identity.
  const floodRef = useRef<FloodGuardState | null>(null);
  if (floodRef.current === null) floodRef.current = createFloodGuard();
  useEffect(() => {
    if (floodRef.current) resetFloodGuard(floodRef.current);
  }, [entry]);

  useEffect(() => {
    async function onMessage(event: MessageEvent) {
      const frame = ref.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const guard = floodRef.current;
      if (!guard) return;
      const msg = event.data as WidgetCall;
      const ans = await handleSandboxMessage(msg, {
        settings,
        granted: grantedScopes,
        onCall,
        guard,
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
