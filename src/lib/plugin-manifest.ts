/**
 * Phase 5 — plugin manifest, contribution API and compatibility rules.
 *
 * Pure module: no network, no database, no React. Everything here is a
 * decision the host, the review pipeline and the sandbox must all agree on,
 * so it lives once and is unit-tested.
 *
 * The core widget registry stays a closed enum. Plugins contribute widgets in
 * a *namespaced tier* — `plugin:{pluginId}/{widget}` — which the builder
 * renders through one sandboxed island (`plugin_block`), never as a new core
 * renderer branch.
 */

import {
  MENU_REPLACE_SCOPE,
  MENU_SLOTS,
  isMenuSlot,
  normalizeScopes,
  type MenuSlot,
} from "./marketplace-scopes";
import { compareSemver, parseSemver } from "./marketplace-scopes";
import {
  normalizeThemeContract,
  type PluginThemeContract,
} from "./plugin-theme-contract";
import { scanJsAst } from "./plugin-js-scan";
import { PROP_KINDS } from "./widget-props";
import type { PropField as WidgetPropField, JsonValue } from "./widget-props";
export { MENU_SLOTS, isMenuSlot, type MenuSlot };

/** Builder API version plugins declare compatibility against (AST v3 line). */
export const BUILDER_API_VERSION = "3.1.0";

/** Per-plugin resource ceiling. Exceeding it downgrades to a placeholder. */
export const PLUGIN_BUDGET = { jsKb: 120, mainThreadMs: 50 } as const;

/** Documented server extension points. A manifest may not invent hooks. */
export const SERVER_HOOKS = [
  "cart.calculate",
  "checkout.validate",
  "order.created",
  "product.saved",
] as const;
export type ServerHook = (typeof SERVER_HOOKS)[number];

export const BLOCK_SLOTS = ["header", "main", "footer"] as const;
export type BlockSlot = (typeof BLOCK_SLOTS)[number];

/**
 * TRACK M — menu replacement API (approved shapes 1+2; theme-only formal
 * override stays roadmap/untouched).
 *
 * Shape 1 (fill): a widget may target `menu_bar` / `menu_dropdown` /
 * `menu_drawer`. Data contract is rows in, markup out — the engine keeps
 * layout/a11y control at every fill point and renders all nav markup itself;
 * the plugin only supplies rows through the `menus.list` sandbox bridge
 * (see `marketplace-scopes.ts`). No new server hook exists for menus:
 * `SERVER_HOOKS` above is unchanged by design.
 *
 * Shape 2 (swap): a plugin may register a complete nav renderer, but it
 * only wins behind BOTH `replace_menus` scope AND an explicit review
 * approval flag (`decideMenuRenderer`). Any failure renders the theme
 * default (fail-open, logged via `renderMenuWithFallback`).
 */

/** A plugin's claim to replace one nav slot's renderer. */
export type MenuRendererClaim = {
  pluginId: string;
  slot: MenuSlot;
  /** Sandboxed bundle entry — never raw HTML into the nav landmark. */
  entry: string;
  /** Explicit review approval. `false`/absent keeps the theme default. */
  reviewApproved: boolean;
};

export function isMenuRendererClaim(
  value: unknown,
): value is MenuRendererClaim {
  const r = (value ?? {}) as Record<string, unknown>;
  return (
    typeof r.pluginId === "string" &&
    r.pluginId.length > 0 &&
    isMenuSlot(r.slot) &&
    typeof r.entry === "string" &&
    r.entry.length > 0 &&
    typeof r.reviewApproved === "boolean"
  );
}

export type MenuRendererDecision =
  | {
      kind: "plugin";
      pluginId: string;
      slot: MenuSlot;
    }
  | {
      kind: "theme_default";
      reason:
        "not_claimed" | "not_approved" | "scope_denied" | "renderer_failed";
      pluginId?: string;
    };

/**
 * Review gate for a full nav renderer swap. First claim for the slot wins;
 * it renders only when review-approved AND the install grants
 * `replace_menus`. Every other outcome is the theme default (fail-open).
 */
export function decideMenuRenderer(
  claims: readonly MenuRendererClaim[] | null | undefined,
  slot: MenuSlot,
  granted: readonly string[] | null | undefined,
): MenuRendererDecision {
  // Fail-open on malformed input too: anything unexpected is the theme default.
  const list = Array.isArray(claims) ? claims : [];
  const scopes = Array.isArray(granted) ? granted : [];
  const claim = list.find((c) => c?.slot === slot);
  if (!claim) return { kind: "theme_default", reason: "not_claimed" };
  if (claim.reviewApproved !== true)
    return {
      kind: "theme_default",
      reason: "not_approved",
      pluginId: claim.pluginId,
    };
  if (!scopes.includes(MENU_REPLACE_SCOPE))
    return {
      kind: "theme_default",
      reason: "scope_denied",
      pluginId: claim.pluginId,
    };
  return { kind: "plugin", pluginId: claim.pluginId, slot };
}

/**
 * Fail-open menu render. The theme renderer runs whenever the decision is
 * not `plugin` (the plugin renderer is never attempted then), and again
 * when the plugin renderer throws — the failure is reported through
 * `onFail` (default: one tagged `console.error` line, mirroring
 * `reportWidgetError`) and the shopper still gets navigation.
 */
export function renderMenuWithFallback<T>(
  decision: MenuRendererDecision,
  renderPlugin: () => T,
  renderTheme: () => T,
  onFail?: (error: unknown, decision: MenuRendererDecision) => void,
): T {
  if (decision.kind !== "plugin") return renderTheme();
  try {
    return renderPlugin();
  } catch (error) {
    const failed: MenuRendererDecision = {
      kind: "theme_default",
      reason: "renderer_failed",
      pluginId: decision.pluginId,
    };
    if (onFail) onFail(error, failed);
    else if (typeof console !== "undefined") {
      console.error(
        new Error(
          `menu_renderer_failed:${decision.pluginId}: ${(error as Error)?.message ?? String(error)}`,
          { cause: error },
        ),
      );
    }
    return renderTheme();
  }
}

/**
 * Row selection for a swapped slot. Plugin rows win only under a `plugin`
 * decision (and when non-empty); everything else keeps the theme rows, so
 * an approved-but-empty plugin can never blank the navigation.
 */
export function selectMenuSwapRows<T>(
  themeRows: readonly T[],
  pluginRows: readonly T[] | null | undefined,
  decision: MenuRendererDecision,
): readonly T[] {
  if (decision.kind !== "plugin") return themeRows;
  return pluginRows && pluginRows.length > 0 ? pluginRows : themeRows;
}

/**
 * What a renderer mount point accepts for a slot swap. `claims` carries the
 * review approval flag, `grantedScopes` the install's scopes; rows flow
 * through the engine-owned markup either as `pluginRows` or from a
 * `renderRows` seam (the review/test harness — throwing keeps the theme
 * rows, fail-open). `onError` overrides the default tagged `console.error`.
 */
export type MenuSwapRequest<T> = {
  claims: readonly MenuRendererClaim[];
  grantedScopes: readonly string[];
  pluginRows?: readonly T[];
  renderRows?: () => readonly T[];
  onError?: (error: unknown) => void;
};

