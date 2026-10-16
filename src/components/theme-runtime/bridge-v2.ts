/**
 * Theme bridge v2 — versioned host-side gate for full custom themes.
 *
 * NEW lane, disjoint from the widget bridge (`WidgetSandbox`, v1 envelopes,
 * `sandbox.*` errors). Disjointness is load-bearing: a v1 widget envelope
 * must never authorize against theme grants and a v2 theme envelope must
 * never authorize against widget scopes, so version, method tables, guard
 * state and error namespaces are all separate.
 *
 * Containments (all host-side, all pure/testable under node):
 *
 * 1. Versioned envelopes — only `{ v: 2, id, method, params? }` is admitted.
 *    v1 or unversioned traffic is `theme.malformed`, never silently coerced.
 * 2. Caller identity — the component matches `event.source` to its owned
 *    frame (`isOwnerFrame`); this module never sees cross-frame traffic.
 * 3. Capability grants — `authorizeThemeCall` consults the install's granted
 *    `theme:*` scopes from `buildThemeGrants` (see `capabilities.ts`).
 * 4. Forgery rejection — any forbidden key (price/stock/tenant/secret/
 *    payment-*) anywhere in params is `theme.forbidden_field`. The frame is
 *    untrusted input; rejection is client-side, enforcement is server-side.
 * 5. Flood + duplicate + oversize — same PATTERN as `bridge-flood-guard.ts`
 *    (rolling 30-per-10s window, per-mount duplicate-`id` set, 64 KiB cap,
 *    per-call timeout with injectable timers) but REIMPLEMENTED here, not
 *    imported. Rationale: the widget lane's guard state is keyed to a widget
 *    mount and its error strings are `sandbox.*`; sharing the module would
 *    couple the lanes (a widget storm consuming theme budget, a theme change
 *    rippling into widget tests) and let a refactor of one lane silently
 *    move the other's containment. Duplicated ~60 lines are cheaper than a
 *    cross-lane outage. Error namespace is `theme.*` throughout.
 * 6. Never throws — `answerThemeCall` / `handleThemeMessage` always resolve
 *    to `{ result } | { error }`. Malformed input (null, primitives, arrays,
 *    circular objects) maps to an error answer; the host event loop cannot
 *    be broken from the frame.
 *
 * SERVER CONTRACT (flagged, not implemented here — the client cannot enforce
 * it, it can only refuse to help the attacker):
 * - Every commerce action MUST be revalidated server-side from the server
 *   session: price, currency, discounts, stock/inventory, tenant/shop id.
 * - `cart.add` params (variantId + quantity) are a SHOPPER REQUEST, not a
 *   quote: the server reprices from its own catalog and ignores any
 *   price-like field even if one ever reaches it (defense in depth with the
 *   client-side forbidden-field rejection + sanitizer).
 * - Payment status is ONLY ever read from the payment provider webhook /
 *   server transaction record. A `paymentStatus`/`paymentId` value arriving
 *   over the bridge is forgery by definition — reject AND log server-side.
 * - Tenant isolation: the server resolves the tenant from the authenticated
 *   session / host route, never from bridge params. A `tenant*` field over
 *   the bridge is a cross-tenant probe — reject AND log server-side.
 * - Navigation targets are re-checked server-side where navigation triggers
 *   data loads; the client allowlist is UX, not access control.
 */

import {
  findForbiddenFields,
  isNavigationAllowed,
  sanitizeThemeParams,
  THEME_METHODS,
  type ThemeMethod,
} from "./capabilities";

/** Bridge protocol version. v1 belongs to the widget lane — never admit it here. */
export const THEME_BRIDGE_VERSION = 2;

