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
import { useEffect, useRef, useState } from "react";
import {
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
  }, [granted, navigateAllowlist, onCall, minHeight, maxHeight]);

  // Fail closed: no render without a valid immutable theme URL. Theme code is
  // never inlined — there is intentionally no `srcDoc` path here.
  if (!url) return null;

  return (
    <iframe
      ref={ref}
      title={title}
      src={url}
      sandbox={THEME_SANDBOX}
      referrerPolicy="no-referrer"
      loading="lazy"
      className={className ?? "w-full border-0"}
      style={{ height }}
    />
  );
}