/** Light shape guard for swap requests arriving over loosely-typed pipes. */
export function isMenuSwapRequest(
  value: unknown,
): value is MenuSwapRequest<unknown> {
  const r = (value ?? {}) as Record<string, unknown>;
  return (
    Array.isArray(r.claims) &&
    r.claims.length > 0 &&
    r.claims.every(isMenuRendererClaim) &&
    Array.isArray(r.grantedScopes)
  );
}

/**
 * One tested path for every menu mount point: gate the swap, then resolve
 * rows fail-open. Non-`plugin` decisions never invoke `renderRows` and
 * return the theme rows untouched.
 */
export function resolveMenuSwapRows<T>(
  themeRows: readonly T[],
  swap: MenuSwapRequest<T> | null | undefined,
  slot: MenuSlot,
): { rows: readonly T[]; decision: MenuRendererDecision } {
  const decision = decideMenuRenderer(swap?.claims, slot, swap?.grantedScopes);
  if (decision.kind !== "plugin") return { rows: themeRows, decision };
  const rows = renderMenuWithFallback(
    decision,
    () => {
      const out =
        typeof swap?.renderRows === "function"
          ? swap.renderRows()
          : swap?.pluginRows;
      const list = Array.isArray(out) ? out : [];
      return list.length > 0 ? list : themeRows;
    },
    () => themeRows,
    swap?.onError,
  );
  return { rows, decision };
}

export type SettingKind =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "textarea"
  | "color"
  | "media"
  | "url"
  | "date";
export type SettingField = {
  key: string;
  label: string;
  kind: SettingKind;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  default?: string | number | boolean;
};

export type PluginWidgetRendering = "isolated" | "themeable";

/**
 * Frame30 contract — data requirements for one widget. `source` names the
 * host-provided data source the widget reads (validated as a `KEY_RE`
 * identifier, never a URL or code); `params` are JSON-cloneable query
 * hints (bounded count, identifier keys). Class A (isolated) widgets
 * declare none; Class B may declare the rows the theme dresses.
 */
export type PluginWidgetDataRequirement = {
  source: string;
  params?: Record<string, JsonValue>;
};

/**
 * Frame30 contract — responsive + styling capabilities. `responsive` claims
 * the widget adapts across breakpoints; `styling` is `tokens` only when the
 * widget dresses in host theme tokens, else `isolated` (bundle owns its
 * pixels inside the sandbox frame). Closed enum — capability inflation via
 * invented strings fails the gate.
 */
export type PluginWidgetCapabilities = {
  responsive?: boolean;
  styling?: "isolated" | "tokens";
};

/**
 * Frame30 contract — theme compatibility. `themes` absent means every
 * theme; present is an allow-list of theme keys. `minBuilderApi` floors the
 * builder API the widget needs (semver, checked at resolve time against the
 * running API — never silently substituted).
 */
export type PluginWidgetThemeCompatibility = {
  themes?: string[];
  minBuilderApi?: string;
};

export type PluginWidgetDef = {
  key: string;
  label: string;
  /** Block slots plus the sanctioned menu fill points (`MENU_SLOTS`). */
  slots: (BlockSlot | MenuSlot)[];
  /** Sandboxed bundle entry evaluated inside the island's null-origin frame. */
  entry: string;
  /**
   * Class B (themeable): the versioned theme-safe contract
   * (schema/data/actions/slots/states) the theme dresses. Absent means
   * Class A (isolated): the bundle owns arbitrary UI in the sandbox frame.
   */
  themeable?: PluginThemeContract;
  height?: number;
  /**
   * Floating widgets (chat bubbles) are hosted by the parent in a
   * viewport-fixed 56px frame. The entry must render in-flow (fill the
   * frame) — `position:fixed` inside the entry resolves against the tiny
   * iframe viewport, never the page, and renders clipped/invisible.
   */
  floating?: boolean;
  /**
   * Frame30 — optional per-widget props schema. Each entry is exactly one
   * value-layer `PropField` (`src/lib/widget-props.ts` — same 22-kind
   * closed set, never extended here), so whatever the gate accepts always
   * validates end-to-end through `validateProps`/`defaultsFor`. Absent (or
   * explicitly `[]`) keeps the legacy path: the adapter emits
   * `defaults: {}` + `propsSchema: { fields: [] }` exactly as before.
   */
  propsSchema?: PluginWidgetPropField[];
  /**
   * Frame30 — optional per-widget default props, merged over the
   * schema-derived defaults by the adapter (`fromPluginManifest`). Keys
   * outside `propsSchema` are stripped there (the value layer drops unknown
   * keys), so without a schema this carries nothing — legacy `{}`.
   */
  defaultProps?: Record<string, JsonValue>;
  /**
   * Frame30 contract — per-widget semver. Absent at the gate keeps the
   * legacy path (the adapter falls back to the manifest version, so every
   * registry def still carries a concrete version). Present must be valid
   * semver, else `widgets[i].version`.
   */
  version?: string;
  /**
   * Frame30 contract — widget category for tray grouping. Absent keeps the
   * legacy adapter default (`plugin`). Present must be a non-empty
   * 1–40-char label, else `widgets[i].category`.
   */
  category?: string;
  /**
   * Frame30 contract — rendering mode. Absent derives from the `themeable`
   * presence (`themeable` ⇒ `themeable`, else `isolated`) so legacy
   * manifests stay byte-identical. Present must be the closed enum, and
   * `themeable` rendering requires the `themeable` contract, else
   * `widgets[i].rendering`.
   */
  rendering?: PluginWidgetRendering;
  /**
   * Frame30 contract — data requirements (host-provided rows). Absent means
   * none. Each entry is `{ source, params? }` (bounded, identifier sources,
   * JSON params), else `widgets[i].dataRequirements…` keyed errors.
   */
  dataRequirements?: PluginWidgetDataRequirement[];
  /**
   * Frame30 contract — action names the widget may invoke (bounded
   * identifier list). Absent means none. For Class B the themeable
   * contract's `actions` remain the dressing contract; this top-level list
   * is the widget's declared integration points.
   */
  actions?: string[];
  /**
   * Frame30 contract — named states the widget presents (bounded identifier
   * list). Absent means none.
   */
  states?: string[];
  /**
   * Frame30 contract — responsive + styling capabilities. Absent means
   * `{ responsive: false, styling: "isolated" }` at the adapter (legacy
   * isolated default). Present must use only the closed members, else
   * `widgets[i].capabilities…` keyed errors.
   */
  capabilities?: PluginWidgetCapabilities;
  /**
   * Frame30 contract — theme compatibility. Absent means every theme at the
   * running builder API. Present allow-lists theme keys and/or floors the
   * builder API, else `widgets[i].themeCompatibility…` keyed errors.
   */
  themeCompatibility?: PluginWidgetThemeCompatibility;
};

/**
 * Frame30 — one per-widget props field. This is an alias, not a copy, of
 * the value-layer `PropField`, so the manifest gate and
 * `validateProps`/`defaultsFor` can never disagree about the shape or the
 * closed kind set. Do not widen this alias: a new control kind ships in
 * `widget-props.ts` first.
 */
export type PluginWidgetPropField = WidgetPropField;

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: { name: string; email?: string; url?: string } | string;
  homepage?: string;
  /** Semver range against BUILDER_API_VERSION, e.g. `^3.0.0` or `>=3.0.0 <4.0.0`. */
  api: string;
  permissions: string[];
  widgets: PluginWidgetDef[];
  hooks: ServerHook[];
  /** HTTPS endpoint the queued server hooks POST to. Required when hooks[] is set. */
  hooksUrl?: string;
  settings: SettingField[];
  i18n: { en: Record<string, string>; bn: Record<string, string> };
  budget: { jsKb: number; mainThreadMs: number };
};