/** Max handled messages per rolling window, per mounted theme frame. */
export const THEME_BRIDGE_MAX_MESSAGES = 30;
/** Rolling window for the rate budget. */
export const THEME_BRIDGE_WINDOW_MS = 10_000;
/** Cap on the JSON-serialized size of one theme bridge message. */
export const THEME_MAX_MESSAGE_BYTES = 64 * 1024;
/** Default budget for one bridge call before the host times out. */
export const THEME_DEFAULT_CALL_TIMEOUT_MS = 5_000;

/**
 * Freshness skew for timestamped envelopes (`ts`, ms epoch). Envelopes
 * without `ts` are admitted without a freshness check (back-compat: neither
 * shipped frame sends one); a PRESENT `ts` must be a finite number within
 * this skew of the host clock or the envelope is `theme.stale` (replayed or
 * pre-forged traffic). Hosts pass their clock through (`ThemeMessageContext`
 * already carries `now` for the flood guard — the same value is reused).
 */
export const THEME_ENVELOPE_MAX_SKEW_MS = 5 * 60 * 1000;

export type ThemeEnvelope = {
  v: 2;
  id: string;
  method: string;
  params?: unknown;
  /** Optional ms-epoch freshness claim, verified against the host clock. */
  ts?: unknown;
};

export type ThemeAnswer = { result: unknown } | { error: string };

export type ThemeHostHandler = (
  method: string,
  params: unknown,
) => Promise<unknown>;

export type ThemeVerdict =
  | { allowed: true; method: ThemeMethod }
  | {
      allowed: false;
      reason:
        | "malformed"
        | "oversize"
        | "unknown_method"
        | "scope_denied"
        | "forbidden_field"
        | "invalid_params"
        | "navigation_denied"
        | "stale"
        | "suspended";
      method?: string;
    };

const MAX_ID_BYTES = 128;

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, max = 128): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    utf8Length(value) <= max * 4
  );
}

/** Per-method param shapes. Anything else is `invalid_params`. */
function paramsValid(method: ThemeMethod, params: unknown): boolean {
  switch (method) {
    case "storefront.read": {
      if (params === undefined) return true;
      if (!isPlainRecord(params)) return false;
      const { fields } = params as { fields?: unknown };
      if (fields === undefined) return true;
      return (
        Array.isArray(fields) &&
        fields.length <= 32 &&
        fields.every((f) => isNonEmptyString(f, 64))
      );
    }
    case "variant.select": {
      if (!isPlainRecord(params)) return false;
      const { variantId, productId } = params as {
        variantId?: unknown;
        productId?: unknown;
      };
      return (
        (variantId !== undefined && isNonEmptyString(variantId)) ||
        (productId !== undefined && isNonEmptyString(productId))
      );
    }
    case "cart.add": {
      if (!isPlainRecord(params)) return false;
      const { variantId, quantity, promoCode } = params as {
        variantId?: unknown;
        quantity?: unknown;
        promoCode?: unknown;
      };
      if (!isNonEmptyString(variantId)) return false;
      if (
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99
      )
        return false;
      if (promoCode !== undefined && !isNonEmptyString(promoCode, 64))
        return false;
      return true;
    }
    case "navigate": {
      if (!isPlainRecord(params)) return false;
      const { href } = params as { href?: unknown };
      return typeof href === "string" && href.length > 0 && href.length <= 2048;
    }
  }
}

export type ThemeAuthContext = {
  granted: readonly string[];
  navigateAllowlist?: readonly string[];
  /**
   * Kill-switch / revocation liveness: when true every call — even
   * well-formed, in-scope ones — is refused as `suspended` (explicit
   * dead-frame state, never a silent stale render). The component sets this
   * from the install's live status on every message; mid-session revocation
   * takes effect on the next envelope without remounting.
   */
  suspended?: boolean;
};

/**
 * The single decision point the theme host consults for every message. Pure:
 * no DOM. The clock is injectable (`opts.now`): timestamped envelopes are
 * verified against it, untimestamped ones skip freshness (back-compat).
 * Never throws — defensive try/catch maps even pathological
 * input (circular structures break JSON.stringify) to an error verdict.
 */
