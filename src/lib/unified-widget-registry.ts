/**
 * Unified widget registry — shims and adapters over the three existing systems.
 *
 * The builder grew three un-unified widget sources: builtin renderers
 * (`src/components/builder/widgets.tsx`), the studio `WIDGETS` catalogue
 * (`src/lib/studio/catalog.ts`), and installed plugin widgets resolved by
 * `resolvePluginWidget` (`src/lib/plugin-manifest.ts`). This module unifies
 * them as a read-only registry layer: it adapts each source into one
 * `WidgetDef` shape and resolves ids to defs or to labelled-missing outcomes.
 *
 * What this module is NOT:
 * - Not a rewrite: renderers, the closed Phase 0.2 `WIDGET_REGISTRY` /
 *   `WidgetMeta` module (`src/lib/widget-registry.ts`, untouched), the studio
 *   catalogue and the plugin resolver all stay authoritative for their tiers.
 * - Not a privilege grant: registration is pure metadata. `WidgetDef` carries
 *   no scopes, permissions, capabilities or bundle-entry members, and
 *   `registerWidget` builds a fresh allow-listed object so hostile extra keys
 *   are dropped, never stored.
 * - Not persistent: all state is in-memory Maps. No DB, no network, no React.
 *
 * Empty-schema convention: adapters emit `propsSchema: { fields: [] }` for
 * builtin and studio defs because neither source ships a per-widget control
 * schema. That empty schema means "legacy-unvalidated — render/validate via
 * the old path" (builtin renderers + `WIDGET_REGISTRY` fields, studio twins),
 * NOT a validation bypass for newly authored schemas: any `fields` present
 * are validated on registration.
 */

import { catalogEntry, type SectionType } from "./builder-ast";
import { compareSemver, parseSemver } from "./marketplace-scopes";
import {
  BUILDER_API_VERSION,
  pluginWidgetKey,
  satisfiesApiRange,
  type InstalledPlugin,
} from "./plugin-manifest";
import {
  WIDGETS as STUDIO_CATALOG,
  type WidgetDef as StudioWidgetDef,
} from "./studio/catalog";
import {
  GENERIC_WIDGETS,
  WIDGET_COMPONENTS,
} from "../components/builder/widgets";
import { CHROME_WIDGETS } from "../components/builder/chrome";
import { MERCH_WIDGETS } from "../components/builder/merch";
import { PDP_WIDGETS } from "../components/builder/pdp";
import { COLLECTION_WIDGETS } from "../components/builder/collection";
import { CART_WIDGETS } from "../components/builder/cart";
import { ACCOUNT_WIDGETS } from "../components/builder/account";
import { APPAREL_WIDGETS } from "../components/builder/apparel";
import { HERITAGE_WIDGETS } from "../components/builder/heritage";
import { SOMVABONA_WIDGETS } from "../components/builder/somvabona";
import { BASIC_WIDGETS } from "../components/builder/basics";
import { BLOG_WIDGETS } from "../components/builder/blog";
import { CIRCUIT_WIDGETS } from "../components/builder/electronics";
import { BEAUTY_WIDGETS } from "../components/builder/beauty";
import { BEAUTY_HOME_WIDGETS } from "../components/builder/beauty-home";
import { SONGOSKRITI_WIDGETS } from "../components/builder/songoskriti";

/* ------------------------------------------------------------------ shapes */

export type PropFieldKind =
  | "text"
  | "richtext"
  | "number"
  | "boolean"
  | "select"
  | "color"
  | "typography"
  | "spacing"
  | "dimensions"
  | "responsive"
  | "image"
  | "media"
  | "video"
  | "product"
  | "collection"
  | "category"
  | "repeater"
  | "group"
  | "link"
  | "icon"
  | "visibility"
  | "animation";

export type PropField = {
  key: string;
  label: string;
  help?: string;
  kind: PropFieldKind;
  required?: boolean;
  default?: unknown;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  fields?: PropField[];
  showWhen?: { key: string; equals: unknown };
};

export type PropSchema = { fields: PropField[] };

export type WidgetDef = {
  id: string;
  namespace: "builtin" | "studio" | "plugin" | "theme";
  version: string;
  label: string;
  category: string;
  slots: string[];
  defaults: Record<string, unknown>;
  propsSchema: PropSchema;
  themes?: string[];
  renderer: "builtin" | "sandbox" | "custom";
  minBuilderApi?: string;
};

