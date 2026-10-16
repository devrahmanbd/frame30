/**
 * ThemeRuntime — isolation boundary for full custom merchant themes.
 *
 * A custom theme is NOT an HTML widget: it renders the entire storefront
 * (bundled animation/graphics included) inside a DEDICATED isolated document
 * loaded from an immutable URL on the controlled asset origin. It is never
 * inlined (`srcDoc`), never granted `allow-same-origin`, and never reaches
 * the parent except through the versioned v2 bridge (`bridge-v2.ts`).
 *
 * Isolation stack (each layer independently tested):
 * - `sandbox="allow-scripts"` ONLY: scripts execute inside the isolated
 *   document, but there is no same-origin access (null origin: no cookies,
 *   no storage, no parent DOM), no top navigation and no popups. All
 *   navigation/commerce goes through bridge methods so the host can
 *   authorize + the server can revalidate.
 * - Frame CSP contract (`themeFrameCSP`): `default-src 'none'` plus exactly
 *   the approved asset origin for script/style/img/font. `connect-src
 *   'none'` — the frame cannot phone home; data arrives via the bridge.
 *   Served by the asset origin as a response header (the host cannot set a
 *   cross-origin frame's CSP); this helper pins the exact contract string.
 * - Immutable theme URLs (`buildThemeFrameUrl`): version-pinned, https-only,
 *   no `latest`/mutable tags, theme code never inlined as blobs.
 * - Height handshake (`fq:theme-height`): the frame posts measurements, the
 *   host clamps (`clampThemeHeight`, mirroring HtmlSandbox) so runaway
 *   content can never take the page.
 * - Caller check: `event.source` must BE the owned frame's window
 *   (`isOwnerFrame`) — null-origin posts carry no trustworthy origin.
 *
 * This file creates no lanes, routes or stores and imports nothing from the
 * widget/builder lanes — only `./bridge-v2` and `./capabilities`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildThemePreviewEnvelope,
  createThemeGuard,
  handleThemeMessage,
  isOwnerFrame,
  resetThemeGuard,
  THEME_BRIDGE_VERSION,
  type ThemeAnswer,
  type ThemeFloodGuardState,
  type ThemeHostHandler,
} from "./bridge-v2";

export type { ThemeHostHandler };

/**
 * The ONLY sandbox tokens a theme frame ever gets. `allow-scripts` lets the
 * bundled theme execute inside its own document; everything else is denied:
 * - NO `allow-same-origin` (opaque null origin — no cookies, no storage,
 *   no parent DOM reach).
 * - NO `allow-top-navigation` / `allow-top-navigation-by-user-activation`
 *   (the frame cannot escape or redirect the page; navigation is the
 *   allowlisted `navigate` bridge method).
 * - NO `allow-popups` / `allow-popups-to-escape-sandbox` (no popups).
 * - NO `allow-forms` (form posts would bypass the bridge; commerce input
 *   travels as versioned bridge envelopes the host authorizes).
 */
export const THEME_SANDBOX = "allow-scripts";

/** postMessage type for the frame→host height handshake. */
export const THEME_HEIGHT_MESSAGE = "fq:theme-height";

export const THEME_MIN_HEIGHT = 120;
export const THEME_MAX_HEIGHT = 4000;

/**
 * Clamp a frame-reported height (mirrors HtmlSandbox): non-finite input
 * collapses to the minimum, runaway values pin to the maximum.
 */
export function clampThemeHeight(
  raw: unknown,
  min: number = THEME_MIN_HEIGHT,
  max: number = THEME_MAX_HEIGHT,
): number {
  const next = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(next)) return min;
  return Math.max(min, Math.min(max, Math.ceil(next)));
}

const ORIGIN_RE = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i;
const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const THEME_NAME_RE = /^[a-z0-9-]{1,64}$/;
const THEME_VERSION_RE = /^\d{1,5}\.\d{1,5}\.\d{1,5}(?:-[a-z0-9.-]{1,32})?$/i;

/** Controlled asset origin check (https, plus http loopback for local dev). */
export function isApprovedAssetOrigin(origin: string): boolean {
  return ORIGIN_RE.test(origin) || LOCAL_ORIGIN_RE.test(origin);
}