export function authorizeThemeCall(
  msg: unknown,
  ctx: ThemeAuthContext,
  opts?: { now?: number },
): ThemeVerdict {
  try {
    if (ctx.suspended === true) {
      return { allowed: false, reason: "suspended" };
    }
    const m = msg as Partial<ThemeEnvelope> | null;
    if (
      !m ||
      typeof m !== "object" ||
      Array.isArray(m) ||
      m.v !== THEME_BRIDGE_VERSION ||
      typeof m.id !== "string" ||
      m.id.length === 0 ||
      utf8Length(m.id) > MAX_ID_BYTES ||
      typeof m.method !== "string"
    ) {
      return { allowed: false, reason: "malformed" };
    }
    if (m.ts !== undefined) {
      if (typeof m.ts !== "number" || !Number.isFinite(m.ts)) {
        return { allowed: false, reason: "malformed" };
      }
      const now = opts?.now;
      if (typeof now === "number" && Number.isFinite(now)) {
        if (Math.abs(now - m.ts) > THEME_ENVELOPE_MAX_SKEW_MS) {
          return { allowed: false, reason: "stale", method: m.method };
        }
      }
    }
    let raw = "";
    try {
      raw = JSON.stringify(msg) ?? "";
    } catch {
      return { allowed: false, reason: "malformed" };
    }
    if (utf8Length(raw) > THEME_MAX_MESSAGE_BYTES) {
      return { allowed: false, reason: "oversize", method: m.method };
    }
    const def = (THEME_METHODS as Record<string, { scope: string }>)[
      m.method
    ] as { scope: string } | undefined;
    if (!def || !(m.method in THEME_METHODS)) {
      return { allowed: false, reason: "unknown_method", method: m.method };
    }
    const method = m.method as ThemeMethod;
    if (!ctx.granted.includes(def.scope)) {
      return { allowed: false, reason: "scope_denied", method };
    }
    const forbidden = findForbiddenFields((m as { params?: unknown }).params);
    if (forbidden.length > 0) {
      // Forgery attempt (price/tenant/payment injection): reject here AND
      // flag for server-side logging — see SERVER CONTRACT above.
      return { allowed: false, reason: "forbidden_field", method };
    }
    if (!paramsValid(method, (m as { params?: unknown }).params)) {
      return { allowed: false, reason: "invalid_params", method };
    }
    if (
      method === "navigate" &&
      !isNavigationAllowed(
        (m as { params?: Record<string, unknown> }).params &&
          (
            (m as { params?: Record<string, unknown> }).params as Record<
              string,
              unknown
            >
          ).href,
        ctx.navigateAllowlist ?? [],
      )
    ) {
      return { allowed: false, reason: "navigation_denied", method };
    }
    return { allowed: true, method };
  } catch {
    return { allowed: false, reason: "malformed" };
  }
}

export type ThemeAnswerContext = ThemeAuthContext & {
  onCall: ThemeHostHandler;
  /**
   * Host clock (ms epoch) for envelope freshness. `handleThemeMessage`
   * forwards its own `now` (the same value the flood guard uses); direct
   * `answerThemeCall` callers without a clock skip freshness for
   * timestamped envelopes.
   */
  now?: number;
};

/**
 * Authorize then delegate. Sanitized params (forbidden subtrees stripped)
 * reach `onCall` as belt-and-braces behind the authorize-time rejection.
 * Host failures map to `theme.host_error` (non-Error rejections) or the
 * Error message; the frame-visible taxonomy otherwise stays `theme.*`.
 * Never rejects.
 */
export async function answerThemeCall(
  msg: unknown,
  ctx: ThemeAnswerContext,
): Promise<ThemeAnswer> {
  try {
    const verdict = authorizeThemeCall(msg, ctx, { now: ctx.now });
    if (!verdict.allowed) return { error: `theme.${verdict.reason}` };
    const rawParams = (msg as { params?: unknown } | null)?.params;
    const { clean } = sanitizeThemeParams(rawParams);
    try {
      return { result: await ctx.onCall(verdict.method, clean) };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "theme.host_error",
      };
    }
  } catch {
    return { error: "theme.host_error" };
  }
}