export type MissingReason =
  "unknown" | "disabled" | "incompatible" | "uninstalled";

export type ResolveContext = {
  /** Pin an older retained version; absent means the newest registered. */
  version?: string;
  /** Builder API the caller runs; defaults to BUILDER_API_VERSION. */
  builderApi?: string;
  /** Authored node data, echoed back untouched on every miss. */
  data?: Record<string, unknown>;
};

export type ResolveResult =
  | { ok: true; def: WidgetDef }
  | {
      ok: false;
      missing: {
        reason: MissingReason;
        preservedData: Record<string, unknown>;
        widgetId: string;
      };
    };

export type RegisterVerdict =
  | { ok: true; def: WidgetDef; deprecatedId: boolean }
  | { ok: false; error: string };

export type MutationVerdict = { ok: true } | { ok: false; error: string };

/* -------------------------------------------------------------- validation */

const NAMESPACES = ["builtin", "studio", "plugin", "theme"] as const;
type Namespace = (typeof NAMESPACES)[number];

const NAMESPACED_ID_RE =
  /^(builtin|studio|plugin|theme):[a-z][a-z0-9_-]*(\/[a-z][a-z0-9_-]*)?$/;
const LEGACY_BARE_RE = /^[a-z][a-z0-9_-]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const PROP_KINDS: ReadonlySet<string> = new Set([
  "text",
  "richtext",
  "number",
  "boolean",
  "select",
  "color",
  "typography",
  "spacing",
  "dimensions",
  "responsive",
  "image",
  "media",
  "video",
  "product",
  "collection",
  "category",
  "repeater",
  "group",
  "link",
  "icon",
  "visibility",
  "animation",
]);

const RENDERERS: ReadonlySet<string> = new Set([
  "builtin",
  "sandbox",
  "custom",
]);

const PLUGIN_ID_RE = /^plugin:[^/]+\/.+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cloneJson<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function sanitizeField(raw: unknown): PropField | null {
  if (!isRecord(raw)) return null;
  if (!isNonEmptyString(raw.key) || !isNonEmptyString(raw.label)) return null;
  if (typeof raw.kind !== "string" || !PROP_KINDS.has(raw.kind)) return null;
  const field: PropField = {
    key: raw.key,
    label: raw.label,
    kind: raw.kind as PropFieldKind,
  };
  if (typeof raw.help === "string") field.help = raw.help;
  if (typeof raw.required === "boolean") field.required = raw.required;
  if (raw.default !== undefined) field.default = cloneJson(raw.default);
  if (Array.isArray(raw.options)) {
    const options: { value: string; label: string }[] = [];
    for (const o of raw.options) {
      if (!isRecord(o) || typeof o.value !== "string") return null;
      options.push({
        value: o.value,
        label: typeof o.label === "string" ? o.label : o.value,
      });
    }
    field.options = options;
  }
  if (typeof raw.min === "number") field.min = raw.min;
  if (typeof raw.max === "number") field.max = raw.max;
  if (raw.fields !== undefined) {
    if (!Array.isArray(raw.fields)) return null;
    const nested: PropField[] = [];
    for (const child of raw.fields) {
      const clean = sanitizeField(child);
      if (!clean) return null;
      nested.push(clean);
    }
    field.fields = nested;
  }
  if (raw.showWhen !== undefined) {
    if (!isRecord(raw.showWhen) || typeof raw.showWhen.key !== "string")
      return null;
    field.showWhen = { key: raw.showWhen.key, equals: raw.showWhen.equals };
  }
  return field;
}

/**
 * Validate `input` and build a fresh allow-listed WidgetDef. Only the
 * contract members are copied — scopes/permissions/capabilities/entry (or
 * any other unexpected key) never reach the stored object, so registration
 * cannot grant runtime privilege.
 */
