/**
 * Level B (reviewed developer themes) — theme-owned widget schemas (pure).
 *
 * PURE module: no database, no network, no filesystem, no React, no
 * singleton access, no side effects. It adapts an approved `dev.theme.json`
 * manifest's sections + settings into editor WidgetDefs through the SAME
 * value-layer shape every other tier uses (`PropField` in
 * `src/lib/widget-props.ts`, validated by `validateProps` / `defaultsFor`):
 * no new kind vocabulary is invented. The six closed Level B setting types
 * (`DEV_THEME_FIELD_TYPES` in `dev-theme-manifest.ts`) map onto existing
 * prop kinds:
 *
 *   text → text (`multiline: true` → richtext — the SDK §4 text/textarea
 *     mirror), image → image, color → color, spacing → spacing,
 *   product-selection → product (`multiple: true` → repeater of product —
 *     the repeater-grade catalogue control), animation → animation.
 *
 * Two schema layers per def:
 * - SHARED: the theme-level `settings` array is carried by EVERY section
 *   def unchanged (settings shared across sections stay shared).
 * - PER-WIDGET: a section's own `settings` array (forward-compatible — the
 *   frozen manifest gate ignores it, this adapter reads it from the raw
 *   input) extends ONLY that section's def (`propsSchema` + `defaults`).
 *   A key claimed twice (shared∩section, or twice inside one layer) fails
 *   closed — schemas can never silently mix.
 *
 * Declared modifiers ride on existing `PropField` members only
 * (`required`, `default`, `help`, `min`, `max`); unknown modifier keys are
 * ignored (forward-compatible metadata, never kinds). Declared defaults
 * are JSON-cloned and always re-validate through the value layer.
 *
 * Registry contract: each def satisfies the shared `registerWidget` gate
 * (`src/lib/unified-widget-registry.ts` `sanitizeDef`) — `theme:` namespaced
 * id, semver version, non-empty label/category, string slots, record
 * defaults, `{ fields }` schema of closed kinds, `custom` renderer — plus a
 * `themes: [manifest.id]` claim so `themeTrayEntries` discovers the active
 * theme's entries. This module does NOT register anything itself: callers
 * register the returned defs (the builder route registers into its
 * route-local registry via `activeDevThemeWidgetDefs`), and resolution +
 * validation go through the existing registry + value-layer paths, so the
 * editor can never disagree with the storefront about a field's shape.
 *
 * What this module does NOT grant: `renderer: "custom"` is editor-only.
 * Storefront execution of approved bundles happens exclusively inside the
 * sandboxed `ThemeRuntime` frame (see `dev-theme-activate.ts`
 * `bindDevThemeRuntime`); a registered theme def never executes in page
 * DOM. Editor preview of uploaded-theme widgets goes through the sandboxed
 * `ThemeWidgetPreview` + versioned preview envelope (`bridge-v2.ts`
 * `buildThemePreviewEnvelope`) — never a page-DOM component.
 *
 * Lane separation: data-only manifests (`theme.json` shape) are refused with
 * `widgets.wrong_lane` — the frozen `theme-package.ts` gate is NOT modified.
 */

import {
  DEV_THEME_MAX_SETTINGS,
  parseDevThemeManifest,
  type DevThemeManifest,
  type DevThemeSetting,
} from "./dev-theme-manifest";
import {
  defaultsFor,
  validateProps,
  type JsonValue,
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
  /**
   * Registry-visible ownership claim (`themes: [manifest.id]`) so
   * `themeTrayEntries` discovers the active theme's entries. Allow-listed
   * by the registry gate (kept, unlike the lane metadata below).
   */
  themes: string[];
  /** Lane metadata (kept here for the asset pipeline: which theme section
   * this def editors for). `themeId` and `themeComponent` are additionally
   * allow-listed by the registry gate (inert name tokens) so the renderer
   * can address the approved component through a server-projected binding;
   * `sectionKey`/`component` stay lane-local. */
  themeId: string;
  sectionKey: string;
  component: string;
  themeComponent: string;
};

export type DevThemeWidgetsVerdict =
  | { ok: true; defs: DevThemeWidgetDef[]; warnings: [] }
  | { ok: false; errors: string[] };

/** Closed mapping — every target kind exists in `PROP_KINDS`. */
const SETTING_TO_PROP_KIND: Record<string, PropField["kind"]> = {
  text: "text",
  image: "image",
  color: "color",
  spacing: "spacing",
  "product-selection": "product",
  animation: "animation",
};

/**
 * Key shape mirror of the frozen manifest gate (`KEY_RE` in
 * `dev-theme-manifest.ts`, which cannot export it without modification).
 * Duplicated, not imported — same lane-decoupling reason as the data-only
 * probe below.
 */
