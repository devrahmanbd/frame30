/**
 * Widget presentation resolution — pure service over the unified registry.
 *
 * Generalises the `theme-widgets.ts` pattern (per-theme overrides + generic
 * fallback, never another theme's brand) from SectionType components to
 * registry-addressed widgets (`builtin:*`, `studio:*`, `plugin:*`,
 * `theme:*`). Pure functions only: no React, no DB, no network, no ZIP
 * materialisation. Consumes `WidgetDef` (`themes?` + `renderer`) and the
 * `ExtensionNode` envelope shape from `src/lib/builder-ast.ts` (read-only);
 * missing widgets keep the existing placeholder contract (reason +
 * preserved data, never a crash, never redesigned here).
 *
 * Five presentation modes (one discriminated `mode` per hit):
 * - `native-builtin` — first-party core widgets (`builtin`, plus `studio`
 *   twins which the five-mode vocabulary names no separate mode for):
 *   theme override else core default.
 * - `official` — official plugin widgets: a trusted SOURCE impl ref
 *   (`source:official:<id>`). A generated/downloadable ZIP is NEVER
 *   produced or referenced (see `official-plugins.ts` — source-registered).
 * - `plugin-isolated` — community Class A: null-origin sandbox, theme
 *   outer-layout tokens only (see `theme-runtime/ThemeRuntime.tsx`
 *   `THEME_SANDBOX` and `plugin-theme-contract.ts`).
 * - `plugin-themeable` — community Class B: theme presentation over the
 *   declared public data, else the defined sandboxed-island fallback.
 * - `theme-owned` — theme = dress, widget = body: the owning theme's
 *   definition (the dress) under its own key; else the widget's registered
 *   universal generic presentation (the body) under any other theme; else a
 *   recoverable fallback that preserves instance data (no renderer held,
 *   never another owner's).
 *
 * Fail-closed rule: unknown / disabled / incompatible / uninstalled keys —
 * and theme-owned widgets with no owner definition AND no registered generic
 * — NEVER resolve to a different owner's renderer. They resolve to `missing`
 * (or the recoverable fallback) with the authored props preserved.
 *
 * No renderer rewiring here. Swap-in points (adopters wire these):
 * - renderer: `src/components/builder/SectionRenderer.tsx` beside the
 *   `resolveThemePresentation(...)` call — map `mode` to the component and
 *   render `missing`/fallback as the existing unavailable placeholder.
 * - tray: `src/components/builder/WidgetTray.tsx` (`trayRegistry` block)
 *   and `src/components/builder/studio/plugin-tray.ts`
 *   (`pluginTrayEntries`) — append `themeTrayEntries(themeKey, ...)`.
 * - activation gate: before `activateTheme` in
 *   `src/lib/themes/appearance.server.ts` (via callers such as
 *   `appearance.functions.ts`) — run `checkThemeCompatibility` over the
 *   page's widget ids and block publication on any incompatible entry.
 */

import { ownerForWidgetKey, type ExtensionNode } from "./builder-ast";
import type { InstalledPlugin } from "./plugin-manifest";
import { hasGenericPresentation } from "./theme-presentations";
import {
  resolveWidget as resolveSingletonWidget,
  type UnifiedRegistry,
  type WidgetDef,
} from "./unified-widget-registry";
import {
  MAX_REPEATER_ITEMS,
  MAX_TEXT_LENGTH,
  validateProps,
} from "./widget-props";

/* ------------------------------------------------------------------ refs */

/**
 * Official plugin ids, mirroring `OFFICIAL_PLUGIN_KEYS` in
 * `src/lib/official-plugins.ts`. Copied (not imported) so this lane stays
 * free of manifest data: identity comparison only, never manifest bytes.
 */
export const OFFICIAL_PLUGIN_IDS_DEFAULT: readonly string[] = [
  "product-reviews",
  "store-analytics",
  "whatsapp-chat",
  "fraud-shield",
];

/**
 * Official theme keys, mirroring `OFFICIAL_THEME_KEYS` in
 * `src/lib/themes/builtin-themes.ts`. Copied (not imported) for the same
 * reason: tray discovery compares keys, never theme modules.
 */
export const OFFICIAL_THEME_KEYS_DEFAULT: readonly string[] = [
  "songoskriti",
];

/**
 * The ONLY sandbox tokens an isolated widget frame ever gets, mirroring
 * `THEME_SANDBOX` in `src/components/theme-runtime/ThemeRuntime.tsx`
 * (isolated lane): scripts run, same-origin / navigation / popups do not.
 */
export const PRESENTATION_SANDBOX_TOKENS = "allow-scripts";