/**
 * Restrictive frame-CSP contract for the theme document (mirrors the
 * WidgetSandbox frame-CSP pattern: `default-src 'none'` first, then per-kind
 * allow-listing). The theme document needs its own bundle, so script/style/
 * img/font admit EXACTLY the approved asset origin and nothing else —
 * no `unsafe-inline` scripts, no blob:/data: scripts, no third-party hosts.
 * `connect-src 'none'`: the frame has no network of its own; storefront data
 * arrives through the bridge. Served by the asset origin as a header; on an
 * unapproved origin this fails closed to bare `default-src 'none'`.
 */
export function themeFrameCSP(assetOrigin: string): string {
  if (!isApprovedAssetOrigin(assetOrigin)) return "default-src 'none'";
  const o = assetOrigin;
  return [
    "default-src 'none'",
    `script-src ${o}`,
    `style-src ${o} 'unsafe-inline'`, // sast-allow: csp-sandbox -- style-src only (no script-src inline): theme CSS sanitized at package+render lanes, document stays opaque-origin sandboxed regardless
    `img-src ${o} data:`,
    `font-src ${o}`,
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

export type ThemeIdentity = {
  /** URL-safe theme name (`[a-z0-9-]`, ≤64 chars). */
  name: string;
  /** Immutable pinned version (semver, no `latest`/mutable tags). */
  version: string;
};

/**
 * Immutable theme-document URL on the controlled origin. Version-pinned so a
 * published storefront cannot silently change under review; http (non-dev),
 * `latest` tags, path traversal and unparseable identities fail closed to
 * `null` (the component renders nothing).
 */
export function buildThemeFrameUrl(
  assetOrigin: string,
  theme: ThemeIdentity,
): string | null {
  if (!isApprovedAssetOrigin(assetOrigin)) return null;
  if (
    !theme ||
    !THEME_NAME_RE.test(theme.name) ||
    !THEME_VERSION_RE.test(theme.version)
  )
    return null;
  return `${assetOrigin}/t/${theme.name}/${theme.version}/index.html`;
}

export type ThemeRuntimeProps = {
  title: string;
  /** Controlled https origin serving version-pinned theme documents. */
  assetOrigin: string;
  /** Pinned theme identity (name + immutable version). */
  theme: ThemeIdentity;
  /** Granted `theme:*` scopes for this install (see `buildThemeGrants`). */
  granted: readonly string[];
  /** Exact https origins the theme may navigate to (empty = paths only). */
  navigateAllowlist?: readonly string[];
  /** Host implementation behind authorized bridge calls (server revalidates). */
  onCall: ThemeHostHandler;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
  /**
   * Freshness clock (ms epoch) for timestamped envelopes. Evaluated per
   * message (`now ?? Date.now()` at the host call site): a PRESENT `ts`
   * must fall within `THEME_ENVELOPE_MAX_SKEW_MS` of this clock or the
   * envelope is `theme.stale`. Absent keeps the previous behavior — the
   * host clock at message time — so untimestamped envelopes stay
   * back-compatible.
   */
  now?: number;
  /**
   * Kill-switch / revocation liveness, fed from the install's live status
   * per envelope: when true every call is refused as `theme.suspended`
   * BEFORE any database read. The route feeds this from its loader's live
   * install-status check, so mid-session revocation takes effect on the
   * next envelope without remounting. Defaults to false (live).
   */
  suspended?: boolean;
  /**
   * Editor-preview seam: observes the owned frame element (`ThemeWidgetPreview`
   * uses it to address postMessage) and its load event (preview envelopes
   * post only after load — pre-load posts are lost). Both optional; the
   * message loop above never depends on them.
   */
  onFrame?: (frame: HTMLIFrameElement | null) => void;
  onFrameLoad?: () => void;
};

export function ThemeRuntime({
  title,
  assetOrigin,
  theme,
  granted,
  navigateAllowlist = [],
  onCall,
  minHeight = THEME_MIN_HEIGHT,
  maxHeight = THEME_MAX_HEIGHT,
  className,
  now,
  suspended,
  onFrame,
  onFrameLoad,
}: ThemeRuntimeProps) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(minHeight);
  const url = buildThemeFrameUrl(assetOrigin, theme);

  // Flood/duplicate state lives in a ref (no re-render per message) and is
  // keyed to the mounted theme identity — a new version is a new frame.
  const guardRef = useRef<ThemeFloodGuardState | null>(null);
  if (guardRef.current === null) guardRef.current = createThemeGuard();
  useEffect(() => {
    if (guardRef.current) resetThemeGuard(guardRef.current);
  }, [url]);

  useEffect(() => {
    async function onMessage(event: MessageEvent) {
      const frame = ref.current;
      // Caller-frame check: identity is the frame's own window (null-origin
      // posts carry no trustworthy origin — same pattern as HtmlSandbox).
      if (!frame || !isOwnerFrame(event.source, frame.contentWindow)) return;
      const guard = guardRef.current;
      if (!guard) return;
      const data = event.data as {
        type?: unknown;
        height?: unknown;
        v?: unknown;
        id?: unknown;
        method?: unknown;
      } | null;
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      if (data.type === THEME_HEIGHT_MESSAGE) {
        setHeight(clampThemeHeight(data.height, minHeight, maxHeight));
        return;
      }
      if (
        data.v !== THEME_BRIDGE_VERSION ||
        typeof data.id !== "string" ||
        typeof data.method !== "string"
      )
        return;
      const ans: ThemeAnswer = await handleThemeMessage(data, {
        granted,
        navigateAllowlist,
        onCall,
        guard,
        // Freshness live: the host clock at THIS message (prop override for
        // tests, `Date.now()` in production) verifies timestamped envelopes.
        now: now ?? Date.now(),
        // Revocation liveness: the route feeds the install's live status;
        // mid-session revocation refuses the next envelope as
        // `theme.suspended` without remounting.
        suspended,
      });
      // Target "*" is REQUIRED, not lax: the frame is sandboxed without
      // `allow-same-origin`, so its origin is opaque ("null") and addressing
      // it by the page origin throws (same observation as WidgetSandbox).
      // Safe because we reply only to the verified owned frame window, with
      // this install's answer plus the request id — no secrets, no
      // cross-install data.
      frame.contentWindow?.postMessage(
        { v: THEME_BRIDGE_VERSION, id: data.id, ...ans },
        "*",
      );
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [
    granted,
    navigateAllowlist,
    onCall,
    minHeight,
    maxHeight,
    now,
    suspended,
  ]);

  // Merged frame ref: the message loop keeps its owned-window check while
  // preview hosts observe the same element. A throwing host callback must
  // never break the frame mount.
  const setFrameRefs = useCallback(
    (el: HTMLIFrameElement | null) => {
      ref.current = el;
      try {
        onFrame?.(el);
      } catch {
        // Host observation is best-effort; the frame stays mounted.
      }
    },
    [onFrame],
  );

  // Fail closed: no render without a valid immutable theme URL. Theme code is
  // never inlined — there is intentionally no `srcDoc` path here.
  if (!url) return null;

  return (
    <iframe
      ref={setFrameRefs}
      title={title}
      src={url}
      sandbox={THEME_SANDBOX}
      referrerPolicy="no-referrer"
      loading="lazy"
      className={className ?? "w-full border-0"}
      style={{ height }}
      onLoad={() => {
        try {
          onFrameLoad?.();
        } catch {
          // Host observation is best-effort.
        }
      }}
    />
  );
}

/* ------------------------------------------------- widget preview (Level B)
 *
 * PREVIEW STRATEGY for uploaded-theme widgets: a theme-owned component is
 * NEVER executed in page DOM (no dynamic import, no srcDoc, no inline
 * scripts — pinned by `theme-preview.test.tsx`). The preview renders the
 * SAME sandboxed ThemeRuntime frame above (immutable version-pinned URL,
 * `allow-scripts` only, restrictive frame CSP served by the asset origin)
 * and delivers the intended component id + validated instance data to the
 * OWNED frame as a versioned `fq:theme-preview` envelope
 * (`buildThemePreviewEnvelope` in `bridge-v2.ts` — shape/size/forbidden
 * gates, `theme.*` refusals).
 *
 * Data contract: `instanceProps` must already be `validateProps`-clean
 * against the def's `propsSchema` (the route/editor validates before
 * rendering); the envelope builder re-checks as defense in depth. An
 * invalid envelope posts NOTHING (fail closed with a console warning —
 * the frame shell still renders so height/bridge behavior stays
 * observable). Commerce actions inside the frame still travel the v2
 * method bridge and revalidate server-side.
 *
 * Renderer swap-in (adopter: `SectionRenderer` theme-owned branch, beside
 * the `resolveThemeOwnedComponent` hit): an owner-definition hit for a
 * `theme:<uploaded-id>/...` widget with NO native in-repo component
 * renders `ThemeWidgetPreview` (sandboxed) instead of the unavailable
 * placeholder — native in-repo theme components keep their existing lane.
 */

export type ThemeWidgetPreviewProps = {
  title?: string;
  /** Controlled https origin serving version-pinned theme documents. */
  assetOrigin: string;
  /** Pinned theme identity (name + immutable version). */
  theme: ThemeIdentity;
  /** Exact registry widget id (`theme:<owner>/<section>`). */
  widgetId: string;
  /** Intended section component (e.g. `HeroCanvas`). */
  component: string;
  /**
   * Validated instance data — `validateProps`-clean against the def's
   * `propsSchema`. Raw merchant values never reach this prop.
   */
  instanceProps: unknown;
  /** Granted `theme:*` scopes for this install (see `buildThemeGrants`). */
  granted: readonly string[];
  /** Exact https origins the theme may navigate to (empty = paths only). */
  navigateAllowlist?: readonly string[];
  /** Host implementation behind authorized bridge calls (server revalidates). */
  onCall: ThemeHostHandler;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
  /**
   * Freshness clock (ms epoch) for timestamped envelopes, forwarded to the
   * inner `ThemeRuntime` frame so widget commerce revalidates against the
   * host clock per message. Absent keeps host-clock-at-message behavior.
   */
  now?: number;
  /**
   * Kill-switch liveness for the widget frame, forwarded to the inner
   * `ThemeRuntime`: when true every call is refused as `theme.suspended`
   * before any host work. Defaults to false (live).
   */
  suspended?: boolean;
};

export function ThemeWidgetPreview({
  title = "Theme widget preview",
  assetOrigin,
  theme,
  widgetId,
  component,
  instanceProps,
  granted,
  navigateAllowlist = [],
  onCall,
  minHeight,
  maxHeight,
  className,
  now,
  suspended,
}: ThemeWidgetPreviewProps) {
  const url = buildThemeFrameUrl(assetOrigin, theme);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  // A new theme identity is a new frame: reset load tracking so envelopes
  // never post to a stale (or not-yet-loaded) document. `key={url}` below
  // remounts the frame itself; this resets the host-side flag.
  useEffect(() => {
    setLoaded(false);
  }, [url]);

  const envelope = useMemo(
    () =>
      buildThemePreviewEnvelope({ widgetId, component, props: instanceProps }),
    [widgetId, component, instanceProps],
  );

  useEffect(() => {
    if (!envelope.ok) {
      console.warn(
        `[theme-preview] dropping invalid preview payload for ${String(widgetId)}: ${envelope.error}`,
      );
    }
  }, [envelope, widgetId]);

  useEffect(() => {
    if (!loaded || !envelope.ok) return;
    const target = frame?.contentWindow ?? null;
    if (!target) return;
    try {
      // Target "*" is REQUIRED, not lax — same rationale as the answer
      // path above: the frame is sandboxed without `allow-same-origin`,
      // so its origin is opaque ("null"). Safe because the target is the
      // verified owned frame window and the payload is validated instance
      // data only — no secrets, no cross-install data. Pre-load posts are
      // never attempted (`loaded` gates), because they would be lost.
      target.postMessage(envelope.envelope, "*");
    } catch {
      // A hostile frame state must never break the editor.
    }
  }, [loaded, frame, envelope]);

  // Fail closed: no frame without a valid immutable theme URL.
  if (!url) return null;

  return (
    <ThemeRuntime
      key={url}
      title={title}
      assetOrigin={assetOrigin}
      theme={theme}
      granted={granted}
      navigateAllowlist={navigateAllowlist}
      onCall={onCall}
      minHeight={minHeight}
      maxHeight={maxHeight}
      className={className}
      now={now}
      suspended={suspended}
      onFrame={setFrame}
      onFrameLoad={() => setLoaded(true)}
    />
  );
}