// ------------------------------------------------------------ flood guard
// Same pattern as bridge-flood-guard.ts, reimplemented per-lane (see header).

export type ThemeFloodGuardState = {
  /** Every `id` handled so far in this frame lifetime. */
  seen: Set<string>;
  /** Timestamps (ms) of handled messages, in arrival order. */
  times: number[];
};

export function createThemeGuard(): ThemeFloodGuardState {
  return { seen: new Set<string>(), times: [] };
}

/** Forget everything: called when the theme identity changes (new mount). */
export function resetThemeGuard(g: ThemeFloodGuardState): void {
  g.seen.clear();
  g.times.length = 0;
}

export type ThemeFloodGate =
  | { ok: true }
  | { ok: false; error: "theme.duplicate_id" | "theme.rate_limited" };

/**
 * Admit one message. Duplicates are rejected first and cost no rate budget;
 * admitted messages (even ones the authorizer later denies) each spend one
 * rate slot. `now` is injectable for tests.
 */
export function checkThemeGuard(
  g: ThemeFloodGuardState,
  id: unknown,
  now: number = Date.now(),
): ThemeFloodGate {
  if (typeof id === "string" && g.seen.has(id)) {
    return { ok: false, error: "theme.duplicate_id" };
  }
  const cutoff = now - THEME_BRIDGE_WINDOW_MS;
  let w = 0;
  for (let r = 0; r < g.times.length; r++) {
    if (g.times[r]! > cutoff) g.times[w++] = g.times[r]!;
  }
  g.times.length = w;
  if (g.times.length >= THEME_BRIDGE_MAX_MESSAGES) {
    return { ok: false, error: "theme.rate_limited" };
  }
  g.times.push(now);
  if (typeof id === "string") g.seen.add(id);
  return { ok: true };
}

// ------------------------------------------------------------ timeout

export type ThemeTimers = {
  schedule: (cb: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
};

const hostThemeTimers: ThemeTimers = {
  schedule: (cb, ms) => setTimeout(cb, ms),
  cancel: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class ThemeTimeoutError extends Error {
  constructor() {
    super("theme.timeout");
    this.name = "ThemeTimeoutError";
  }
}

export function normalizeThemeTimeoutMs(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0
    ? v
    : THEME_DEFAULT_CALL_TIMEOUT_MS;
}

function withThemeTimeout<T>(
  work: Promise<T>,
  ms: number,
  timers: ThemeTimers = hostThemeTimers,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = timers.schedule(() => {
      if (settled) return;
      settled = true;
      reject(new ThemeTimeoutError());
    }, ms);
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        timers.cancel(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        timers.cancel(timer);
        reject(err);
      },
    );
  });
}

function answerWithThemeTimeout(
  work: Promise<ThemeAnswer>,
  ms: number,
  timers: ThemeTimers = hostThemeTimers,
): Promise<ThemeAnswer> {
  return withThemeTimeout(work, ms, timers).catch((err) => {
    if (err instanceof ThemeTimeoutError) return { error: "theme.timeout" };
    throw err;
  });
}

export type ThemeMessageContext = ThemeAnswerContext & {
  guard: ThemeFloodGuardState;
  now?: number;
  timeoutMs?: number;
  timers?: ThemeTimers;
  /**
   * Caller-identity result from the component's `isOwnerFrame` check. An
   * explicit `false` means the message did NOT come from the owned frame
   * window (postMessage spoof from another context) and is refused as
   * `theme.forged_source` BEFORE the flood guard — forged traffic spends no
   * rate budget and touches no guard state. `undefined`/`true` keeps the
   * existing path (the component pre-filters; pure callers opt in).
   */
  sourceValid?: boolean;
};