/** Theme reach into an isolated widget: outer layout chrome only. */
export const ISOLATED_THEME_TOKENS = "outer-layout-only";

/** Defined fallback for an undressed Class B widget (generic island). */
export const CLASS_B_FALLBACK = "sandboxed-island";

/**
 * Documented builder API assumed when the caller passes none. Mirrors
 * `BUILDER_API_VERSION` in `src/lib/plugin-manifest.ts`; the registry
 * itself defaults the same way, so pass-through callers may omit it.
 */
export const DEFAULT_BUILDER_API = "3.1.0";

/** Separator for `dressingKey(themeKey, widgetKey)` set members. */
const DRESSING_SEP = "\u0000";

/* --------------------------------------------------------------- utilities */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return {} as T;
  }
}

function cloneProps(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const clean = cloneJson(value);
  if (!isRecord(clean)) return {};
  // Hostile-key strip at every runtime boundary (proto-pollution): the JSON
  // round-trip preserves `__proto__` as an own property, so it is dropped
  // here — never stored, never forwarded to a renderer.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(clean)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    out[k] = v;
  }
  return out;
}

/** Trimmed theme key, or `""` for null / garbage (unkeyed resolution). */
export function normalizeThemeKey(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Owner scope derived from a registry widget key — delegates to
 * `ownerForWidgetKey` in `src/lib/builder-ast.ts` (single regex): the
 * segment before the first `/` after the namespace prefix
 * (`theme:songoskriti/finder` → `songoskriti`). Empty for unparseable keys.
 */
export function ownerScopeOf(widgetId: string): string {
  return ownerForWidgetKey(widgetId).id;
}

/** Plugin id for `plugin:<id>/<widget>` keys, else null. */
function pluginIdOf(widgetId: string): string | null {
  const m = /^plugin:([^/\s]+)\/(.+)$/.exec(widgetId.trim());
  return m ? m[1]! : null;
}

/** Widget part for `plugin:<id>/<widget>` keys, else `""`. */
function pluginWidgetPartOf(widgetId: string): string {
  const m = /^plugin:([^/\s]+)\/(.+)$/.exec(widgetId.trim());
  return m ? m[2]!.trim() : "";
}

/** Set member addressing one themeKey x widgetKey dressing. */
export function dressingKey(themeKey: string, widgetKey: string): string {
  return `${themeKey}${DRESSING_SEP}${widgetKey}`;
}

/** Numeric `major.minor.patch` compare; unparseable pairs compare equal. */
function compareSemver3(a: string, b: string): number {
  const parse = (v: string): [number, number, number] | null => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i]! !== pb[i]!) return pa[i]! < pb[i]! ? -1 : 1;
  }
  return 0;
}

/* ------------------------------------------------------------------ inputs */

export type PresentationRequest = {
  /** Registry id, or an `ExtensionNode` (widgetKey + props + version). */
  widgetId: string | ExtensionNode;
  themeKey: string | null | undefined;
  registry: UnifiedRegistry;
  /** Authored instance props: echoed back identically on every outcome. */
  props?: Record<string, unknown>;
  /** Pin a retained widget version; absent tracks the registry latest. */
  version?: string;
  /** Builder API the caller runs; defaults to the registry default. */
  builderApi?: string;
  /**
   * Per-theme override table generalising `theme-widgets.ts`: maps a theme
   * key to the widget ids it dresses. Native-builtin ids in the set
   * resolve `theme-override`, everything else `core-default`.
   */
  themeOverrides?: Readonly<Record<string, readonly string[]>>;
  /** Official plugin ids; defaults to `OFFICIAL_PLUGIN_IDS_DEFAULT`. */
  officialPluginIds?: readonly string[];
  /**
   * Installed plugins (in-memory, no DB): Class A/B is read from the
   * manifest widget's `themeable` presence, and Class B fallback data from
   * the install settings. Absent ⇒ unlisted plugins read Class A.
   */
  installedPlugins?: readonly InstalledPlugin[];
  /**
   * Which themeKey x widgetKey pairs the theme dresses (Class B). Either
   * a set of `dressingKey()` members or a predicate. Absent ⇒ undressed.
   */
  dressedPresentations?:
    ReadonlySet<string> | ((themeKey: string, widgetKey: string) => boolean);
  /** Declared public data a Class B theme presentation dresses. */
  publicData?: Record<string, unknown>;
};

function widgetRefOf(input: PresentationRequest["widgetId"]): {
  widgetId: string;
  version?: string;
} {
  if (typeof input === "string") return { widgetId: input.trim() };
  if (isRecord(input) && input["type"] === "extension") {
    const key = input["widgetKey"];
    const version = input["version"];
    return {
      widgetId: typeof key === "string" ? key.trim() : "",
      ...(typeof version === "string" && version.trim()
        ? { version: version.trim() }
        : {}),
    };
  }
  return { widgetId: "" };
}