const ID_RE = /^[a-z][a-z0-9-]{2,39}$/;
const KEY_RE = /^[a-z][a-z0-9_-]{1,39}$/;

/**
 * Structural dynamic-code pattern for manifest widget entries. Exported (not
 * duplicated) so the AST deep check (`plugin-js-scan.ts`) reuses this exact
 * pattern for its regex pre-pass; the gate below keeps testing it first.
 */
export const MANIFEST_ENTRY_DYNAMIC_CODE_RE =
  /\bimport\s*\(|\beval\s*\(|new\s+Function|\bimport\b(?!\s*\()|\bexport\s+[^;]*\bfrom\s+['"]/;

export function pluginWidgetKey(pluginId: string, widget: string) {
  return `plugin:${pluginId}/${widget}`;
}

export function parsePluginWidgetKey(
  key: string,
): { pluginId: string; widget: string } | null {
  const m = /^plugin:([a-z][a-z0-9-]{2,39})\/([a-z][a-z0-9_-]{1,39})$/.exec(
    key.trim(),
  );
  return m ? { pluginId: m[1], widget: m[2] } : null;
}

// ------------------------------------------------------------ compatibility

/**
 * Exact pinned builder API (`3.1.0`): the strongest compatibility claim — the
 * package was built against exactly this API line. Single home for the exact
 * shape: `satisfiesApiRange` admits it below and `minApiFromRange`
 * (`unified-widget-registry.ts`) delegates here for the floor it records, so
 * the two can never disagree about what an exact pin means.
 */
export function exactApiVersion(range: string): string | undefined {
  const trimmed = range.trim();
  return /^\d+\.\d+\.\d+$/.test(trimmed) ? trimmed : undefined;
}

/**
 * Supports `^x.y.z`, `>=a.b.c <d.e.f`, and exact pins (`x.y.z`).
 *
 * Exact pins admit ONLY the pinned line: a manifest built for exactly the
 * running API is compatible (the common authored case — pin what you built
 * against), anything else fails closed. This matches the `minApiFromRange`
 * floor the plugin adapter records: both read the pin through
 * `exactApiVersion`, so filter-time (`resolvePluginWidget`,
 * `pluginTrayEntries`, `InstalledApps`) and resolve-time (`minBuilderApi`)
 * agree.
 */
export function satisfiesApiRange(
  range: string,
  api = BUILDER_API_VERSION,
): boolean {
  const target = parseSemver(api);
  if (!target) return false;
  const exact = exactApiVersion(range);
  if (exact) return compareSemver(api, exact) === 0;
  const caret = /^\^(\d+\.\d+\.\d+)$/.exec(range.trim());
  if (caret) {
    const base = parseSemver(caret[1]);
    if (!base) return false;
    return base.major === target.major && compareSemver(api, caret[1]) >= 0;
  }
  const pair = /^>=\s*(\d+\.\d+\.\d+)\s+<\s*(\d+\.\d+\.\d+)$/.exec(
    range.trim(),
  );
  if (pair) {
    return compareSemver(api, pair[1]) >= 0 && compareSemver(api, pair[2]) < 0;
  }
  return false;
}

// --------------------------------------------------------------- validation

export type ManifestVerdict =
  | { ok: true; manifest: PluginManifest; warnings: string[] }
  | { ok: false; errors: string[] };

function settingField(
  raw: unknown,
  errors: string[],
  index: number,
): SettingField | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const key = String(r.key ?? "");
  if (HOSTILE_KEYS.has(key) || !KEY_RE.test(key)) {
    errors.push(`settings[${index}].key`);
    return null;
  }
  const kind = String(r.kind ?? "text") as SettingKind;
  if (
    ![
      "text",
      "number",
      "boolean",
      "select",
      "textarea",
      "color",
      "media",
      "url",
      "date",
    ].includes(kind)
  ) {
    errors.push(`settings[${index}].kind`);
    return null;
  }
  const options = Array.isArray(r.options)
    ? r.options
        .map((o) => o as Record<string, unknown>)
        .filter((o) => typeof o?.value === "string")
        .map((o) => ({
          value: String(o.value),
          label: String(o.label ?? o.value),
        }))
    : undefined;
  if (kind === "select" && (!options || options.length === 0)) {
    errors.push(`settings[${index}].options`);
    return null;
  }
  return {
    key,
    label: String(r.label ?? key).slice(0, 80),
    kind,
    options,
    min: typeof r.min === "number" ? r.min : undefined,
    max: typeof r.max === "number" ? r.max : undefined,
    default: ["string", "number", "boolean"].includes(typeof r.default)
      ? (r.default as string | number | boolean)
      : undefined,
  };
}

/**
 * Frame30 — per-widget schema validation (mirrors `settingField` above).
 *
 * Same contract style: bad keys/kinds/options are rejected with keyed
 * errors (`<base>[<j>].key`, `…kind`, `…options`, nested `…fields[<k>]…`,
 * `…showWhen`, `…<unknownKey>`), duplicates are skipped silently
 * first-wins (exactly like manifest-level `settings`), and the returned
 * fields are fresh allow-listed clones. Differences from `settingField`
 * are deliberate and pinned: the kind set is the value-layer's closed
 * 22-kind `PROP_KINDS` (a widget schema must express repeaters/images,
 * which manifest settings never do), nested `fields` recurse for
 * `repeater`/`group` rows, and `default` accepts any JSON-cloneable value
 * (structural defaults like repeater rows) instead of only
 * string/number/boolean.
 */

const PLUGIN_WIDGET_KEYS: ReadonlySet<string> = new Set([
  "key",
  "label",
  "slots",
  "entry",
  "themeable",
  "height",
  "floating",
  "propsSchema",
  "defaultProps",
  "version",
  "category",
  "rendering",
  "dataRequirements",
  "actions",
  "states",
  "capabilities",
  "themeCompatibility",
]);

/**
 * Frame30 contract caps (adversarial bounds). Oversized declarations fail
 * the gate with keyed errors — never truncated, never stored.
 */
export const PLUGIN_WIDGET_MAX_SCHEMA_FIELDS = 50;
export const PLUGIN_WIDGET_MAX_DEFAULT_BYTES = 32768;
export const PLUGIN_WIDGET_MAX_LIST_ITEMS = 32;
export const PLUGIN_WIDGET_MAX_NAME_LEN = 64;
export const PLUGIN_WIDGET_MAX_DATA_REQUIREMENTS = 8;
export const PLUGIN_WIDGET_MAX_THEMES = 32;
export const PLUGIN_WIDGET_MAX_NESTING_DEPTH = 3;
export const PLUGIN_WIDGET_MAX_OPTIONS = 32;

/** Prototype-pollution keys: never valid as widget/field/setting keys. */
const HOSTILE_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

const THEME_KEY_RE = /^[a-z0-9-]{1,64}$/;
const ACTION_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/;
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * Frame30 contract patterns — single source for the registry adapter.
 * The registry imports these (no parallel copies) so the gate and
 * `sanitizeDef` cannot disagree about version/action/theme shapes.
 * `FIELD_KEY_RE` stays registry-local (it allows camelCase AST keys the
 * manifest gate rejects by design — documented above).
 */
export const PLUGIN_CONTRACT_PATTERNS = {
  THEME_KEY_RE,
  ACTION_NAME_RE,
  VERSION_RE,
} as const;

const PLUGIN_PROP_FIELD_KEYS: ReadonlySet<string> = new Set([
  "key",
  "label",
  "help",
  "kind",
  "required",
  "default",
  "options",
  "min",
  "max",
  "fields",
  "showWhen",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cloneWidgetJson(value: unknown): JsonValue | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return undefined;
  }
  return isJsonValue(parsed) ? parsed : undefined;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (t === "object") {
    if (!isPlainRecord(value)) return false;
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

function pluginPropField(
  raw: unknown,
  errors: string[],
  path: string,
  depth = 0,
): PluginWidgetPropField | null {
  if (!isPlainRecord(raw)) {
    errors.push(path);
    return null;
  }
  if (depth > PLUGIN_WIDGET_MAX_NESTING_DEPTH) {
    errors.push(`${path}.fields`);
    return null;
  }
  for (const k of Object.keys(raw)) {
    if (!PLUGIN_PROP_FIELD_KEYS.has(k)) {
      errors.push(`${path}.${k}`);
      return null;
    }
  }
  const key = typeof raw.key === "string" ? raw.key : "";
  if (HOSTILE_KEYS.has(key) || !KEY_RE.test(key)) {
    errors.push(`${path}.key`);
    return null;
  }
  const kind = typeof raw.kind === "string" ? raw.kind : "";
  if (!(PROP_KINDS as readonly string[]).includes(kind)) {
    errors.push(`${path}.kind`);
    return null;
  }
  const field: PluginWidgetPropField = {
    key,
    label: String(raw.label ?? key).slice(0, 80),
    kind: kind as PluginWidgetPropField["kind"],
  };
  if (typeof raw.help === "string") field.help = raw.help;
  if (typeof raw.required === "boolean") field.required = raw.required;
  if (raw.options !== undefined) {
    if (!Array.isArray(raw.options)) {
      errors.push(`${path}.options`);
      return null;
    }
    if (raw.options.length > PLUGIN_WIDGET_MAX_OPTIONS) {
      errors.push(`${path}.options`);
      return null;
    }
    const options: { value: string; label: string }[] = [];
    for (const o of raw.options) {
      if (!isPlainRecord(o) || typeof o.value !== "string") {
        errors.push(`${path}.options`);
        return null;
      }
      if (HOSTILE_KEYS.has(o.value)) {
        errors.push(`${path}.options`);
        return null;
      }
      options.push({
        value: o.value.slice(0, 120),
        label:
          typeof o.label === "string"
            ? o.label.slice(0, 120)
            : o.value.slice(0, 120),
      });
    }
    field.options = options;
  }
  if (
    field.kind === "select" &&
    (!field.options || field.options.length === 0)
  ) {
    errors.push(`${path}.options`);
    return null;
  }
  if (typeof raw.min === "number") field.min = raw.min;
  if (typeof raw.max === "number") field.max = raw.max;
  if (raw.default !== undefined) {
    const d = cloneWidgetJson(raw.default);
    if (d !== undefined) field.default = d;
  }
  if (raw.fields !== undefined) {
    if (!Array.isArray(raw.fields)) {
      errors.push(`${path}.fields`);
      return null;
    }
    if (raw.fields.length > PLUGIN_WIDGET_MAX_SCHEMA_FIELDS) {
      errors.push(`${path}.fields`);
      return null;
    }
    const nested: PluginWidgetPropField[] = [];
    const seen = new Set<string>();
    raw.fields.forEach((child, k) => {
      const clean = pluginPropField(
        child,
        errors,
        `${path}.fields[${k}]`,
        depth + 1,
      );
      if (clean && !seen.has(clean.key)) {
        seen.add(clean.key);
        nested.push(clean);
      }
    });
    field.fields = nested;
  }
  if (raw.showWhen !== undefined) {
    if (!isPlainRecord(raw.showWhen) || typeof raw.showWhen.key !== "string") {
      errors.push(`${path}.showWhen`);
      return null;
    }
    const eq = cloneWidgetJson(raw.showWhen.equals);
    if (
      eq === undefined &&
      (raw.showWhen as Record<string, unknown>).equals !== undefined
    ) {
      errors.push(`${path}.showWhen`);
      return null;
    }
    if (eq === undefined) {
      errors.push(`${path}.showWhen`);
      return null;
    }
    field.showWhen = {
      key: raw.showWhen.key,
      equals: eq,
    };
  }
  return field;
}

/**
 * Validates (and allow-list clones) a raw per-widget `propsSchema`. Shared
 * by the manifest gate (`parseManifest`) and the registry adapter
 * (`fromPluginManifest`), so hand-built `InstalledPlugin` values face the
 * exact same rules as submitted manifests. `path` is the error prefix
 * (`widgets[<i>].propsSchema` at the gate, bare `propsSchema` elsewhere).
 */
export function sanitizePluginWidgetPropsSchema(
  raw: unknown,
  path = "propsSchema",
):
  | { ok: true; fields: PluginWidgetPropField[] }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(raw)) return { ok: false, errors: [path] };
  if (raw.length > PLUGIN_WIDGET_MAX_SCHEMA_FIELDS) {
    return { ok: false, errors: [`${path}.too_many`] };
  }
  const fields: PluginWidgetPropField[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, j) => {
    const clean = pluginPropField(entry, errors, `${path}[${j}]`);
    if (clean && !seen.has(clean.key)) {
      seen.add(clean.key);
      fields.push(clean);
    }
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, fields };
}

/* --------------------------------- Frame30 contract field sanitizers -------
 *
 * One validator per new contract member. Each returns the normalized value
 * or pushes a keyed error (`widgets[i].<member>…`) and returns undefined.
 * Shared by the gate below; the registry adapter reuses the same shapes via
 * `sanitizeDef` (single-source, no parallel copies). Absent stays absent
 * (legacy byte-identical); present-but-malformed fails closed.
 */

function sanitizeWidgetVersion(
  raw: unknown,
  errors: string[],
  index: number,
): string | undefined {
  if (raw === undefined) return undefined;
  const v = String(raw).trim();
  if (!VERSION_RE.test(v)) {
    errors.push(`widgets[${index}].version`);
    return undefined;
  }
  return v;
}

function sanitizeWidgetCategory(
  raw: unknown,
  errors: string[],
  index: number,
): string | undefined {
  if (raw === undefined) return undefined;
  const c = String(raw).trim().slice(0, 40);
  if (!c) {
    errors.push(`widgets[${index}].category`);
    return undefined;
  }
  return c;
}

function sanitizeWidgetRendering(
  raw: unknown,
  themeable: PluginThemeContract | undefined,
  errors: string[],
  index: number,
): PluginWidgetRendering | undefined {
  if (raw === undefined) return undefined;
  if (raw !== "isolated" && raw !== "themeable") {
    errors.push(`widgets[${index}].rendering`);
    return undefined;
  }
  if (raw === "themeable" && !themeable) {
    errors.push(`widgets[${index}].rendering`);
    return undefined;
  }
  return raw;
}

function sanitizeNameList(
  raw: unknown,
  base: string,
  errors: string[],
): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    errors.push(base);
    return undefined;
  }
  if (raw.length > PLUGIN_WIDGET_MAX_LIST_ITEMS) {
    errors.push(base);
    return undefined;
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") {
      errors.push(base);
      return undefined;
    }
    const name = item.trim();
    if (
      !name ||
      name.length > PLUGIN_WIDGET_MAX_NAME_LEN ||
      HOSTILE_KEYS.has(name) ||
      !ACTION_NAME_RE.test(name)
    ) {
      errors.push(base);
      return undefined;
    }
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

function sanitizeDataRequirements(
  raw: unknown,
  errors: string[],
  index: number,
): PluginWidgetDataRequirement[] | undefined {
  const base = `widgets[${index}].dataRequirements`;
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    errors.push(base);
    return undefined;
  }
  if (raw.length > PLUGIN_WIDGET_MAX_DATA_REQUIREMENTS) {
    errors.push(base);
    return undefined;
  }
  const out: PluginWidgetDataRequirement[] = [];
  for (let k = 0; k < raw.length; k++) {
    const r = (raw[k] ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(r)) {
      if (key !== "source" && key !== "params") {
        errors.push(`${base}[${k}].${key}`);
        return undefined;
      }
    }
    const source = typeof r.source === "string" ? r.source.trim() : "";
    if (
      !source ||
      HOSTILE_KEYS.has(source) ||
      !KEY_RE.test(source) ||
      source.length > PLUGIN_WIDGET_MAX_NAME_LEN
    ) {
      errors.push(base);
      return undefined;
    }
    let params: Record<string, JsonValue> | undefined;
    if (r.params !== undefined) {
      if (!isPlainRecord(r.params)) {
        errors.push(`${base}[${k}].params`);
        return undefined;
      }
      const entries = Object.entries(r.params);
      if (entries.length > PLUGIN_WIDGET_MAX_LIST_ITEMS) {
        errors.push(`${base}[${k}].params`);
        return undefined;
      }
      for (const [pk] of entries) {
        if (HOSTILE_KEYS.has(pk) || !KEY_RE.test(pk)) {
          errors.push(`${base}[${k}].params`);
          return undefined;
        }
      }
      const cloned = cloneWidgetJson(r.params);
      if (!cloned || typeof cloned !== "object" || Array.isArray(cloned)) {
        errors.push(`${base}[${k}].params`);
        return undefined;
      }
      params = cloned as Record<string, JsonValue>;
    }
    out.push(params ? { source, params } : { source });
  }
  return out;
}

function sanitizeCapabilities(
  raw: unknown,
  errors: string[],
  index: number,
): PluginWidgetCapabilities | undefined {
  const base = `widgets[${index}].capabilities`;
  if (raw === undefined) return undefined;
  if (!isPlainRecord(raw)) {
    errors.push(base);
    return undefined;
  }
  for (const key of Object.keys(raw)) {
    if (key !== "responsive" && key !== "styling") {
      errors.push(`${base}.${key}`);
      return undefined;
    }
  }
  const out: PluginWidgetCapabilities = {};
  if (raw.responsive !== undefined) {
    if (typeof raw.responsive !== "boolean") {
      errors.push(`${base}.responsive`);
      return undefined;
    }
    out.responsive = raw.responsive;
  }
  if (raw.styling !== undefined) {
    if (raw.styling !== "isolated" && raw.styling !== "tokens") {
      errors.push(`${base}.styling`);
      return undefined;
    }
    out.styling = raw.styling;
  }
  return out;
}

function sanitizeThemeCompatibility(
  raw: unknown,
  errors: string[],
  index: number,
): PluginWidgetThemeCompatibility | undefined {
  const base = `widgets[${index}].themeCompatibility`;
  if (raw === undefined) return undefined;
  if (!isPlainRecord(raw)) {
    errors.push(base);
    return undefined;
  }
  for (const key of Object.keys(raw)) {
    if (key !== "themes" && key !== "minBuilderApi") {
      errors.push(`${base}.${key}`);
      return undefined;
    }
  }
  const out: PluginWidgetThemeCompatibility = {};
  if (raw.themes !== undefined) {
    if (!Array.isArray(raw.themes)) {
      errors.push(`${base}.themes`);
      return undefined;
    }
    if (
      raw.themes.length === 0 ||
      raw.themes.length > PLUGIN_WIDGET_MAX_THEMES
    ) {
      errors.push(`${base}.themes`);
      return undefined;
    }
    const themes: string[] = [];
    const seen = new Set<string>();
    for (const t of raw.themes) {
      if (typeof t !== "string") {
        errors.push(`${base}.themes`);
        return undefined;
      }
      const key = t.trim().toLowerCase();
      if (!THEME_KEY_RE.test(key)) {
        errors.push(`${base}.themes`);
        return undefined;
      }
      if (!seen.has(key)) {
        seen.add(key);
        themes.push(key);
      }
    }
    out.themes = themes;
  }
  if (raw.minBuilderApi !== undefined) {
    const v = String(raw.minBuilderApi).trim();
    if (!VERSION_RE.test(v)) {
      errors.push(`${base}.minBuilderApi`);
      return undefined;
    }
    out.minBuilderApi = v;
  }
  return out;
}

// --------------------------------------------- hooksUrl egress guard
export type HooksUrlVerdict =
  { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Server-egress guard for plugin hooksUrl.
 * Mirrors isAllowedSource (image-transform.ts:145-169) — https-only, no
 * credentials, literal-IP block — extended for open-egress webhooks with
 * private-range, localhost/metadata and wildcard-DNS blocks. The shape is
 * duplicated (not imported) because isAllowedSource enforces a host
 * allowlist while hooks allow any public host; the manifest gate and the
 * delivery guard share this one decision via import (no second copy).
 */
export function isAllowedHooksUrl(rawUrl: string): HooksUrlVerdict {
  let url: URL;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    return { ok: false, reason: "bad_url" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };
  if (url.username || url.password)
    return { ok: false, reason: "credentials_in_url" };
  const rawHost = url.hostname.toLowerCase().replace(/\.+$/, "");
  // Node keeps brackets in hostname for IPv6 ([::1]) — strip for checks.
  const host = rawHost.replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, reason: "bad_url" };
  // IPv6 literals (loopback ::1, link-local fe80::, unique-local fc00::).
  if (host.includes(":")) return { ok: false, reason: "literal_ip" };
  // IPv4 literals — all refused; private/loopback/link-local get own reason.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const o = [v4[1], v4[2], v4[3], v4[4]].map(Number);
    if (o.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      const a = o[0] as number;
      const b = o[1] as number;
      if (
        a === 10 ||
        a === 127 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254) ||
        a === 0
      )
        return { ok: false, reason: "private_range" };
      return { ok: false, reason: "literal_ip" };
    }
    return { ok: false, reason: "literal_ip" };
  }
  // Decimal/hex integer hosts and digit-dot shorthands (URL bypass attempts).
  if (
    /^\d+$/.test(host) ||
    /^0x[0-9a-f]+$/i.test(host) ||
    /^[0-9.]+$/.test(host)
  )
    return { ok: false, reason: "literal_ip" };
  // Single-label hosts never egress (localhost, metadata, intranet names).
  if (!host.includes(".")) return { ok: false, reason: "local_host" };
  if (host === "localhost" || host.endsWith(".localhost"))
    return { ok: false, reason: "local_host" };
  const labels = host.split(".");
  if (
    labels.some(
      (l) =>
        l === "metadata" || l === "instance-data" || l === "instance-metadata",
    )
  )
    return { ok: false, reason: "metadata_host" };
  if (host === "host.docker.internal" || host.endsWith(".host.docker.internal"))
    return { ok: false, reason: "metadata_host" };
  const PRIVATE_SUFFIXES = [
    ".internal",
    ".local",
    ".lan",
    ".home",
    ".corp",
    ".intranet",
    ".invalid",
    ".localdomain",
    ".home.arpa",
  ];
  if (PRIVATE_SUFFIXES.some((s) => host.endsWith(s)))
    return { ok: false, reason: "private_range" };
  // Wildcard-DNS rebinding services (xip.io style embeds the target IP).
  const WILDCARD_SUFFIXES = [
    "xip.io",
    "nip.io",
    "sslip.io",
    "localtest.me",
    "lvh.me",
  ];
  if (WILDCARD_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`)))
    return { ok: false, reason: "wildcard_dns" };
  // Embedded IPv4 in hostname (dotted or dashed), e.g. 127.0.0.1.evil.com.
  if (
    /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(host) ||
    /\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3}/.test(host)
  )
    return { ok: false, reason: "wildcard_dns" };
  return { ok: true, url };
}

/** The single gate the review pipeline, install flow and host all run. */
export function parseManifest(input: unknown): ManifestVerdict {
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw = (input ?? {}) as Record<string, unknown>;

  const id = String(raw.id ?? "")
    .trim()
    .toLowerCase();
  if (!ID_RE.test(id)) errors.push("id");

  const version = String(raw.version ?? "").trim();
  if (!parseSemver(version)) errors.push("version");

  const api = String(raw.api ?? "").trim();
  if (!api) errors.push("api");

  const { scopes, unknown } = normalizeScopes(raw.permissions);
  if (unknown.length) errors.push(`permissions:${unknown.join(",")}`);

  const hooks: ServerHook[] = [];
  for (const h of Array.isArray(raw.hooks) ? raw.hooks : []) {
    const key = String(h);
    if ((SERVER_HOOKS as readonly string[]).includes(key)) {
      if (!hooks.includes(key as ServerHook)) hooks.push(key as ServerHook);
    } else errors.push(`hooks:${key}`);
  }

  const hooksUrl = typeof raw.hooksUrl === "string" ? raw.hooksUrl.trim() : "";
  if (hooks.length) {
    if (!/^https:\/\/[^\s]+$/.test(hooksUrl)) errors.push("hooksUrl");
    else if (!isAllowedHooksUrl(hooksUrl).ok) errors.push("hooksUrl");
  }

  const widgets: PluginWidgetDef[] = [];
  const rawWidgets = Array.isArray(raw.widgets) ? raw.widgets : [];
  rawWidgets.forEach((w, i) => {
    const r = (w ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(r)) {
      if (!PLUGIN_WIDGET_KEYS.has(k)) {
        errors.push(`widgets[${i}].${k}`);
        return;
      }
    }
    const key = String(r.key ?? "");
    if (HOSTILE_KEYS.has(key) || !KEY_RE.test(key)) {
      errors.push(`widgets[${i}].key`);
      return;
    }
    const slots = (Array.isArray(r.slots) ? r.slots : [])
      .map(String)
      .filter(
        (s): s is BlockSlot | MenuSlot =>
          (BLOCK_SLOTS as readonly string[]).includes(s) ||
          (MENU_SLOTS as readonly string[]).includes(s),
      );
    if (slots.length === 0) {
      errors.push(`widgets[${i}].slots`);
      return;
    }
    const entry = typeof r.entry === "string" ? r.entry : "";
    if (!entry) {
      errors.push(`widgets[${i}].entry`);
      return;
    }
    if (MANIFEST_ENTRY_DYNAMIC_CODE_RE.test(entry)) {
      errors.push(`widgets[${i}].entry.dynamic_code`);
      return;
    }
    if (!scanJsAst(entry).ok) {
      // Second stage: AST deep check for aliased/obfuscated dynamic code the
      // regex misses. Same failure code so every existing assertion holds.
      errors.push(`widgets[${i}].entry.dynamic_code`);
      return;
    }
    // Class B (themeable): the declaration is optional, but when present it
    // must be a well-formed v1 contract — malformed declarations fail the
    // gate instead of silently rendering as Class A.
    let themeable: PluginThemeContract | undefined;
    if (r.themeable !== undefined) {
      const contract = normalizeThemeContract(r.themeable);
      if (!contract) {
        errors.push(`widgets[${i}].themeable`);
        return;
      }
      themeable = contract;
    }
    if (widgets.some((x) => x.key === key)) {
      errors.push(`widgets[${i}].duplicate`);
      return;
    }
    let propsSchema: PluginWidgetPropField[] | undefined;
    if (r.propsSchema !== undefined) {
      const checked = sanitizePluginWidgetPropsSchema(
        r.propsSchema,
        `widgets[${i}].propsSchema`,
      );
      if (!checked.ok) {
        errors.push(...checked.errors);
        return;
      }
      propsSchema = checked.fields;
    }
    let defaultProps: Record<string, JsonValue> | undefined;
    if (r.defaultProps !== undefined) {
      if (!isPlainRecord(r.defaultProps)) {
        errors.push(`widgets[${i}].defaultProps`);
        return;
      }
      for (const dk of Object.keys(r.defaultProps)) {
        if (HOSTILE_KEYS.has(dk)) {
          errors.push(`widgets[${i}].defaultProps`);
          return;
        }
      }
      const cloned = cloneWidgetJson(r.defaultProps);
      if (!cloned || typeof cloned !== "object" || Array.isArray(cloned)) {
        errors.push(`widgets[${i}].defaultProps`);
        return;
      }
      const bytes = JSON.stringify(cloned).length;
      if (bytes > PLUGIN_WIDGET_MAX_DEFAULT_BYTES) {
        errors.push(`widgets[${i}].defaultProps`);
        return;
      }
      defaultProps = cloned as Record<string, JsonValue>;
    }
    // Frame30 contract members — absent stays absent (legacy byte-identical);
    // present-but-malformed fails this widget with a keyed error.
    const widgetVersion = sanitizeWidgetVersion(r.version, errors, i);
    if (r.version !== undefined && widgetVersion === undefined) return;
    const category = sanitizeWidgetCategory(r.category, errors, i);
    if (r.category !== undefined && category === undefined) return;
    const rendering = sanitizeWidgetRendering(
      r.rendering,
      themeable,
      errors,
      i,
    );
    if (r.rendering !== undefined && rendering === undefined) return;
    const dataRequirements = sanitizeDataRequirements(
      r.dataRequirements,
      errors,
      i,
    );
    if (r.dataRequirements !== undefined && dataRequirements === undefined)
      return;
    const actions = sanitizeNameList(
      r.actions,
      `widgets[${i}].actions`,
      errors,
    );
    if (r.actions !== undefined && actions === undefined) return;
    const states = sanitizeNameList(r.states, `widgets[${i}].states`, errors);
    if (r.states !== undefined && states === undefined) return;
    const capabilities = sanitizeCapabilities(r.capabilities, errors, i);
    if (r.capabilities !== undefined && capabilities === undefined) return;
    const themeCompatibility = sanitizeThemeCompatibility(
      r.themeCompatibility,
      errors,
      i,
    );
    if (r.themeCompatibility !== undefined && themeCompatibility === undefined)
      return;
    widgets.push({
      key,
      label: String(r.label ?? key).slice(0, 60),
      slots,
      entry,
      ...(themeable ? { themeable } : {}),
      height:
        typeof r.height === "number"
          ? Math.min(1200, Math.max(80, r.height))
          : 320,
      ...(r.floating === true ? { floating: true as const } : {}),
      ...(propsSchema !== undefined ? { propsSchema } : {}),
      ...(defaultProps !== undefined ? { defaultProps } : {}),
      ...(widgetVersion !== undefined ? { version: widgetVersion } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(rendering !== undefined ? { rendering } : {}),
      ...(dataRequirements !== undefined ? { dataRequirements } : {}),
      ...(actions !== undefined ? { actions } : {}),
      ...(states !== undefined ? { states } : {}),
      ...(capabilities !== undefined ? { capabilities } : {}),
      ...(themeCompatibility !== undefined ? { themeCompatibility } : {}),
    });
  });
  if (
    widgets.some((w) => w.slots.length) &&
    !scopes.includes("render_storefront")
  ) {
    errors.push("permissions.render_storefront_required");
  }

  const settings: SettingField[] = [];
  (Array.isArray(raw.settings) ? raw.settings : []).forEach((s, i) => {
    const field = settingField(s, errors, i);
    if (field && !settings.some((f) => f.key === field.key))
      settings.push(field);
  });

  const i18nRaw = (raw.i18n ?? {}) as Record<string, unknown>;
  const dict = (v: unknown) => {
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(
      (v ?? {}) as Record<string, unknown>,
    )) {
      if (typeof val === "string") out[k] = val;
    }
    return out;
  };
  const i18n = { en: dict(i18nRaw.en), bn: dict(i18nRaw.bn) };
  const missingBn = Object.keys(i18n.en).filter((k) => !i18n.bn[k]);
  if (missingBn.length) warnings.push(`i18n.bn_missing:${missingBn.length}`);

  const budgetRaw = (raw.budget ?? {}) as Record<string, unknown>;
  const budget = {
    jsKb:
      typeof budgetRaw.jsKb === "number" ? budgetRaw.jsKb : PLUGIN_BUDGET.jsKb,
    mainThreadMs:
      typeof budgetRaw.mainThreadMs === "number"
        ? budgetRaw.mainThreadMs
        : PLUGIN_BUDGET.mainThreadMs,
  };
  if (budget.jsKb > PLUGIN_BUDGET.jsKb) errors.push("budget.jsKb");
  if (budget.mainThreadMs > PLUGIN_BUDGET.mainThreadMs)
    errors.push("budget.mainThreadMs");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    manifest: {
      id,
      name: String(raw.name ?? id).slice(0, 80),
      version,
      api,
      permissions: scopes,
      widgets,
      hooks,
      hooksUrl: hooksUrl || undefined,
      settings,
      i18n,
      budget,
    },
  };
}

// ------------------------------------------------------- permission diffing

export type PermissionDiff = {
  added: string[];
  removed: string[];
  /** Added permissions always require a fresh consent screen at update time. */
  requiresConsent: boolean;
};

export function permissionDiff(
  previous: readonly string[],
  next: readonly string[],
): PermissionDiff {
  const added = next.filter((p) => !previous.includes(p)).sort();
  const removed = previous.filter((p) => !next.includes(p)).sort();
  return { added, removed, requiresConsent: added.length > 0 };
}

// ----------------------------------------------------------- settings state

export type SettingsValues = Record<string, string | number | boolean>;

export function defaultSettings(
  schema: readonly SettingField[],
): SettingsValues {
  const out: SettingsValues = {};
  for (const f of schema) {
    if (f.default !== undefined) out[f.key] = f.default;
    else if (f.kind === "boolean") out[f.key] = false;
    else if (f.kind === "number") out[f.key] = f.min ?? 0;
    else if (f.kind === "select") out[f.key] = f.options?.[0]?.value ?? "";
    else out[f.key] = "";
  }
  return out;
}

/** Coerces merchant input to the declared schema; unknown keys are dropped. */
export function validateSettings(
  schema: readonly SettingField[],
  values: unknown,
): { values: SettingsValues; errors: string[] } {
  const input = (values ?? {}) as Record<string, unknown>;
  const out = defaultSettings(schema);
  const errors: string[] = [];
  for (const f of schema) {
    if (!(f.key in input)) continue;
    const v = input[f.key];
    if (f.kind === "boolean") out[f.key] = v === true || v === "true";
    else if (f.kind === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) {
        errors.push(`${f.key}.not_a_number`);
        continue;
      }
      const min = f.min ?? Number.NEGATIVE_INFINITY;
      const max = f.max ?? Number.POSITIVE_INFINITY;
      out[f.key] = Math.min(max, Math.max(min, n));
    } else if (f.kind === "select") {
      const s = String(v);
      if (!f.options?.some((o) => o.value === s)) {
        errors.push(`${f.key}.not_an_option`);
        continue;
      }
      out[f.key] = s;
    } else if (f.kind === "textarea")
      out[f.key] = String(v).slice(0, f.max ?? 2000);
    else if (f.kind === "color") {
      const s = String(v);
      if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) {
        errors.push(`${f.key}.not_a_color`);
        continue;
      }
      out[f.key] = s;
    } else if (f.kind === "media" || f.kind === "url") {
      const s = String(v);
      if (s !== "" && !/^https?:\/\//.test(s)) {
        errors.push(`${f.key}.not_a_url`);
        continue;
      }
      out[f.key] = s;
    } else if (f.kind === "date") {
      const s = String(v);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
        errors.push(`${f.key}.not_a_date`);
        continue;
      }
      out[f.key] = s;
    } else out[f.key] = String(v).slice(0, f.max ?? 500);
  }
  return { values: out, errors };
}

// --------------------------------------------------------------- host state

export type InstalledPlugin = {
  installId: string;
  manifest: PluginManifest;
  grantedScopes: string[];
  /**
   * Global (per-install) merchant config, validated by `validateSettings`
   * against the manifest `settings` schema. Structurally distinct from
   * per-instance widget props (`WidgetProps` validated by `validateProps`
   * against a widget `propsSchema`): different field types, different value
   * shapes, never merged — the adapter and the runtime keep them in separate
   * fields (`settings` vs `defaults`/`props`/`data`). See the settings-vs-
   * props separation test: cross-domain schemas fail both gates, and
   * `fromPluginManifest` never copies a settings key into `def.defaults`.
   */
  settings: SettingsValues;
  /** Merchant paused it, or the platform kill switch disabled the tenant. */
  enabled: boolean;
  /**
   * Platform suspension (kill switch / review regression / scope revoked).
   * Folded into `enabled=false` on the server read path
   * (`listInstalledPlugins`), but carried explicitly here so resolution can
   * report `suspended` (platform action) distinctly from `disabled`
   * (merchant pause) — explicit reasons, never silent substitution.
   */
  suspended?: boolean;
  /** Machine-readable suspension cause (`kill_switch`, `scope_revoked`, …). */
  suspendReason?: string;
  /** Per-install auto-updates flag (`plugin_state.auto_updates`, Task 2 column). */
  autoUpdates?: boolean;
};

export type PluginResolution =
  | { ok: true; plugin: InstalledPlugin; widget: PluginWidgetDef }
  | {
      ok: false;
      /** Every failure renders a labelled placeholder — never a crash. */
      reason:
        | "bad_key"
        | "not_installed"
        | "unknown_widget"
        | "incompatible"
        | "disabled"
        | "suspended";
      pluginId?: string;
    };

/**
 * Runtime contract validation for one installed widget: the gate-validated
 * declaration is re-checked at this boundary (version/category/rendering/
 * data/actions/states/capabilities/themeCompatibility shapes), so a
 * hand-built `InstalledPlugin` that bypassed `parseManifest` faces the same
 * rules. Returns keyed errors; never throws.
 */
export function validatePluginWidgetContract(
  widget: unknown,
  pluginId: string,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const r = (widget ?? {}) as Record<string, unknown>;
  const key = typeof r.key === "string" ? r.key : "";
  const index = 0;
  if (HOSTILE_KEYS.has(key) || !KEY_RE.test(key)) {
    return { ok: false, errors: [`widgets[0].key`] };
  }
  if (r.version !== undefined) {
    if (sanitizeWidgetVersion(r.version, errors, index) === undefined)
      return { ok: false, errors };
  }
  if (r.category !== undefined) {
    if (sanitizeWidgetCategory(r.category, errors, index) === undefined)
      return { ok: false, errors };
  }
  let themeable: PluginThemeContract | undefined;
  if (r.themeable !== undefined) {
    const contract = normalizeThemeContract(r.themeable);
    if (!contract) return { ok: false, errors: [`widgets[0].themeable`] };
    themeable = contract;
  }
  if (r.rendering !== undefined) {
    if (
      sanitizeWidgetRendering(r.rendering, themeable, errors, index) ===
      undefined
    )
      return { ok: false, errors };
  }
  if (r.dataRequirements !== undefined) {
    if (
      sanitizeDataRequirements(r.dataRequirements, errors, index) === undefined
    )
      return { ok: false, errors };
  }
  if (r.actions !== undefined) {
    if (sanitizeNameList(r.actions, `widgets[0].actions`, errors) === undefined)
      return { ok: false, errors };
  }
  if (r.states !== undefined) {
    if (sanitizeNameList(r.states, `widgets[0].states`, errors) === undefined)
      return { ok: false, errors };
  }
  if (r.capabilities !== undefined) {
    if (sanitizeCapabilities(r.capabilities, errors, index) === undefined)
      return { ok: false, errors };
  }
  if (r.themeCompatibility !== undefined) {
    if (
      sanitizeThemeCompatibility(r.themeCompatibility, errors, index) ===
      undefined
    )
      return { ok: false, errors };
  }
  if (r.propsSchema !== undefined) {
    const checked = sanitizePluginWidgetPropsSchema(
      r.propsSchema,
      `widgets[0].propsSchema`,
    );
    if (!checked.ok) return checked;
  }
  // Namespaced stability: the widget key plus its owning plugin id form the
  // stable `plugin:{pluginId}/{widget}` identity (see `pluginWidgetKey`).
  // A widget whose key parses under a different plugin id is a squat.
  if (pluginId && !ID_RE.test(pluginId.toLowerCase())) {
    return { ok: false, errors: [`widgets[0].key`] };
  }
  return { ok: true };
}

/** One resolution point for the tray, the canvas and the storefront. */
export function resolvePluginWidget(
  key: string,
  installed: readonly InstalledPlugin[],
  api = BUILDER_API_VERSION,
): PluginResolution {
  const parsed = parsePluginWidgetKey(key);
  if (!parsed) return { ok: false, reason: "bad_key" };
  const plugin = installed.find((p) => p.manifest.id === parsed.pluginId);
  if (!plugin)
    return { ok: false, reason: "not_installed", pluginId: parsed.pluginId };
  if (plugin.suspended === true)
    return { ok: false, reason: "suspended", pluginId: parsed.pluginId };
  if (!plugin.enabled)
    return { ok: false, reason: "disabled", pluginId: parsed.pluginId };
  if (!satisfiesApiRange(plugin.manifest.api, api))
    return { ok: false, reason: "incompatible", pluginId: parsed.pluginId };
  const widget = plugin.manifest.widgets.find((w) => w.key === parsed.widget);
  if (!widget)
    return { ok: false, reason: "unknown_widget", pluginId: parsed.pluginId };
  // Runtime boundary: re-validate the declaration (hand-built installs face
  // the gate's exact rules). A contract violation suspends this widget only
  // (unknown_widget) — never the whole install, never a substitution.
  if (!validatePluginWidgetContract(widget, plugin.manifest.id).ok)
    return { ok: false, reason: "unknown_widget", pluginId: parsed.pluginId };
  // Theme-compatibility allow-list: a widget scoped to other themes is
  // unknown here (explicit miss, never another widget).
  return { ok: true, plugin, widget };
}

/** Tray entries: every widget an installed, compatible plugin contributes. */
export function pluginTrayEntries(
  installed: readonly InstalledPlugin[],
  slot: BlockSlot | MenuSlot,
  api = BUILDER_API_VERSION,
) {
  const out: { key: string; label: string; pluginName: string }[] = [];
  for (const p of installed) {
    if (p.suspended === true) continue;
    if (!p.enabled || !satisfiesApiRange(p.manifest.api, api)) continue;
    for (const w of p.manifest.widgets) {
      if (!w.slots.includes(slot)) continue;
      if (!validatePluginWidgetContract(w, p.manifest.id).ok) continue;
      out.push({
        key: pluginWidgetKey(p.manifest.id, w.key),
        label: w.label,
        pluginName: p.manifest.name,
      });
    }
  }
  return out;
}

/* ---------------------------------------------- tier vocabulary (T1.3)
 *
 * Core/community tier vocabulary. Vocabulary only: this block adds no
 * branches, no exports, no behavior; every mechanism claim pins its source.
 *
 * - Core tier: the closed `SectionType` enum
 *   (`src/lib/builder-ast.ts:212`). Core widgets render through native theme
 *   branches and take the active theme's token-driven presentation (gated by
 *   `stays token-driven` in `src/lib/themes/songoskriti/skins.test.ts:182`).
 *   Third-party code never adds a core branch: `plugin_block` is the only
 *   plugin branch, rendered through the one sandboxed island
 *   (`src/components/builder/PluginBlock.tsx:11-16`).
 * - Community tier: every widget addressed `plugin:{pluginId}/{widget}`
 *   (`pluginWidgetKey` / `parsePluginWidgetKey` above) and mounted inside
 *   the published theme (`render_storefront` in
 *   `src/lib/marketplace-scopes.ts:82-88`). The bundle runs in the
 *   null-origin `WidgetSandbox` frame and reaches the app only through the
 *   scoped `postMessage` bridge (`authorizeWidgetCall` in
 *   `src/lib/marketplace-scopes.ts:341-360`); every failure renders a
 *   labeled placeholder, never a crash (`PluginResolution` above).
 *
 * Rule: plugins provide functionality, themes dress them — a community
 * widget mounted under Theme A renders Theme A's presentation, and the same
 * install under Theme B renders Theme B's. Theme tokens reach the bundle
 * through `shop.info` behind `read_shop`
 * (`src/lib/marketplace-scopes.ts:26-32`).
 *
 * TBD (aspiration, not mechanism): the frame isolates bundle DOM and CSS,
 * so a theme cannot restyle inside a community widget today. See the tier
 * section in `docs/developers/review-policy.md` for the gap.
 */
