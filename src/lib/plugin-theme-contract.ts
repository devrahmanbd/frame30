/**
 * Community classes — the theme-safe contract (Class B).
 *
 * Two classes name how a community widget renders:
 *
 * - Class A (`isolated`): the widget declares no `themeable` contract. Its
 *   bundle owns arbitrary UI (chat, calculators, embeds) inside the
 *   null-origin `WidgetSandbox` frame. Untouched by this module: resolution
 *   returns `sandbox` and the PluginBlock renders the exact same island.
 * - Class B (`themeable`): the plugin declares the theme-safe contract
 *   (schema/data/actions/slots/states, versioned) on its widget def. The
 *   theme dresses it through the community presentation registry below;
 *   the generic sandboxed island (`WidgetSandbox` with the plugin's own
 *   entry) is the fallback when the theme doesn't dress the widget.
 *
 * Data rule (v1): the contract carries no live rows — the theme
 * presentation receives the install's validated settings values as `data`
 * (the same values the sandbox serves over `plugin.settings`). The plugin
 * provides functionality, the theme owns every pixel; the bundle never
 * executes on the dressed path, so sandboxing is never weakened.
 *
 * Registry contracts (mirroring `theme-presentations.ts`):
 * - Registration is first-wins: a duplicate warns and keeps the first.
 *   Registration never throws.
 * - Resolution never throws: unknown / null / missing keys return the
 *   caller-supplied fallback, or undefined when none is given. Unknown
 *   themes NEVER resolve to another theme's presentation.
 * - This module names no theme and branches on no theme: lookup is an
 *   opaque two-level Map keyed by theme key then namespaced plugin key.
 */

import type { ComponentType } from "react";
import type { PluginResolution, PluginWidgetDef } from "./plugin-manifest";

/** The only theme-safe contract version the host understands. */
export const PLUGIN_THEME_CONTRACT_VERSION = 1 as const;

/**
 * What a Class B widget declares in its manifest. `version` pins the
 * contract the theme dresses against; `schema` (and optional `data`) are
 * refs the theme resolves to read the data shape; `actions`/`slots`/
 * `states` name the integration points the theme may implement.
 */
export type PluginThemeContract = {
  version: typeof PLUGIN_THEME_CONTRACT_VERSION;
  /** Schema ref for the widget's data shape (URI or bundle-relative ref). */
  schema: string;
  /** Data-shape ref; when absent the theme reads `schema`. */
  data?: string;
  /** Action names the theme may invoke (cart.add, submit, …). */
  actions?: string[];
  /** Named slots the theme may fill around the widget data. */
  slots?: string[];
  /** Named states the theme must present (loading, empty, ready, …). */
  states?: string[];
};

/** Class vocabulary: `isolated` is Class A, `themeable` is Class B. */
export type PluginWidgetClass = "isolated" | "themeable";

/**
 * Class of a widget def. A widget is themeable only when it carries a
 * well-formed contract — a malformed declaration never reaches a def
 * (manifest validation rejects it), so this is a presence check.
 */
export function pluginWidgetClass(
  widget: Pick<PluginWidgetDef, "themeable"> | null | undefined,
): PluginWidgetClass {
  return widget?.themeable ? "themeable" : "isolated";
}

const MAX_REF_LEN = 500;
const MAX_NAMES = 32;
const MAX_NAME_LEN = 64;

function isRef(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_REF_LEN
  );
}

function isNameList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_NAMES &&
    value.every(
      (n) =>
        typeof n === "string" &&
        n.trim().length > 0 &&
        n.trim().length <= MAX_NAME_LEN,
    )
  );
}

/** True for a well-formed v1 theme-safe contract declaration. */
export function isPluginThemeContract(
  value: unknown,
): value is PluginThemeContract {
  const r = (value ?? {}) as Record<string, unknown>;
  if (r.version !== PLUGIN_THEME_CONTRACT_VERSION) return false;
  if (!isRef(r.schema)) return false;
  if (r.data !== undefined && !isRef(r.data)) return false;
  if (r.actions !== undefined && !isNameList(r.actions)) return false;
  if (r.slots !== undefined && !isNameList(r.slots)) return false;
  if (r.states !== undefined && !isNameList(r.states)) return false;
  return true;
}

/**
 * Guard + normalize for the manifest gate: trims refs, copies name lists,
 * drops the optional `data` alias when it duplicates `schema`. Returns
 * null for anything malformed (the gate records `widgets[i].themeable`).
 */
export function normalizeThemeContract(
  value: unknown,
): PluginThemeContract | null {
  if (!isPluginThemeContract(value)) return null;
  const schema = value.schema.trim();
  const data =
    typeof value.data === "string" && value.data.trim() !== schema
      ? value.data.trim()
      : undefined;
  const clean = (list: string[] | undefined) =>
    list?.map((n) => n.trim()).filter((n) => n.length > 0);
  const actions = clean(value.actions);
  const slots = clean(value.slots);
  const states = clean(value.states);
  return {
    version: PLUGIN_THEME_CONTRACT_VERSION,
    schema,
    ...(data ? { data } : {}),
    ...(actions?.length ? { actions } : {}),
    ...(slots?.length ? { slots } : {}),
    ...(states?.length ? { states } : {}),
  };
}