function propsOf(req: PresentationRequest): Record<string, unknown> {
  if (isRecord(req.props)) return req.props;
  const node = req.widgetId;
  if (isRecord(node) && isRecord(node["props"])) return node["props"];
  return {};
}

/* ----------------------------------------------------------------- results */

export type NativePresentation = "theme-override" | "core-default";

export type PresentationResult =
  | {
      ok: true;
      mode: "native-builtin";
      widgetId: string;
      themeKey: string;
      def: WidgetDef;
      presentation: NativePresentation;
      props: Record<string, unknown>;
    }
  | {
      ok: true;
      mode: "official";
      widgetId: string;
      themeKey: string;
      def: WidgetDef;
      /**
       * Trusted source impl ref (`source:official:<pluginId>`). NEVER a
       * generated ZIP: no archive/bytes member exists on this result.
       */
      impl: { kind: "trusted-source"; ref: string };
      props: Record<string, unknown>;
    }
  | {
      ok: true;
      mode: "plugin-isolated";
      widgetId: string;
      themeKey: string;
      def: WidgetDef;
      sandbox: {
        tokens: typeof PRESENTATION_SANDBOX_TOKENS;
        themeTokens: typeof ISOLATED_THEME_TOKENS;
      };
      props: Record<string, unknown>;
    }
  | {
      ok: true;
      mode: "plugin-themeable";
      widgetId: string;
      themeKey: string;
      def: WidgetDef;
      /** True when the theme dresses this pair, else the island fallback. */
      dressed: boolean;
      /** Declared public data (or the defined fallback — never the bundle). */
      data: Record<string, unknown>;
      fallback: typeof CLASS_B_FALLBACK;
      props: Record<string, unknown>;
    }
  | {
      ok: true;
      mode: "theme-owned";
      widgetId: string;
      themeKey: string;
      def: WidgetDef;
      /**
       * Theme = dress, widget = body. Resolution order:
       * `owner-definition` — the owning theme's dress under its own key;
       * `generic-presentation` — the widget's universal, owner-independent
       * body (registered via `registerGenericPresentation`) under any other
       * theme; `recoverable-fallback` — neither dress nor body, the existing
       * placeholder. Fallbacks hold NO renderer (null) and never another
       * owner's definition; the instance recovers byte-identically under the
       * owning theme.
       */
      presentation:
        "owner-definition" | "generic-presentation" | "recoverable-fallback";
      placeholder: boolean;
      renderer: null | undefined;
      props: Record<string, unknown>;
    }
  | {
      ok: false;
      mode: "missing";
      widgetId: string;
      themeKey: string;
      reason: PresentationMissReason;
      preservedProps: Record<string, unknown>;
      /** Every miss renders the existing placeholder — never a crash. */
      placeholder: true;
      /** No renderer is ever held on a miss (no cross-owner leak). */
      renderer: null;
    };

export type PresentationMissReason =
  | "bad_key"
  | "unknown"
  | "disabled"
  | "suspended"
  | "incompatible"
  | "uninstalled";

function miss(
  widgetId: string,
  themeKey: string,
  reason: PresentationMissReason,
  preservedProps: Record<string, unknown>,
): PresentationResult {
  return {
    ok: false,
    mode: "missing",
    widgetId,
    themeKey,
    reason,
    preservedProps: cloneProps(preservedProps),
    placeholder: true,
    renderer: null,
  };
}

function hasThemeOverride(
  themeOverrides: PresentationRequest["themeOverrides"],
  themeKey: string,
  widgetId: string,
  defId: string,
): boolean {
  if (!themeKey || !themeOverrides) return false;
  const set = themeOverrides[themeKey];
  if (!Array.isArray(set)) return false;
  for (const entry of set) {
    if (typeof entry !== "string") continue;
    const clean = entry.trim();
    if (clean && (clean === widgetId || clean === defId)) return true;
  }
  return false;
}

function isOfficialPlugin(
  pluginId: string | null,
  officialPluginIds: PresentationRequest["officialPluginIds"],
): pluginId is string {
  if (!pluginId) return false;
  const list = officialPluginIds ?? OFFICIAL_PLUGIN_IDS_DEFAULT;
  return (list as readonly string[]).includes(pluginId);
}

/**
 * Class B iff the installed manifest declares the versioned theme-safe
 * contract on the widget (presence check mirroring `pluginWidgetClass` in
 * `src/lib/plugin-theme-contract.ts`; well-formedness stays with the
 * manifest gate). Unknown/unlisted ⇒ Class A (fail-safe: sandboxed).
 */