function sanitizeDef(
  input: unknown,
):
  | { ok: true; def: WidgetDef; deprecatedId: boolean }
  | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: "def_not_an_object" };
  const rawId = input.id;
  if (typeof rawId !== "string") return { ok: false, error: "bad_id" };
  const id = rawId.trim();
  let deprecatedId = false;
  if (NAMESPACED_ID_RE.test(id)) {
    deprecatedId = false;
  } else if (LEGACY_BARE_RE.test(id)) {
    // Grandfathered pre-unification builtin ids (saved page ASTs address
    // widgets by bare `type`). Kept working, flagged for migration.
    deprecatedId = true;
  } else {
    return { ok: false, error: "bad_id" };
  }

  const namespace = input.namespace;
  if (
    typeof namespace !== "string" ||
    !(NAMESPACES as readonly string[]).includes(namespace)
  ) {
    return { ok: false, error: "bad_namespace" };
  }
  if (deprecatedId && namespace !== "builtin") {
    return { ok: false, error: "namespace_id_mismatch" };
  }
  if (!deprecatedId) {
    const prefix = `${namespace}:`;
    if (!id.startsWith(prefix))
      return { ok: false, error: "namespace_id_mismatch" };
  }
  if (
    typeof input.version !== "string" ||
    !VERSION_RE.test(input.version.trim())
  ) {
    return { ok: false, error: "bad_version" };
  }
  if (!isNonEmptyString(input.label)) return { ok: false, error: "bad_label" };
  if (!isNonEmptyString(input.category))
    return { ok: false, error: "bad_category" };
  if (
    !Array.isArray(input.slots) ||
    !input.slots.every((s) => typeof s === "string")
  ) {
    return { ok: false, error: "bad_slots" };
  }
  if (!isRecord(input.defaults)) return { ok: false, error: "bad_defaults" };
  if (
    !isRecord(input.propsSchema) ||
    !Array.isArray(input.propsSchema.fields)
  ) {
    return { ok: false, error: "bad_props_schema" };
  }
  const fields: PropField[] = [];
  for (const f of input.propsSchema.fields) {
    const clean = sanitizeField(f);
    if (!clean) return { ok: false, error: "bad_prop_field" };
    fields.push(clean);
  }
  if (typeof input.renderer !== "string" || !RENDERERS.has(input.renderer)) {
    return { ok: false, error: "bad_renderer" };
  }
  if (input.themes !== undefined) {
    if (
      !Array.isArray(input.themes) ||
      !input.themes.every((t) => typeof t === "string")
    ) {
      return { ok: false, error: "bad_themes" };
    }
  }
  if (input.minBuilderApi !== undefined) {
    if (
      typeof input.minBuilderApi !== "string" ||
      !VERSION_RE.test(input.minBuilderApi.trim())
    ) {
      return { ok: false, error: "bad_min_builder_api" };
    }
  }

  const def: WidgetDef = {
    id,
    namespace: namespace as Namespace,
    version: input.version.trim(),
    label: input.label,
    category: input.category,
    slots: [...input.slots],
    defaults: cloneJson(input.defaults) as Record<string, unknown>,
    propsSchema: { fields },
    renderer: input.renderer as WidgetDef["renderer"],
  };
  if (input.themes !== undefined) def.themes = [...(input.themes as string[])];
  if (input.minBuilderApi !== undefined) {
    def.minBuilderApi = (input.minBuilderApi as string).trim();
  }
  return { ok: true, def: deepFreeze(def), deprecatedId };
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value))
    return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item, seen);
  } else {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key], seen);
    }
  }
  return Object.freeze(value);
}

/* ---------------------------------------------------------------- registry */

type RegistryRecord = {
  versions: Map<string, WidgetDef>;
  latest: string;
  enabled: boolean;
  deprecatedId: boolean;
};

function rankVersions(versions: Iterable<string>): string {
  let best: string | null = null;
  for (const v of versions) {
    if (best === null) {
      best = v;
      continue;
    }
    const a = parseSemver(v);
    const b = parseSemver(best);
    if (a && b ? compareSemver(v, best) > 0 : v > best) best = v;
  }
  return best ?? "";
}

function miss(
  widgetId: string,
  reason: MissingReason,
  ctx: ResolveContext,
): ResolveResult {
  const data =
    ctx.data !== undefined && isRecord(ctx.data) ? cloneJson(ctx.data) : {};
  return { ok: false, missing: { reason, preservedData: data, widgetId } };
}

export type UnifiedRegistry = {
  registerWidget(def: unknown): RegisterVerdict;
  resolveWidget(id: unknown, ctx?: ResolveContext): ResolveResult;
  enableWidget(id: unknown): MutationVerdict;
  disableWidget(id: unknown): MutationVerdict;
  updateWidget(id: unknown, def: unknown): MutationVerdict;
  removeWidget(id: unknown): MutationVerdict;
  rollbackWidget(id: unknown, version: string): MutationVerdict;
  getWidget(id: unknown, version?: string): WidgetDef | undefined;
  listWidgets(): WidgetDef[];
  widgetIds(): string[];
  isDeprecatedId(id: unknown): boolean;
  clear(): void;
};