const KEY_RE = /^[a-z][a-z0-9_-]{1,39}$/;
/** `validateProps` reserves `bp` for responsive override layers. */
const RESERVED_KEYS: ReadonlySet<string> = new Set(["bp"]);
const LABEL_MAX = 80;
const HELP_MAX = 200;

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

/** Raw sibling arrays the frozen manifest gate passes through untouched. */
function rawRecordArray(input: unknown, key: string): unknown[] {
  if (!isRecord(input)) return [];
  const value = input[key];
  return Array.isArray(value) ? value : [];
}

/** JSON-safe clone for declared defaults (non-JSON defaults are dropped). */
function jsonDefault(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  try {
    const clone: unknown = JSON.parse(JSON.stringify(value));
    if (
      clone === null ||
      typeof clone === "string" ||
      typeof clone === "number" ||
      typeof clone === "boolean" ||
      Array.isArray(clone) ||
      isRecord(clone)
    ) {
      return clone as JsonValue;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Map one Level B setting (+ its raw declarative modifiers) onto an
 * existing prop kind. Unknown setting types return null (fail closed —
 * never an invented kind). Grade modifiers select richer EXISTING kinds:
 * `multiline` text → richtext, `multiple` product-selection → repeater of
 * product. Every other modifier rides an existing `PropField` member.
 */
function settingToField(
  setting: DevThemeSetting,
  extras: Record<string, unknown>,
): PropField | null {
  const base = SETTING_TO_PROP_KIND[setting.type];
  if (!base) return null;
  let kind: PropField["kind"] = base;
  let nested: PropField[] | undefined;
  if (setting.type === "text" && extras.multiline === true) {
    kind = "richtext";
  }
  if (setting.type === "product-selection" && extras.multiple === true) {
    kind = "repeater";
    nested = [{ key: "id", label: setting.label, kind: "product" }];
  }
  const field: PropField = { key: setting.key, label: setting.label, kind };
  if (typeof extras.required === "boolean") field.required = extras.required;
  if (typeof extras.help === "string" && extras.help.trim()) {
    field.help = extras.help.trim().slice(0, HELP_MAX);
  }
  if (typeof extras.min === "number" && Number.isFinite(extras.min)) {
    field.min = extras.min;
  }
  if (typeof extras.max === "number" && Number.isFinite(extras.max)) {
    field.max = extras.max;
  }
  const fallback = jsonDefault(extras.default);
  if (fallback !== undefined) field.default = fallback;
  if (nested) field.fields = nested;
  return field;
}

function extrasFor(
  rawSettings: unknown[],
  key: string,
): Record<string, unknown> {
  for (const raw of rawSettings) {
    if (isRecord(raw) && raw.key === key) return raw;
  }
  return {};
}

type SectionSetting =
  | { ok: true; setting: DevThemeSetting; extras: Record<string, unknown> }
  | { ok: false; error: string };

/** Validate one section-declared setting through the same closed gate. */
function checkSectionSetting(
  raw: unknown,
  sectionKey: string,
  index: number,
): SectionSetting {
  if (!isRecord(raw)) {
    return {
      ok: false,
      error: `widgets.bad_section_setting:${sectionKey}:${index}`,
    };
  }
  if (typeof raw.key !== "string" || !KEY_RE.test(raw.key)) {
    return {
      ok: false,
      error: `widgets.bad_section_setting:${sectionKey}:${index}`,
    };
  }
  if (typeof raw.label !== "string" || !raw.label.trim()) {
    return {
      ok: false,
      error: `widgets.bad_section_setting:${sectionKey}:${index}`,
    };
  }
  if (
    typeof raw.type !== "string" ||
    !(SETTING_TO_PROP_KIND as Record<string, unknown>)[raw.type]
  ) {
    return {
      ok: false,
      error: `widgets.unknown_setting_type:${String(raw.type)}`,
    };
  }
  return {
    ok: true,
    setting: {
      key: raw.key,
      label: raw.label.slice(0, LABEL_MAX),
      type: raw.type as DevThemeSetting["type"],
    },
    extras: raw,
  };
}

/** Deep clone (fields are JSON-safe by construction — no shared refs). */
function cloneField(field: PropField): PropField {
  return JSON.parse(JSON.stringify(field)) as PropField;
}

/**
 * Adapt a `dev.theme.json` manifest to editor WidgetDefs (one per section).
 * Theme-level settings are shared by every def; a section's own `settings`
 * extend only its def. Unknown setting types, duplicate keys, reserved
 * keys and oversize defs fail closed (never an invented kind, never a
 * partial registry).
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

  const rawSettings = rawRecordArray(input, "settings");
  const rawSections = rawRecordArray(input, "sections");
  const rawSectionByKey = new Map<string, Record<string, unknown>>();
  for (const raw of rawSections) {
    if (isRecord(raw) && typeof raw.key === "string") {
      rawSectionByKey.set(raw.key, raw);
    }
  }

  // Shared layer: every section def carries the theme settings.
  const sharedKeys = new Set<string>();
  const sharedTemplates: PropField[] = [];
  for (const setting of manifest.settings) {
    if (RESERVED_KEYS.has(setting.key)) {
      return {
        ok: false,
        errors: [`widgets.reserved_setting_key:${setting.key}`],
      };
    }
    if (sharedKeys.has(setting.key)) {
      return {
        ok: false,
        errors: [`widgets.duplicate_setting:${setting.key}`],
      };
    }
    sharedKeys.add(setting.key);
    const field = settingToField(setting, extrasFor(rawSettings, setting.key));
    if (!field) {
      return {
        ok: false,
        errors: [`widgets.unknown_setting_type:${String(setting.type)}`],
      };
    }
    sharedTemplates.push(field);
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

    // Per-widget layer: this section's own settings (or none).
    const rawSection = rawSectionByKey.get(section.key);
    const rawSectionSettings =
      rawSection && Array.isArray(rawSection.settings)
        ? rawSection.settings
        : rawSection && "settings" in rawSection
          ? null
          : [];
    if (rawSectionSettings === null) {
      return {
        ok: false,
        errors: [`widgets.bad_section_settings:${section.key}`],
      };
    }
    const used = new Set(sharedKeys);
    const widgetFields: PropField[] = [];
    for (let index = 0; index < rawSectionSettings.length; index++) {
      const checked = checkSectionSetting(
        rawSectionSettings[index],
        section.key,
        index,
      );
      if (!checked.ok) return { ok: false, errors: [checked.error] };
      if (RESERVED_KEYS.has(checked.setting.key)) {
        return {
          ok: false,
          errors: [`widgets.reserved_setting_key:${checked.setting.key}`],
        };
      }
      if (used.has(checked.setting.key)) {
        return {
          ok: false,
          errors: [`widgets.duplicate_setting:${checked.setting.key}`],
        };
      }
      used.add(checked.setting.key);
      const field = settingToField(checked.setting, checked.extras);
      if (!field) {
        return {
          ok: false,
          errors: [
            `widgets.unknown_setting_type:${String(checked.setting.type)}`,
          ],
        };
      }
      widgetFields.push(field);
    }

    const schemaFields = [...sharedTemplates, ...widgetFields].map(cloneField);
    if (schemaFields.length > DEV_THEME_MAX_SETTINGS) {
      return {
        ok: false,
        errors: [`widgets.too_many_fields:${section.key}`],
      };
    }
    const rawLabel = rawSection?.label;
    const label =
      typeof rawLabel === "string" && rawLabel.trim()
        ? rawLabel.trim().slice(0, LABEL_MAX)
        : section.key;
    defs.push({
      id: devThemeWidgetId(manifest.id, section.key),
      namespace: "theme",
      version: manifest.version,
      label,
      category: manifest.id,
      slots: [section.slot],
      defaults: defaultsFor({ fields: schemaFields }),
      propsSchema: { fields: schemaFields },
      renderer: "custom",
      themes: [manifest.id],
      themeId: manifest.id,
      sectionKey: section.key,
      component: section.component,
      themeComponent: section.component,
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

export type ActiveDevThemeInput = {
  /** Server-authorized active theme key (workspace theme `sourceKey`). */
  themeKey: unknown;
  /**
   * Server-projected Level B manifest for the approved ACTIVE release
   * ONLY (published + approve-bound fingerprint per
   * `resolveDevThemeActivation`). Absent (or anything unparseable) adapts
   * to no defs.
   */
  manifest: unknown;
  /** Workspace theme `isActive` — only an active theme adapts. */
  isActive: unknown;
};

/**
 * Adapt the approved ACTIVE theme's Level B manifest into registerable
 * WidgetDefs — all-or-nothing. Inactive themes, missing keys, absent or
 * refusing manifests, and manifests for ANOTHER theme (id ≠ active key)
 * yield no defs, so unapproved or foreign definitions can never enter the
 * route-local registry. Never throws. Callers register the returned defs
 * into their own registry (never the global singleton).
 */
export function activeDevThemeWidgetDefs(
  input: ActiveDevThemeInput,
): DevThemeWidgetDef[] {
  try {
    if (!input || typeof input !== "object") return [];
    if (input.isActive !== true) return [];
    const key = typeof input.themeKey === "string" ? input.themeKey.trim() : "";
    if (!key) return [];
    if (input.manifest === null || input.manifest === undefined) return [];
    const verdict = fromDevThemeManifest(input.manifest);
    if (!verdict.ok) return [];
    if (!verdict.defs.every((def) => def.themeId === key)) return [];
    return verdict.defs;
  } catch {
    return [];
  }
}