function isThemeableDeclared(
  installedPlugins: PresentationRequest["installedPlugins"],
  pluginId: string | null,
  widgetId: string,
): boolean {
  if (!pluginId || !Array.isArray(installedPlugins)) return false;
  const part = pluginWidgetPartOf(widgetId);
  if (!part) return false;
  const plugin = installedPlugins.find((p) => p?.manifest?.id === pluginId);
  const widget = plugin?.manifest?.widgets?.find((w) => w?.key === part);
  return (
    !!widget && widget.themeable !== undefined && widget.themeable !== null
  );
}

function installSettingsOf(
  installedPlugins: PresentationRequest["installedPlugins"],
  pluginId: string | null,
): Record<string, unknown> | null {
  if (!pluginId || !Array.isArray(installedPlugins)) return null;
  const plugin = installedPlugins.find((p) => p?.manifest?.id === pluginId);
  if (!plugin || !isRecord(plugin.settings)) return null;
  return cloneProps(plugin.settings as Record<string, unknown>);
}

function isDressed(
  dressed: PresentationRequest["dressedPresentations"],
  themeKey: string,
  widgetKey: string,
): boolean {
  try {
    if (!dressed || !themeKey || !widgetKey) return false;
    if (typeof dressed === "function") return dressed(themeKey, widgetKey);
    return dressed.has(dressingKey(themeKey, widgetKey));
  } catch {
    return false;
  }
}

/* ------------------------------------- Class B instance-props validation ---
 *
 * Class B (plugin-themeable) ONLY: the extension node's per-instance props
 * are validated here against the resolved def's own schema before they reach
 * the dressed presentation. `data` (global install settings / publicData) is
 * untouched and never merged into `props` or vice versa. Local helpers (not
 * imported from the sandbox host) so this pure module stays React-free:
 * - schema-driven defs: the shared value layer (`validateProps`) — unknown
 *   keys stripped, markup neutralised, fresh objects every call;
 * - legacy defs (empty schema): JSON-safe deep clone with hostile keys
 *   (`__proto__` / `constructor` / `prototype`) stripped and unserializable
 *   values dropped fail-closed.
 * Never throws.
 */

const THEMEABLE_HOSTILE_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

const THEMEABLE_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const THEMEABLE_MAX_KEYS = 50;
const THEMEABLE_MAX_DEPTH = 4;

const THEMEABLE_SCRIPT_BLOCK_RE =
  /<\s*(script|style)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi;
const THEMEABLE_TAG_RE = /<[^>]*>/g;
const THEMEABLE_ANGLE_RE = /[<>]/g;
// eslint-disable-next-line no-control-regex
const THEMEABLE_CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

function themeableStripText(value: string, limit: number): string {
  return value
    .replace(THEMEABLE_SCRIPT_BLOCK_RE, "")
    .replace(THEMEABLE_TAG_RE, "")
    .replace(THEMEABLE_ANGLE_RE, "")
    .replace(THEMEABLE_CONTROL_RE, "")
    .slice(0, limit);
}

const THEMEABLE_DROP: unique symbol = Symbol("themeable.drop");

function themeableLegacyValue(value: unknown, depth: number): unknown {
  if (typeof value === "string")
    return themeableStripText(value, MAX_TEXT_LENGTH);
  if (typeof value === "number")
    return Number.isFinite(value) ? value : THEMEABLE_DROP;
  if (typeof value === "boolean") return value;
  if (value === null) return null;
  if (depth >= THEMEABLE_MAX_DEPTH) return THEMEABLE_DROP;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value.slice(0, MAX_REPEATER_ITEMS)) {
      const cleaned = themeableLegacyValue(item, depth + 1);
      if (cleaned !== THEMEABLE_DROP) out.push(cleaned);
    }
    return out;
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (count >= THEMEABLE_MAX_KEYS) break;
      if (THEMEABLE_HOSTILE_KEYS.has(k)) continue;
      if (!THEMEABLE_KEY_RE.test(k)) continue;
      const cleaned = themeableLegacyValue(v, depth + 1);
      if (cleaned === THEMEABLE_DROP) continue;
      out[k] = cleaned;
      count += 1;
    }
    return out;
  }
  return THEMEABLE_DROP;
}

function themeableJsonSafe(raw: unknown): Record<string, unknown> {
  try {
    const text = JSON.stringify(raw);
    if (typeof text !== "string") return {};
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function themeableStripHostile(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) {
    if (depth > 10) return [];
    return value.map((item) => themeableStripHostile(item, depth + 1));
  }
  if (value && typeof value === "object") {
    if (depth > 10) return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (THEMEABLE_HOSTILE_KEYS.has(k)) continue;
      out[k] = themeableStripHostile(v, depth + 1);
    }
    return out;
  }
  return value;
}

