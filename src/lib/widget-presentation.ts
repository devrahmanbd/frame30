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
 * - `theme-owned` — owning-theme definition, else a recoverable fallback
 *   that preserves instance data (no renderer held, never another owner's).
 *
 * Fail-closed rule: unknown / disabled / incompatible / uninstalled keys —
 * and theme-owned widgets under a non-owning theme — NEVER resolve to a
 * different owner's renderer. They resolve to `missing` (or the
 * recoverable fallback) with the authored props preserved.
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

import type { ExtensionNode } from "./builder-ast";
import type { InstalledPlugin } from "./plugin-manifest";
import type { UnifiedRegistry, WidgetDef } from "./unified-widget-registry";

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
  "somvabona",
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
  return isRecord(clean) ? clean : {};
}

/** Trimmed theme key, or `""` for null / garbage (unkeyed resolution). */
export function normalizeThemeKey(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Owner scope derived from a registry widget key, mirroring
 * `ownerForWidgetKey` in `src/lib/builder-ast.ts`: the segment before the
 * first `/` after the namespace prefix (`theme:songoskriti/finder` →
 * `songoskriti`). Empty for unparseable keys.
 */
export function ownerScopeOf(widgetId: string): string {
  const m = /^(builtin|studio|plugin|theme):(.+)$/.exec(widgetId.trim());
  if (!m) return "";
  return m[2]!.split("/")[0]!.trim().slice(0, 64);
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
      presentation: "owner-definition" | "recoverable-fallback";
      /**
       * `recoverable-fallback` holds NO renderer (null) and renders the
       * existing placeholder; the instance recovers byte-identically under
       * the owning theme. Never another owner's definition.
       */
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
  "bad_key" | "unknown" | "disabled" | "incompatible" | "uninstalled";

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
        props,
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
      return { widgetId, compatible: true, reason: "compatible" as const };
    });
    return { themeKey: key, results };
  } catch {
    return { themeKey: normalizeThemeKey(themeKey), results: [] };
  }
}