/**
 * Host-side gate in front of `answerThemeCall`: caller-identity rejection
 * first (no guard, no timer for forged traffic), then flood/duplicate
 * rejection (no timer started for rejected traffic), then the authorized call
 * races its per-call budget. Never rejects.
 */
export async function handleThemeMessage(
  msg: unknown,
  ctx: ThemeMessageContext,
): Promise<ThemeAnswer> {
  try {
    if (ctx.sourceValid === false) return { error: "theme.forged_source" };
    const gate = checkThemeGuard(
      ctx.guard,
      (msg as { id?: unknown } | null)?.id,
      ctx.now ?? Date.now(),
    );
    if (!gate.ok) return { error: gate.error };
    return await answerWithThemeTimeout(
      answerThemeCall(msg, ctx),
      normalizeThemeTimeoutMs(ctx.timeoutMs),
      ctx.timers,
    );
  } catch {
    return { error: "theme.host_error" };
  }
}

// ------------------------------------------------------------ caller identity

/**
 * Caller-frame check (unit-testable half of the HtmlSandbox pattern): the
 * host only processes messages whose `event.source` IS the owned frame's
 * window. A sandboxed frame without `allow-same-origin` posts with a null
 * origin, so origin allow-listing is meaningless here — window identity is
 * the check. Both sides must be objects (a real `event.source` is always a
 * WindowProxy, never a string), so primitive equality (`"*" === "*"`) can
 * never authenticate. The component applies this before calling
 * `handleThemeMessage`.
 */
export function isOwnerFrame(source: unknown, frameWindow: unknown): boolean {
  const isWindowLike = (v: unknown): boolean =>
    (typeof v === "object" || typeof v === "function") && v !== null;
  return (
    isWindowLike(source) && isWindowLike(frameWindow) && source === frameWindow
  );
}

/** Every host-visible error string is namespaced `theme.*` (never `sandbox.*`). */
export function isThemeError(answer: ThemeAnswer): boolean {
  return (
    "error" in answer &&
    typeof answer.error === "string" &&
    answer.error.startsWith("theme.")
  );
}

// ------------------------------------------------------------ widget preview
//
// Editor preview for uploaded-theme widgets (host → frame direction).
//
// A theme-owned widget NEVER executes in page DOM. The editor renders the
// SAME sandboxed ThemeRuntime frame (`ThemeWidgetPreview` in
// `ThemeRuntime.tsx`) and delivers the intended component id + validated
// instance data to the OWNED frame as this versioned envelope. Validation
// layers (defense in depth, none a substitute for the others):
// - The caller validates merchant props through the shared value layer
//   (`validateProps` against the def's `propsSchema`) BEFORE building.
// - This builder re-checks shape (theme-namespaced widget id, safe
//   component identifier, plain-record props), size (the same 64 KiB cap
//   as bridge messages) and forbidden fields (price/tenant/payment —
//   `findForbiddenFields`, same table as frame → host calls).
// - The frame treats the envelope as untrusted render input; every commerce
//   action still revalidates server-side (SERVER CONTRACT above).
// Never throws — malformed input maps to a `theme.*` error.

/** Host → frame render instruction for one theme-owned widget instance. */
export const THEME_PREVIEW_MESSAGE = "fq:theme-preview";

/** Preview payloads share the bridge message size cap. */
export const THEME_PREVIEW_MAX_BYTES = THEME_MAX_MESSAGE_BYTES;

/**
 * Theme widget identity (`theme:<owner>/<section>`, mirroring the manifest
 * id + section-key shapes — never another lane's key).
 */
const THEME_PREVIEW_WIDGET_RE = /^[a-z][a-z0-9-]{2,63}\/[a-z][a-z0-9_-]{1,39}$/;
/** Section component identifier (single safe token, never a path). */
const THEME_PREVIEW_COMPONENT_RE = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;