export function createWidgetRegistry(): UnifiedRegistry {
  const store = new Map<string, RegistryRecord>();
  const tombstones = new Map<string, RegistryRecord>();

  /** Ids to probe, in order: exact, then the builtin bare↔namespaced alias. */
  function candidates(id: string): string[] {
    if (store.has(id)) return [id];
    if (!id.includes(":")) {
      const namespaced = `builtin:${id}`;
      return store.has(namespaced) ? [namespaced] : [id];
    }
    if (id.startsWith("builtin:")) {
      const bare = id.slice("builtin:".length);
      return store.has(bare) ? [bare] : [id];
    }
    return [id];
  }

  function lookup(id: unknown): { key: string; record: RegistryRecord } | null {
    if (typeof id !== "string") return null;
    const trimmed = id.trim();
    if (!trimmed) return null;
    for (const key of candidates(trimmed)) {
      const record = store.get(key);
      if (record) return { key, record };
    }
    return null;
  }

  function registerWidget(def: unknown): RegisterVerdict {
    try {
      const clean = sanitizeDef(def);
      if (!clean.ok) return clean;
      const existing = lookup(clean.def.id);
      const key = existing ? existing.key : clean.def.id;
      const record: RegistryRecord = existing
        ? existing.record
        : {
            versions: new Map(),
            latest: "",
            enabled: true,
            deprecatedId: false,
          };
      record.versions.set(clean.def.version, clean.def);
      record.latest = rankVersions(record.versions.keys());
      record.deprecatedId = record.deprecatedId || clean.deprecatedId;
      if (!existing) {
        store.set(key, record);
        tombstones.delete(key);
      }
      return {
        ok: true,
        def: record.versions.get(clean.def.version)!,
        deprecatedId: clean.deprecatedId,
      };
    } catch {
      return { ok: false, error: "invalid_def" };
    }
  }

  function resolveWidget(id: unknown, ctx: ResolveContext = {}): ResolveResult {
    try {
      const context: ResolveContext = isRecord(ctx) ? ctx : {};
      if (typeof id !== "string" || !id.trim())
        return miss(String(id), "unknown", context);
      const trimmed = id.trim();
      const found = lookup(trimmed);
      if (!found) {
        return miss(
          trimmed,
          PLUGIN_ID_RE.test(trimmed) ? "uninstalled" : "unknown",
          context,
        );
      }
      if (!found.record.enabled) return miss(trimmed, "disabled", context);
      const want =
        typeof context.version === "string"
          ? context.version
          : found.record.latest;
      const def = found.record.versions.get(want);
      if (!def) return miss(trimmed, "unknown", context);
      if (def.minBuilderApi) {
        const running =
          typeof context.builderApi === "string"
            ? context.builderApi
            : BUILDER_API_VERSION;
        if (parseSemver(running) && parseSemver(def.minBuilderApi)) {
          if (compareSemver(running, def.minBuilderApi) < 0) {
            return miss(trimmed, "incompatible", context);
          }
        }
      }
      return { ok: true, def };
    } catch {
      const data =
        isRecord(ctx) && isRecord(ctx.data) ? cloneJson(ctx.data) : {};
      return {
        ok: false,
        missing: {
          reason: "unknown",
          preservedData: data,
          widgetId: String(id),
        },
      };
    }
  }

  function setEnabled(id: unknown, enabled: boolean): MutationVerdict {
    const found = lookup(id);
    if (!found) return { ok: false, error: "unknown_widget" };
    found.record.enabled = enabled;
    return { ok: true };
  }

  return {
    registerWidget,
    resolveWidget,
    enableWidget: (id) => setEnabled(id, true),
    disableWidget: (id) => setEnabled(id, false),

    updateWidget(id, def) {
      const found = lookup(id);
      if (!found) return { ok: false, error: "unknown_widget" };
      const clean = sanitizeDef(def);
      if (!clean.ok) return clean;
      // The update must address the same record (aliases allowed).
      if (
        !candidates(clean.def.id).includes(found.key) &&
        clean.def.id !== found.key
      ) {
        return { ok: false, error: "id_mismatch" };
      }
      found.record.versions.set(clean.def.version, clean.def);
      found.record.latest = rankVersions(found.record.versions.keys());
      return { ok: true };
    },

    removeWidget(id) {
      const found = lookup(id);
      if (!found) return { ok: false, error: "unknown_widget" };
      // Tombstone the record: referencing pages keep resolving to a
      // placeholder-with-data instead of a hole, and re-registration starts clean.
      tombstones.set(found.key, found.record);
      store.delete(found.key);
      return { ok: true };
    },

    rollbackWidget(id, version) {
      const found = lookup(id);
      if (!found) return { ok: false, error: "unknown_widget" };
      if (typeof version !== "string" || !found.record.versions.has(version)) {
        return { ok: false, error: "unknown_version" };
      }
      found.record.latest = version;
      return { ok: true };
    },

    getWidget(id, version) {
      const found = lookup(id);
      if (!found) return undefined;
      if (typeof version === "string")
        return found.record.versions.get(version);
      return found.record.versions.get(found.record.latest);
    },

    listWidgets() {
      return [...store.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, record]) => record.versions.get(record.latest)!);
    },

    widgetIds() {
      return [...store.keys()].sort();
    },

    isDeprecatedId(id) {
      if (typeof id !== "string") return false;
      return store.get(id.trim())?.deprecatedId ?? false;
    },

    clear() {
      store.clear();
      tombstones.clear();
    },
  };
}