// ---------------------------------------------------------- presentation
// registry

/** Props a theme presentation receives: contract data, never the bundle. */
export type CommunityPresentationProps = {
  pluginId: string;
  /** Namespaced `plugin:{pluginId}/{widget}` key. */
  widgetKey: string;
  /** The install's validated settings values (same source the sandbox
   * serves over `plugin.settings`). */
  data: Record<string, string | number | boolean>;
};

export type CommunityPresentationComponent =
  ComponentType<CommunityPresentationProps>;

/** themeKey → (namespaced plugin key → presentation Component). */
const PRESENTATIONS = new Map<string, Map<string, unknown>>();

/**
 * Claim one themeKey × pluginKey pair for a presentation Component.
 * Owned by themes: only theme modules call this. First registration wins;
 * duplicates warn and are ignored. Never throws.
 */
export function registerCommunityPresentation(
  themeKey: string,
  pluginKey: string,
  Component: CommunityPresentationComponent,
): void {
  if (typeof themeKey !== "string" || themeKey.length === 0) {
    console.warn(
      `[community-presentations] ignoring registration for empty theme key (${String(pluginKey)}).`,
    );
    return;
  }
  if (typeof pluginKey !== "string" || pluginKey.length === 0) {
    console.warn(
      `[community-presentations] ignoring registration for empty plugin key (${String(themeKey)}).`,
    );
    return;
  }
  if (typeof Component !== "function") {
    console.warn(
      `[community-presentations] ignoring registration for ${themeKey}/${String(pluginKey)}: not a component.`,
    );
    return;
  }
  let byWidget = PRESENTATIONS.get(themeKey);
  if (!byWidget) {
    byWidget = new Map<string, unknown>();
    PRESENTATIONS.set(themeKey, byWidget);
  }
  if (byWidget.has(pluginKey)) {
    console.warn(
      `[community-presentations] duplicate registration for ${themeKey}/${String(pluginKey)} ignored; keeping the first.`,
    );
    return;
  }
  byWidget.set(pluginKey, Component);
}

/**
 * Resolve the registered presentation for a themeKey × pluginKey pair, or
 * the caller-supplied fallback when nothing is registered. Never throws —
 * unknown themes, null keys and missing widgets all fall back instead of
 * leaking another theme's brand or another widget's presentation.
 */
export function resolveCommunityPresentation(
  themeKey: string | null | undefined,
  pluginKey: string | null | undefined,
  fallback?: CommunityPresentationComponent | undefined,
): CommunityPresentationComponent | undefined {
  try {
    const hit = PRESENTATIONS.get(themeKey ?? "")?.get(pluginKey ?? "") as
      CommunityPresentationComponent | undefined;
    return hit ?? fallback;
  } catch {
    return fallback;
  }
}

/** Test-only reset: drops every registration (isolates suites). */
export function clearCommunityPresentations(): void {
  PRESENTATIONS.clear();
}

// --------------------------------------------------------------- resolution

export type CommunityRenderDecision =
  | {
      kind: "blocked";
      /** Every failure renders a labelled placeholder — never a crash. */
      reason:
        | "bad_key"
        | "not_installed"
        | "unknown_widget"
        | "incompatible"
        | "disabled";
      pluginId?: string;
    }
  | {
      /** Class A: isolated, iframe-owned — the sandbox path, unchanged. */
      kind: "sandbox";
    }
  | {
      /** Class B undressed: the generic sandboxed island fallback. */
      kind: "island";
    }
  | {
      /** Class B dressed: the theme presentation owns every pixel. */
      kind: "theme";
      themeKey: string;
    };

/**
 * One decision point for the PluginBlock path:
 *
 * - blocked → placeholder (unchanged five failure modes);
 * - non-themeable (Class A) → `sandbox` (the iframe island, unchanged);
 * - themeable (Class B) + dressed → `theme` (theme presentation);
 * - themeable (Class B) + undressed → `island` (generic sandboxed island).
 *
 * Never throws: malformed input degrades to the sandboxed island, which is
 * always safe to render.
 */
export function resolveCommunityRender(
  resolution: PluginResolution | null | undefined,
  opts?: {
    themeKey?: string | null | undefined;
    pluginKey?: string | null | undefined;
    hasPresentation?: (themeKey: string, pluginKey: string) => boolean;
  },
): CommunityRenderDecision {
  try {
    if (!resolution || typeof resolution !== "object")
      return { kind: "blocked", reason: "bad_key" };
    if (!resolution.ok)
      return {
        kind: "blocked",
        reason: resolution.reason,
        ...(resolution.pluginId ? { pluginId: resolution.pluginId } : {}),
      };
    if (pluginWidgetClass(resolution.widget) !== "themeable")
      return { kind: "sandbox" };
    const themeKey = typeof opts?.themeKey === "string" ? opts.themeKey : "";
    const pluginKey = typeof opts?.pluginKey === "string" ? opts.pluginKey : "";
    if (themeKey && pluginKey) {
      const dressed = opts?.hasPresentation
        ? opts.hasPresentation(themeKey, pluginKey)
        : resolveCommunityPresentation(themeKey, pluginKey) !== undefined;
      if (dressed) return { kind: "theme", themeKey };
    }
    return { kind: "island" };
  } catch {
    return { kind: "island" };
  }
}