export type ThemePreviewEnvelope = {
  v: 2;
  type: typeof THEME_PREVIEW_MESSAGE;
  widgetId: string;
  component: string;
  props: Record<string, unknown>;
};

export type ThemePreviewBuildResult =
  { ok: true; envelope: ThemePreviewEnvelope } | { ok: false; error: string };

export type ThemePreviewParseResult =
  | {
      ok: true;
      widgetId: string;
      component: string;
      props: Record<string, unknown>;
    }
  | { ok: false; error: string };

function clonePreviewProps(value: unknown):
  | {
      ok: true;
      props: Record<string, unknown>;
    }
  | { ok: false; error: string } {
  if (!isPlainRecord(value)) return { ok: false, error: "theme.malformed" };
  let raw = "";
  let clone: unknown;
  try {
    raw = JSON.stringify(value) ?? "";
    clone = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, error: "theme.malformed" };
  }
  if (utf8Length(raw) > THEME_PREVIEW_MAX_BYTES) {
    return { ok: false, error: "theme.oversize" };
  }
  if (!isPlainRecord(clone)) return { ok: false, error: "theme.malformed" };
  if (findForbiddenFields(clone).length > 0) {
    return { ok: false, error: "theme.forbidden_field" };
  }
  return { ok: true, props: clone };
}

function checkPreviewIdentity(
  widgetId: unknown,
  component: unknown,
): { ok: true; widgetId: string; component: string } | { ok: false } {
  if (typeof widgetId !== "string" || typeof component !== "string") {
    return { ok: false };
  }
  const id = widgetId.trim();
  const name = component.trim();
  if (!id.startsWith("theme:")) return { ok: false };
  if (!THEME_PREVIEW_WIDGET_RE.test(id.slice("theme:".length))) {
    return { ok: false };
  }
  if (!THEME_PREVIEW_COMPONENT_RE.test(name)) return { ok: false };
  return { ok: true, widgetId: id, component: name };
}

/**
 * Build the host → frame preview envelope for one validated widget
 * instance. `props` must already be `validateProps`-clean; this gate
 * re-checks shape/size/forbidden keys and fails closed. Never throws.
 */
export function buildThemePreviewEnvelope(
  input: unknown,
): ThemePreviewBuildResult {
  try {
    if (!isPlainRecord(input)) return { ok: false, error: "theme.malformed" };
    const identity = checkPreviewIdentity(input.widgetId, input.component);
    if (!identity.ok) return { ok: false, error: "theme.malformed" };
    const props = clonePreviewProps(input.props);
    if (!props.ok) return { ok: false, error: props.error };
    return {
      ok: true,
      envelope: {
        v: THEME_BRIDGE_VERSION,
        type: THEME_PREVIEW_MESSAGE,
        widgetId: identity.widgetId,
        component: identity.component,
        props: props.props,
      },
    };
  } catch {
    return { ok: false, error: "theme.malformed" };
  }
}

/**
 * Parse a received preview envelope (frame-side / test-side mirror of the
 * builder). Version, type, identity and payload gates match the builder;
 * anything else is a `theme.*` refusal. Never throws.
 */
export function parseThemePreviewEnvelope(
  msg: unknown,
): ThemePreviewParseResult {
  try {
    if (!isPlainRecord(msg)) return { ok: false, error: "theme.malformed" };
    if (msg.v !== THEME_BRIDGE_VERSION || msg.type !== THEME_PREVIEW_MESSAGE) {
      return { ok: false, error: "theme.malformed" };
    }
    const identity = checkPreviewIdentity(msg.widgetId, msg.component);
    if (!identity.ok) return { ok: false, error: "theme.malformed" };
    const props = clonePreviewProps(msg.props);
    if (!props.ok) return { ok: false, error: props.error };
    return {
      ok: true,
      widgetId: identity.widgetId,
      component: identity.component,
      props: props.props,
    };
  } catch {
    return { ok: false, error: "theme.malformed" };
  }
}