function validatedThemeableProps(
  authored: Record<string, unknown>,
  propsSchema: WidgetDef["propsSchema"],
): Record<string, unknown> {
  try {
    const safe = themeableJsonSafe(authored);
    const fields = Array.isArray(
      (propsSchema as { fields?: unknown } | null | undefined)?.fields,
    )
      ? (propsSchema as { fields: readonly unknown[] }).fields
      : [];
    if (fields.length > 0) {
      const clean = validateProps(
        { fields } as Parameters<typeof validateProps>[0],
        safe,
      ).clean as Record<string, unknown>;
      return themeableStripHostile(clean) as Record<string, unknown>;
    }
    const cleaned: unknown = themeableLegacyValue(safe, 0);
    return typeof cleaned === "object" && cleaned !== null
      ? (cleaned as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * True when `themeKey` owns the theme-namespace def: the id scope matches
 * (`theme:<owner>/...`) or the def's `themes` claim includes the key.
 */
export function isThemeOwner(def: WidgetDef, themeKey: string): boolean {
  if (!themeKey || !def || def.namespace !== "theme") return false;
  if (ownerScopeOf(def.id) === themeKey) return true;
  return Array.isArray(def.themes) && def.themes.includes(themeKey);
}

/**
 * Resolve one widget id to its presentation under a theme. Never throws;
 * never resolves a miss to a different owner's renderer.
 */
export function resolvePresentation(
  req: PresentationRequest,
): PresentationResult {
  try {
    if (!isRecord(req)) return miss("", "", "bad_key", {});
    const registry = (req as { registry?: unknown }).registry;
    const themeKey = normalizeThemeKey(
      (req as { themeKey?: unknown }).themeKey,
    );
    const authored = cloneProps(propsOf(req as PresentationRequest));
    if (
      !registry ||
      typeof (registry as UnifiedRegistry).resolveWidget !== "function"
    ) {
      return miss("", themeKey, "unknown", authored);
    }
    const { widgetId, version: nodeVersion } = widgetRefOf(
      (req as PresentationRequest).widgetId,
    );
    if (!widgetId) return miss("", themeKey, "bad_key", authored);
    const version =
      typeof (req as PresentationRequest).version === "string" &&
      (req as PresentationRequest).version!.trim()
        ? (req as PresentationRequest).version!.trim()
        : nodeVersion;
    const builderApi =
      typeof (req as PresentationRequest).builderApi === "string"
        ? (req as PresentationRequest).builderApi
        : undefined;
    let resolved: ReturnType<UnifiedRegistry["resolveWidget"]>;
    try {
      resolved = (registry as UnifiedRegistry).resolveWidget(widgetId, {
        ...(version ? { version } : {}),
        ...(builderApi ? { builderApi } : {}),
        data: authored,
      });
    } catch {
      return miss(widgetId, themeKey, "unknown", authored);
    }
    if (!resolved.ok) {
      return miss(
        widgetId,
        themeKey,
        resolved.missing.reason,
        resolved.missing.preservedData,
      );
    }
    const def = resolved.def;
    const props = cloneProps(authored);

    if (def.namespace === "builtin" || def.namespace === "studio") {
      const presentation: NativePresentation = hasThemeOverride(
        (req as PresentationRequest).themeOverrides,
        themeKey,
        widgetId,
        def.id,
      )
        ? "theme-override"
        : "core-default";
      return {
        ok: true,
        mode: "native-builtin",
        widgetId,
        themeKey,
        def,
        presentation,
        props,
      };
    }

    if (def.namespace === "plugin") {
      const pluginId = pluginIdOf(widgetId);
      if (
        isOfficialPlugin(
          pluginId,
          (req as PresentationRequest).officialPluginIds,
        )
      ) {
        return {
          ok: true,
          mode: "official",
          widgetId,
          themeKey,
          def,
          impl: { kind: "trusted-source", ref: `source:official:${pluginId}` },
          props,
        };
      }
      if (
        !isThemeableDeclared(
          (req as PresentationRequest).installedPlugins,
          pluginId,
          widgetId,
        )
      ) {
        return {
          ok: true,
          mode: "plugin-isolated",
          widgetId,
          themeKey,
          def,
          sandbox: {
            tokens: PRESENTATION_SANDBOX_TOKENS,
            themeTokens: ISOLATED_THEME_TOKENS,
          },
          props,
        };
      }
      const data = isRecord((req as PresentationRequest).publicData)
        ? cloneProps((req as PresentationRequest).publicData)
        : (installSettingsOf(
            (req as PresentationRequest).installedPlugins,
            pluginId,
          ) ?? {});
      return {
        ok: true,
        mode: "plugin-themeable",
        widgetId,
        themeKey,
        def,
        dressed: isDressed(
          (req as PresentationRequest).dressedPresentations,
          themeKey,
          widgetId,
        ),
        data,
        fallback: CLASS_B_FALLBACK,
        // Validated per-instance props (Class B contract): schema-cleaned,
        // hostile-free, never merged with `data` above.
        props: validatedThemeableProps(authored, def.propsSchema),
      };
    }

    if (def.namespace === "theme") {
      if (isThemeOwner(def, themeKey)) {
        return {
          ok: true,
          mode: "theme-owned",
          widgetId,
          themeKey,
          def,
          presentation: "owner-definition",
          placeholder: false,
          renderer: undefined,
          props,
        };
      }
      // Theme = dress, widget = body: a registered universal generic
      // presentation (the body) renders under any non-owning theme — known
      // foreign or unknown keys alike. No owner renderer is ever held; the
      // dressing lane still resolves by widget id in the consumer.
      if (hasGenericPresentation(def.id)) {
        return {
          ok: true,
          mode: "theme-owned",
          widgetId,
          themeKey,
          def,
          presentation: "generic-presentation",
          placeholder: false,
          renderer: null,
          props,
        };
      }
      return {
        ok: true,
        mode: "theme-owned",
        widgetId,
        themeKey,
        def,
        presentation: "recoverable-fallback",
        placeholder: true,
        renderer: null,
        props,
      };
    }

    return miss(widgetId, themeKey, "unknown", authored);
  } catch {
    return miss("", "", "unknown", {});
  }
}

/* ------------------------------------------------------------ theme tray */

export type ThemeTrayEntry = {
  id: string;
  label: string;
  category: string;
  renderer: WidgetDef["renderer"];
};

export type ThemeTrayMissReason =
  "bad_key" | "unknown_theme" | "disabled" | "incompatible";

export type ThemeTrayResult =
  | { ok: true; themeKey: string; entries: ThemeTrayEntry[] }
  | {
      ok: false;
      themeKey: string;
      entries: [];
      reason: ThemeTrayMissReason;
    };

/** Installed/enabled state for one theme (passed in — no DB inside). */
export type InstalledThemeState = {
  key: string;
  enabled?: boolean;
  minBuilderApi?: string;
};

export type ThemeTrayOptions = {
  /** Registry carrying enabled/compat state; or pass `defs` directly. */
  registry?: UnifiedRegistry;
  /** Defs to list from when no registry is supplied. */
  defs?: readonly WidgetDef[];
  /** Installed theme states; absent ⇒ official keys + def-claimed keys. */
  installedThemes?: readonly InstalledThemeState[] | null;
  /** Running builder API for the min-version gate. */
  builderApi?: string;
};

function defsFrom(opts: ThemeTrayOptions): WidgetDef[] {
  try {
    if (Array.isArray(opts?.defs)) {
      return (opts.defs as readonly unknown[]).filter(isWidgetDef);
    }
    const registry = opts?.registry;
    if (
      registry &&
      typeof registry.listWidgets === "function" &&
      typeof registry.resolveWidget === "function"
    ) {
      const out: WidgetDef[] = [];
      for (const def of registry.listWidgets()) {
        if (!isWidgetDef(def)) continue;
        // Registry-enabled/compatible state gates the tray: a disabled or
        // incompatible def is listed nowhere (resolve misses stay out).
        try {
          const hit = registry.resolveWidget(def.id);
          if (hit.ok) out.push(def);
        } catch {
          continue;
        }
      }
      return out;
    }
    return [];
  } catch {
    return [];
  }
}

function isWidgetDef(value: unknown): value is WidgetDef {
  if (!isRecord(value)) return false;
  return (
    typeof value["id"] === "string" &&
    typeof value["label"] === "string" &&
    typeof value["namespace"] === "string" &&
    Array.isArray(value["slots"]) &&
    isRecord(value["defaults"]) &&
    isRecord(value["propsSchema"]) &&
    typeof value["renderer"] === "string"
  );
}

/**
 * List the active theme's widgets: registry defs whose `themes` claim the
 * key, gated by installed/enabled state passed in (no DB inside). Missing
 * or incompatible themes yield an empty list + reason — never a throw.
 */
export function themeTrayEntries(
  themeKey: unknown,
  opts: ThemeTrayOptions = {},
): ThemeTrayResult {
  try {
    const key = normalizeThemeKey(themeKey);
    if (!key)
      return { ok: false, themeKey: "", entries: [], reason: "bad_key" };
    const running =
      typeof opts?.builderApi === "string" && opts.builderApi.trim()
        ? opts.builderApi.trim()
        : DEFAULT_BUILDER_API;

    if (Array.isArray(opts?.installedThemes)) {
      const state = opts.installedThemes.find(
        (t) => isRecord(t) && t["key"] === key,
      ) as InstalledThemeState | undefined;
      if (!state) {
        return {
          ok: false,
          themeKey: key,
          entries: [],
          reason: "unknown_theme",
        };
      }
      if (state.enabled === false) {
        return { ok: false, themeKey: key, entries: [], reason: "disabled" };
      }
      if (
        typeof state.minBuilderApi === "string" &&
        state.minBuilderApi.trim() &&
        compareSemver3(running, state.minBuilderApi.trim()) < 0
      ) {
        return {
          ok: false,
          themeKey: key,
          entries: [],
          reason: "incompatible",
        };
      }
    } else {
      const defs = defsFrom(opts ?? {});
      const known = new Set<string>(OFFICIAL_THEME_KEYS_DEFAULT);
      for (const def of defs) {
        if (Array.isArray(def.themes)) {
          for (const t of def.themes) {
            if (typeof t === "string" && t.trim()) known.add(t.trim());
          }
        }
      }
      if (!known.has(key)) {
        return {
          ok: false,
          themeKey: key,
          entries: [],
          reason: "unknown_theme",
        };
      }
    }

    const entries: ThemeTrayEntry[] = [];
    for (const def of defsFrom(opts ?? {})) {
      if (!Array.isArray(def.themes) || !def.themes.includes(key)) continue;
      entries.push({
        id: def.id,
        label: def.label,
        category: def.category,
        renderer: def.renderer,
      });
    }
    entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { ok: true, themeKey: key, entries };
  } catch {
    const key = normalizeThemeKey(themeKey);
    return { ok: false, themeKey: key, entries: [], reason: "unknown_theme" };
  }
}

/* ------------------------------------------------------ compatibility gate */

export type CompatibilityReason =
  | "compatible"
  | "bad_key"
  | "bad_theme"
  | "unknown"
  | "disabled"
  | "suspended"
  | "incompatible"
  | "uninstalled"
  | "foreign-theme";

export type CompatibilityEntry = {
  widgetId: string;
  compatible: boolean;
  reason: CompatibilityReason;
};

export type CompatibilityReport = {
  themeKey: string;
  results: CompatibilityEntry[];
};

export type CompatibilityOptions = {
  registry: UnifiedRegistry;
  /** Builder API the candidate theme would run under. */
  builderApi?: string;
};

/**
 * Per-widget compatibility for a theme switch, run BEFORE activation or
 * publication. Never throws; every id yields exactly one entry.
 */
export function checkThemeCompatibility(
  themeKey: unknown,
  widgetIds: readonly unknown[],
  opts: CompatibilityOptions,
): CompatibilityReport {
  try {
    const key = normalizeThemeKey(themeKey);
    const ids = Array.isArray(widgetIds) ? widgetIds : [];
    const registry = opts?.registry;
    const registryOk =
      !!registry && typeof registry.resolveWidget === "function";
    const builderApi =
      typeof opts?.builderApi === "string" ? opts.builderApi : undefined;

    const results: CompatibilityEntry[] = ids.map((raw) => {
      const widgetId = typeof raw === "string" ? raw.trim().slice(0, 160) : "";
      if (!key)
        return { widgetId, compatible: false, reason: "bad_theme" as const };
      if (!widgetId) {
        return { widgetId, compatible: false, reason: "bad_key" as const };
      }
      if (!registryOk) {
        return { widgetId, compatible: false, reason: "unknown" as const };
      }
      let resolved: ReturnType<UnifiedRegistry["resolveWidget"]>;
      try {
        resolved = (registry as UnifiedRegistry).resolveWidget(widgetId, {
          ...(builderApi ? { builderApi } : {}),
        });
      } catch {
        return { widgetId, compatible: false, reason: "unknown" as const };
      }
      if (!resolved.ok) {
        return {
          widgetId,
          compatible: false,
          reason: resolved.missing.reason,
        };
      }
      const def = resolved.def;
      if (def.namespace === "theme" && !isThemeOwner(def, key)) {
        return {
          widgetId,
          compatible: false,
          reason: "foreign-theme" as const,
        };
      }
      // Frame30 contract — a plugin widget scoped to other themes is
      // foreign here. The allow-list rides the gate and adapter into
      // `def.themeCompatibility`; an ABSENT or EMPTY list means
      // unscoped (compatible everywhere), never a silent allow.
      const scoped = def.themeCompatibility?.themes;
      if (
        def.namespace === "plugin" &&
        Array.isArray(scoped) &&
        scoped.length > 0 &&
        !scoped.some((t) => typeof t === "string" && t.trim() === key)
      ) {
        return {
          widgetId,
          compatible: false,
          reason: "foreign-theme" as const,
        };
      }
      return { widgetId, compatible: true, reason: "compatible" as const };
    });
    return { themeKey: key, results };
  } catch {
    return { themeKey: normalizeThemeKey(themeKey), results: [] };
  }
}

/* ------------------------------------------------- inspector schema seam */

export type InspectorSchemaResult =
  | { status: "legacy" }
  | {
      status: "schema";
      widgetId: string;
      label: string;
      /** Static registry metadata line (`namespace · category · vX`). */
      meta: string;
      schema: WidgetDef["propsSchema"];
    };

/**
 * Frame30 one-registry — the inspector's resolution path with an optional
 * registry parameter. Absent (or unusable) `registry` reads the shared
 * singleton (LEGACY flagged fallback — kept so existing callers stay
 * byte-identical on enabled defs, but flagged: tenant-aware callers MUST
 * thread an explicit registry), so the same candidates as
 * `resolveSchemaForSection` (`pluginKey` first for app blocks, then the bare
 * type and the `builtin:` alias), the same empty-schema convention
 * (`{ fields: [] }` means legacy-unvalidated, never a bypass), the same
 * legacy fallthrough. A threaded registry additionally resolves extension
 * nodes (`type: "extension"` via their `widgetKey`) and any plugin/theme
 * definition the singleton never sees — read-only, never registered
 * globally, so tenant isolation is preserved. Never throws.
 *
 * State-aware (tray parity): BOTH paths resolve via `resolveWidget`, never
 * the state-blind `getWidget` — a def that is disabled/suspended/
 * builder-incompatible mid-session, or an uninstalled/unknown id, misses to
 * the legacy path instead of rendering a full schema panel for a widget the
 * tray can no longer offer. Misses advance to the next candidate; exhausting
 * every candidate yields `{ status: "legacy" }` with no throw.
 */
export function resolveInspectorSchema(
  section:
    | {
        type?: unknown;
        props?: unknown;
        widgetKey?: unknown;
      }
    | null
    | undefined,
  registry?: UnifiedRegistry,
): InspectorSchemaResult {
  try {
    if (!section || typeof section !== "object") return { status: "legacy" };
    const bag = section as {
      type?: unknown;
      props?: unknown;
      widgetKey?: unknown;
    };
    if (typeof bag.type !== "string" || !bag.type) return { status: "legacy" };
    const props =
      bag.props && typeof bag.props === "object" && !Array.isArray(bag.props)
        ? (bag.props as Record<string, unknown>)
        : {};
    const candidates: string[] = [];
    if (bag.type === "plugin_block") {
      const key = props["pluginKey"];
      if (typeof key === "string" && key.trim())
        candidates.push(key.trim().slice(0, 160));
    }
    if (bag.type === "extension") {
      const key = bag.widgetKey;
      if (typeof key === "string" && key.trim())
        candidates.push(key.trim().slice(0, 160));
    }
    candidates.push(bag.type, `builtin:${bag.type}`);
    const useRegistry =
      registry && typeof registry.resolveWidget === "function"
        ? registry
        : null;
    for (const id of candidates) {
      let def: WidgetDef | undefined;
      try {
        // State-aware on BOTH paths (tray parity): misses (disabled /
        // suspended / incompatible / uninstalled / unknown) fall through to
        // legacy — never a schema panel for an unofferable widget.
        if (useRegistry) {
          const hit = useRegistry.resolveWidget(id);
          if (!hit.ok) continue;
          def = hit.def;
        } else {
          // LEGACY flagged fallback: the shared singleton, resolved
          // state-aware (never the state-blind `getWidget`). Tenant-aware
          // callers MUST thread an explicit registry instead.
          const hit = resolveSingletonWidget(id);
          if (!hit.ok) continue;
          def = hit.def;
        }
      } catch {
        continue;
      }
      const fields = (def?.propsSchema as { fields?: unknown } | undefined)
        ?.fields;
      if (!Array.isArray(fields) || fields.length === 0) continue;
      return {
        status: "schema",
        widgetId: def!.id,
        label: def!.label,
        meta: `${def!.namespace} · ${def!.category} · v${def!.version}`,
        schema: def!.propsSchema,
      };
    }
  } catch {
    // Registry lookup must never break the inspector: legacy path below.
  }
  return { status: "legacy" };
}