/* ------------------------------------------- module singleton (shared use) */

const shared = createWidgetRegistry();

export function registerWidget(def: unknown): RegisterVerdict {
  return shared.registerWidget(def);
}
export function resolveWidget(
  id: unknown,
  ctx?: ResolveContext,
): ResolveResult {
  return shared.resolveWidget(id, ctx);
}
export function enableWidget(id: unknown): MutationVerdict {
  return shared.enableWidget(id);
}
export function disableWidget(id: unknown): MutationVerdict {
  return shared.disableWidget(id);
}
export function updateWidget(id: unknown, def: unknown): MutationVerdict {
  return shared.updateWidget(id, def);
}
export function removeWidget(id: unknown): MutationVerdict {
  return shared.removeWidget(id);
}
export function rollbackWidget(id: unknown, version: string): MutationVerdict {
  return shared.rollbackWidget(id, version);
}
export function getWidget(
  id: unknown,
  version?: string,
): WidgetDef | undefined {
  return shared.getWidget(id, version);
}
export function listWidgets(): WidgetDef[] {
  return shared.listWidgets();
}
export function widgetIds(): string[] {
  return shared.widgetIds();
}
export function isDeprecatedId(id: unknown): boolean {
  return shared.isDeprecatedId(id);
}
/** Test/support helper: empty the shared singleton. Factories are isolated already. */
export function clearRegistry(): void {
  shared.clear();
}

/* ---------------------------------------------------------------- adapters */

/**
 * Source maps for the builtin adapter. Defaults are the exported
 * `WIDGET_COMPONENTS` / `GENERIC_WIDGETS` maps plus every per-pack map they
 * compose; callers holding a subset (tests, previews) may inject their own.
 * The adapter only reads keys — sources are never mutated.
 */
export type BuiltinSource = {
  components?: Record<string, unknown>;
  generic?: Record<string, unknown>;
  packs?: Array<Record<string, unknown>>;
};

const PACK_MAPS: Array<Record<string, unknown>> = [
  CHROME_WIDGETS as Record<string, unknown>,
  MERCH_WIDGETS as Record<string, unknown>,
  PDP_WIDGETS as Record<string, unknown>,
  COLLECTION_WIDGETS as Record<string, unknown>,
  CART_WIDGETS as Record<string, unknown>,
  ACCOUNT_WIDGETS as Record<string, unknown>,
  APPAREL_WIDGETS as Record<string, unknown>,
  HERITAGE_WIDGETS as Record<string, unknown>,
  SOMVABONA_WIDGETS as Record<string, unknown>,
  BASIC_WIDGETS as Record<string, unknown>,
  BLOG_WIDGETS as Record<string, unknown>,
  CIRCUIT_WIDGETS as Record<string, unknown>,
  BEAUTY_WIDGETS as Record<string, unknown>,
  BEAUTY_HOME_WIDGETS as Record<string, unknown>,
  SONGOSKRITI_WIDGETS as Record<string, unknown>,
];

