/**
 * Level B (reviewed developer themes) — theme-owned widget schemas (pure).
 *
 * PURE module: no database, no network, no filesystem, no React. It adapts
 * an approved `dev.theme.json` manifest's sections + settings into editor
 * WidgetDefs through the SAME value-layer shape every other tier uses
 * (`PropField` in `src/lib/widget-props.ts`, validated by `validateProps` /
 * `defaultsFor`): no new kind vocabulary is invented. The six closed Level B
 * setting types (`DEV_THEME_FIELD_TYPES` in `dev-theme-manifest.ts`) map 1:1
 * onto existing prop kinds:
 *
 *   text → text, image → image, color → color, spacing → spacing,
 *   product-selection → product (ids only, never prices — the manifest gate
 *   already forbids price-bearing pickers), animation → animation.
 *
 * Registry contract: each def satisfies the shared `registerWidget` gate
 * (`src/lib/unified-widget-registry.ts` `sanitizeDef`) — `theme:` namespaced
 * id, semver version, non-empty label/category, string slots, record
 * defaults, `{ fields }` schema of closed kinds, `custom` renderer. This
 * module does NOT register anything itself (no singleton access, no side
 * effects): callers register the returned defs, and resolution +
 * validation go through the existing registry + value-layer paths, so the
 * editor can never disagree with the storefront about a field's shape.
 *
 * What this module does NOT grant: `renderer: "custom"` is editor-only.
 * Storefront execution of approved bundles happens exclusively inside the
 * sandboxed `ThemeRuntime` frame (see `dev-theme-activate.ts`
 * `bindDevThemeRuntime`); a registered theme def never executes in page DOM.
 *
 * Lane separation: data-only manifests (`theme.json` shape) are refused with
 * `widgets.wrong_lane` — the frozen `theme-package.ts` gate is NOT modified.
 */

import {
  parseDevThemeManifest,
  type DevThemeManifest,
  type DevThemeSetting,
} from "./dev-theme-manifest";
import {
  defaultsFor,
  validateProps,
  type PropField,
  type WidgetProps,
} from "./widget-props";

export type DevThemeWidgetDef = {
  id: string;
  namespace: "theme";
  version: string;
  label: string;
  category: string;
  slots: string[];
  defaults: Record<string, unknown>;
  propsSchema: { fields: PropField[] };
  renderer: "custom";
  /** Lane metadata (dropped by the registry's allow-listing, kept here for
   * the asset pipeline: which theme section this def editors for). */
  themeId: string;
  sectionKey: string;
  component: string;
};

export type DevThemeWidgetsVerdict =
  | { ok: true; defs: DevThemeWidgetDef[]; warnings: [] }
  | { ok: false; errors: string[] };

/** Closed 1:1 mapping — every target kind exists in `PROP_KINDS`. */
const SETTING_TO_PROP_KIND: Record<string, PropField["kind"]> = {
  text: "text",
  image: "image",
  color: "color",
  spacing: "spacing",
  "product-selection": "product",
  animation: "animation",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Data-only shape probe (mirrors `dev-theme-bundle.ts`
 * `looksLikeDataOnlyManifest`, not imported — same reason: lane decoupling).
 */
function looksLikeDataOnlyManifest(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if ("presentationSurfaces" in value || "assetManifest" in value) return true;
  return "key" in value && "api" in value;
}

/** Stable editor id for a theme section: `theme:{themeId}/{sectionKey}`. */
export function devThemeWidgetId(themeId: string, sectionKey: string): string {
  return `theme:${themeId}/${sectionKey}`;
}

function settingToField(setting: DevThemeSetting): PropField | null {
  const kind = SETTING_TO_PROP_KIND[setting.type];
  if (!kind) return null;
  return { key: setting.key, label: setting.label, kind };
}

/**
 * Adapt a `dev.theme.json` manifest to editor WidgetDefs (one per section,
 * all sharing the theme's settings schema — props arriving at a developer
 * component are the merchant's settings values only, per the SDK contract
 * §3). Unknown setting types fail closed (never an invented kind); duplicate
 * section keys fail closed (ids must stay 1:1 with sections).
 */
export function fromDevThemeManifest(input: unknown): DevThemeWidgetsVerdict {
  if (looksLikeDataOnlyManifest(input)) {
    return {
      ok: false,
      errors: ["widgets.wrong_lane:data-only-theme-manifest"],
    };
  }
  const parsed = parseDevThemeManifest(input);
  if (!parsed.ok) {
    return {
      ok: false,
      errors: parsed.errors.map((e) => `widgets.manifest:${e}`),
    };
  }
  const manifest: DevThemeManifest = parsed.manifest;

  const fields: PropField[] = [];
  for (const setting of manifest.settings) {
    const field = settingToField(setting);
    if (!field) {
      return {
        ok: false,
        errors: [`widgets.unknown_setting_type:${String(setting.type)}`],
      };
    }
    fields.push(field);
  }

  const seen = new Set<string>();
  const defs: DevThemeWidgetDef[] = [];
  for (const section of manifest.sections) {
    if (seen.has(section.key)) {
      return {
        ok: false,
        errors: [`widgets.duplicate_section:${section.key}`],
      };
    }
    seen.add(section.key);
    const schemaFields = fields.map((f) => ({ ...f }));
    defs.push({
      id: devThemeWidgetId(manifest.id, section.key),
      namespace: "theme",
      version: manifest.version,
      label: section.key,
      category: manifest.id,
      slots: [section.slot],
      defaults: defaultsFor({ fields: schemaFields }),
      propsSchema: { fields: schemaFields },
      renderer: "custom",
      themeId: manifest.id,
      sectionKey: section.key,
      component: section.component,
    });
  }
  return { ok: true, defs, warnings: [] };
}

/** Validate merchant props for a theme def through the shared value layer. */
export function validateDevThemeWidgetProps(
  def: DevThemeWidgetDef,
  props: unknown,
): { ok: boolean; errors: string[]; clean: WidgetProps } {
  return validateProps(def.propsSchema, props);
}