/**
 * Adapt builtin renderers to WidgetDefs. Enrichment (label, category, slots,
 * defaults) comes from the AST catalogue via `catalogEntry` — the Phase 0.2
 * `WIDGET_REGISTRY` module is deliberately not imported. Renderer is
 * `builtin`; `propsSchema` is the permissive empty legacy-unvalidated shape.
 */
export function fromBuiltinWidgets(source?: BuiltinSource): WidgetDef[] {
  const components =
    source?.components ?? (WIDGET_COMPONENTS as Record<string, unknown>);
  const generic =
    source?.generic ?? (GENERIC_WIDGETS as Record<string, unknown>);
  const packs = source?.packs ?? PACK_MAPS;
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const map of [components, generic, ...packs]) {
    if (!map || typeof map !== "object") continue;
    for (const key of Object.keys(map)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys.map((key) => {
    const entry = catalogEntry(key as SectionType);
    return deepFreeze({
      id: `builtin:${key}`,
      namespace: "builtin" as const,
      version: "1.0.0",
      label: entry?.label ?? key,
      category: entry?.group ?? "general",
      slots: entry ? [...entry.slots] : [],
      defaults: entry
        ? (cloneJson(entry.defaults) as Record<string, unknown>)
        : {},
      propsSchema: { fields: [] },
      renderer: "builtin" as const,
    });
  });
}

/**
 * Adapt the studio `WIDGETS` catalogue. Studio entries declare categories
 * and defaults but no block slots and no control schemas, so slots are `[]`
 * and the schema is the legacy-unvalidated empty shape. Renderer is `custom`
 * (the studio twin renderer — neither the storefront builtin nor the plugin
 * sandbox). Read-only over the input array.
 */
export function fromStudioCatalog(
  catalog: readonly StudioWidgetDef[] = STUDIO_CATALOG,
): WidgetDef[] {
  return catalog.map((entry) =>
    deepFreeze({
      id: `studio:${entry.key}`,
      namespace: "studio" as const,
      version: "1.0.0",
      label: entry.label,
      category: entry.category,
      slots: [],
      defaults: cloneJson(entry.defaults) as Record<string, unknown>,
      propsSchema: { fields: [] },
      renderer: "custom" as const,
    }),
  );
}

/** Minimum builder API implied by a manifest `api` range (`^x.y.z`, `>=a <b`). */
function minApiFromRange(range: string): string | undefined {
  const trimmed = range.trim();
  const caret = /^\^(\d+\.\d+\.\d+)$/.exec(trimmed);
  if (caret) return caret[1];
  const pair = /^>=\s*(\d+\.\d+\.\d+)\s+<\s*(\d+\.\d+\.\d+)$/.exec(trimmed);
  if (pair) return pair[1];
  if (/^\d+\.\d+\.\d+$/.test(trimmed)) return trimmed;
  return undefined;
}

/**
 * Adapt installed plugin widgets. Filtering mirrors the existing resolver
 * semantics (`resolvePluginWidget` / `pluginTrayEntries`): merchant-disabled
 * installs and builder-incompatible manifests contribute nothing — those
 * states surface at resolve time as `disabled` / `incompatible` misses with
 * data preserved. Renderer is `sandbox` (bundles run only in the null-origin
 * island; the registry never sees the entry bytes — no `entry` member
 * exists on WidgetDef). Plugin settings are per-install merchant config, so
 * `defaults` is `{}` and the schema is the empty legacy-unvalidated shape.
 */
export function fromPluginManifest(
  installed: readonly InstalledPlugin[],
  opts?: { api?: string },
): WidgetDef[] {
  const api = opts?.api ?? BUILDER_API_VERSION;
  const out: WidgetDef[] = [];
  for (const item of installed) {
    if (!item || !item.enabled) continue;
    const manifest = item.manifest;
    if (!manifest || !satisfiesApiRange(manifest.api, api)) continue;
    const minBuilderApi = minApiFromRange(manifest.api);
    for (const w of manifest.widgets) {
      const def: WidgetDef = {
        id: pluginWidgetKey(manifest.id, w.key),
        namespace: "plugin",
        version: manifest.version,
        label: w.label,
        category: "plugin",
        slots: [...w.slots],
        defaults: {},
        propsSchema: { fields: [] },
        renderer: "sandbox",
      };
      if (minBuilderApi) def.minBuilderApi = minBuilderApi;
      out.push(deepFreeze(def));
    }
  }
  return out;
}
