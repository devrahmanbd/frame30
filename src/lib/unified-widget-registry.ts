/**
 * Unified widget registry — ONE authoritative registry lineage.
 *
 * Single lineage: every runtime registry is built by `createWidgetRegistry`
 * (factory, isolated in-memory Maps, no global state). `buildTrayRegistry`
 * and `buildEditorExtensionRegistry` both delegate to it; no second Map
 * lineage exists. All reads go straight to the Maps — there is NO read
 * cache, so there is no stale cache: mutations (`register`/`update`/
 * `rollback`/`enable`/`disable`/`suspend`/`remove`) recompute the `latest`
 * pointer synchronously and the next `resolve`/`get` observes it. Held
 * references are frozen snapshots by design — callers must re-resolve after
 * a mutation (pinned by test).
 *
 * Legacy shims that remain (documented, not competing):
 * - Module singleton (`registerWidget`/`resolveWidget`/… + `clearRegistry`):
 *   thin delegates over ONE `shared = createWidgetRegistry()` instance, kept
 *   for legacy single-tenant callers, previews and tests. Tenant-aware code
 *   MUST NOT use it for tenant data — thread an explicit factory registry
 *   (`resolveInspectorSchema(..., registry)`, `resolvePresentation({registry})`).
 *   `buildTrayRegistry` merges it best-effort ONLY for global in-repo theme
 *   defs (e.g. songoskriti ornament); tenant defs ride explicit `themeDefs`.
 * - Static-only sources (never registries): `WIDGET_COMPONENTS`/
 *   `GENERIC_WIDGETS`/pack maps, `STUDIO_CATALOG`, the Phase 0.2
 *   `WIDGET_REGISTRY` view (read via `widgetMeta`), `PRESENTATIONS` in
 *   `theme-presentations.ts` (sibling lane, read-only input) and in
 *   `plugin-theme-contract.ts`. Each is adapted via `fromBuiltinWidgets`/
 *   `fromStudioCatalog`/`fromPluginManifest`/`activeDevThemeWidgetDefs` into
 *   `WidgetDef`s and registered — sources are never read at resolve time.
 * - `theme-presentations.ts` map stays sibling-owned (read-only input here).
 *
 * Tenant isolation: factory registries are disjoint by construction (Maps per
 * instance, frozen defs, no cross-reads). Ownership: `plugin:`/`theme:` ids
 * require `owner/widget` parts and the namespace prefix must match;
 * cross-owner resolves miss explicitly (never substitution). Version/API
 * gates: `minBuilderApi` floors resolve; `update`/`rollback` retain versions
 * with `latest` recomputed (cache invalidation). Safe states: every miss
 * carries an explicit `reason` (`unknown`|`disabled`|`suspended`|
 * `incompatible`|`uninstalled`) with authored data preserved.
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
 *   `WidgetMeta` view (`src/lib/widget-registry.ts`, read — never rewritten —
 *   through `widgetMeta`), the studio catalogue and the plugin resolver all
 *   stay authoritative for their tiers.
 * - Not a privilege grant: registration is pure metadata. `WidgetDef` carries
 *   no scopes, permissions, capabilities or bundle-entry members, and
 *   `registerWidget` builds a fresh allow-listed object so hostile extra keys
 *   are dropped, never stored.
 * - Not persistent: all state is in-memory Maps. No DB, no network, no React.
 *
 * Empty-schema convention: studio and plugin adapters emit
 * `propsSchema: { fields: [] }` because neither source ships a per-widget
 * control schema. That empty schema means "legacy-unvalidated — render/
 * validate via the old path" (studio twins, sandboxed plugin blocks), NOT a
 * validation bypass for newly authored schemas: any `fields` present are
 * validated on registration. Builtin defs are the exception: the builtin
 * adapter maps the AST catalogue inspector fields into `propsSchema`, so
 * builtins validate through the schema path like every other authored tier.
 */

import {
  catalogEntry,
  type Field as AstField,
  type SectionType,
} from "./builder-ast";
import { compareSemver, parseSemver } from "./marketplace-scopes";
import {
  BUILDER_API_VERSION,
  exactApiVersion,
  PLUGIN_CONTRACT_PATTERNS,
  pluginWidgetKey,
  sanitizePluginWidgetPropsSchema,
  satisfiesApiRange,
  validatePluginWidgetContract,
  type InstalledPlugin,
  type PluginWidgetCapabilities,
  type PluginWidgetDataRequirement,
  type PluginWidgetRendering,
  type PluginWidgetThemeCompatibility,
} from "./plugin-manifest";
import { widgetMeta } from "./widget-registry";
import {
  PROP_KINDS as VALUE_PROP_KINDS,
  validateProps,
  type JsonValue,
  type PropField as ValuePropField,
} from "./widget-props";
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

/**
 * Frame30 — single-source schema types. `PropField` is the value-layer
 * `PropField` (`src/lib/widget-props.ts`) verbatim — never a parallel copy —
 * so the registry gate, the manifest gate, and `validateProps`/`defaultsFor`
 * cannot disagree about the shape or the closed kind set. `PropFieldKind`
 * stays exported for existing importers (derived, not re-declared).
 */
export type PropFieldKind = ValuePropField["kind"];

export type PropField = ValuePropField;

export type PropSchema = { fields: PropField[] };

/**
 * Frame30 contract — registry-carried members are single-source aliases of
 * the manifest contract (like the existing `PropField` pattern above), never
 * parallel copies: the gate, the adapter and `sanitizeDef` cannot disagree.
 */
export type WidgetDataRequirement = PluginWidgetDataRequirement;
export type WidgetCapabilities = PluginWidgetCapabilities;
export type WidgetRendering = PluginWidgetRendering;
export type WidgetThemeCompatibility = PluginWidgetThemeCompatibility;

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
  /**
   * Frame30 Level B — inert uploaded-theme metadata. `themeId` is the theme
   * slug, `themeComponent` the manifest-declared section component token.
   * Both are NAME tokens only (never code, never a URL): the bridge
   * re-validates the component token before any envelope is built, and the
   * renderer additionally requires a server-projected binding whose pinned
   * identity matches. Malformed tokens are dropped at registration (the def
   * stays, rendering falls back to the explicit placeholder).
   */
  themeId?: string;
  themeComponent?: string;
  /**
   * Frame30 contract — carried from the manifest declaration (plugin tier).
   * `rendering` is `isolated` (Class A sandbox) or `themeable` (Class B);
   * `dataRequirements`/`actions`/`states` name integration points;
   * `capabilities` claims responsive/styling; `themeCompatibility` scopes
   * themes + floors the builder API. Absent means legacy-undeclared (adapter
   * defaults apply). Malformed members reject registration (`bad_*`).
   */
  rendering?: WidgetRendering;
  dataRequirements?: WidgetDataRequirement[];
  actions?: string[];
  states?: string[];
  capabilities?: WidgetCapabilities;
  themeCompatibility?: WidgetThemeCompatibility;
};

export type MissingReason =
  "unknown" | "disabled" | "suspended" | "incompatible" | "uninstalled";

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
// Single-source contract patterns (imported, not copied — see
// `PLUGIN_CONTRACT_PATTERNS` in plugin-manifest.ts).
const VERSION_RE = PLUGIN_CONTRACT_PATTERNS.VERSION_RE;
const ACTION_NAME_RE = PLUGIN_CONTRACT_PATTERNS.ACTION_NAME_RE;
const THEME_KEY_RE = PLUGIN_CONTRACT_PATTERNS.THEME_KEY_RE;

const PROP_KINDS: ReadonlySet<string> = new Set(
  VALUE_PROP_KINDS as readonly string[],
);

const RENDERERS: ReadonlySet<string> = new Set([
  "builtin",
  "sandbox",
  "custom",
]);

/**
 * Registry key shapes (intentional mirrors, not imports — documented
 * duplication like `dev-theme-widgets.ts:KEY_RE`): `FIELD_KEY_RE` allows
 * camelCase AST keys (`activeBrand`, `b1Href`) the manifest gate's lowercase
 * `KEY_RE` rejects, because the builtin adapter carries catalogue keys
 * verbatim; `HOSTILE_FIELD_KEYS` mirrors the manifest gate's set so direct
 * `registerWidget` calls face the same proto-pollution bar. Contract
 * patterns (`VERSION_RE`/`ACTION_NAME_RE`/`THEME_KEY_RE`) are imported
 * single-source via `PLUGIN_CONTRACT_PATTERNS` above — never copied.
 */
const FIELD_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const HOSTILE_FIELD_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
const MAX_REGISTRY_SCHEMA_FIELDS = 100;
const MAX_REGISTRY_NESTING_DEPTH = 4;
const MAX_REGISTRY_OPTIONS = 32;

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

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (t === "object") {
    if (!isRecord(value)) return false;
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

/** JSON-safe clone for schema-carried values (`default`, `showWhen.equals`). */
function cloneJsonValue(value: unknown): JsonValue | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return undefined;
  }
  return isJsonValue(parsed) ? parsed : undefined;
}

function sanitizeField(raw: unknown, depth = 0): PropField | null {
  if (!isRecord(raw)) return null;
  if (depth > MAX_REGISTRY_NESTING_DEPTH) return null;
  const rawKey = typeof raw.key === "string" ? raw.key : "";
  if (
    HOSTILE_FIELD_KEYS.has(rawKey) ||
    !FIELD_KEY_RE.test(rawKey) ||
    !isNonEmptyString(raw.label)
  )
    return null;
  if (typeof raw.kind !== "string" || !PROP_KINDS.has(raw.kind)) return null;
  const field: PropField = {
    key: rawKey,
    label: String(raw.label).slice(0, 80),
    kind: raw.kind as PropFieldKind,
  };
  if (typeof raw.help === "string") field.help = raw.help.slice(0, 200);
  if (typeof raw.required === "boolean") field.required = raw.required;
  if (raw.default !== undefined) {
    const d = cloneJsonValue(raw.default);
    if (d !== undefined) field.default = d;
  }
  if (raw.options !== undefined) {
    if (!Array.isArray(raw.options)) return null;
    if (raw.options.length > MAX_REGISTRY_OPTIONS) return null;
    const options: { value: string; label: string }[] = [];
    for (const o of raw.options) {
      if (!isRecord(o) || typeof o.value !== "string") return null;
      if (HOSTILE_FIELD_KEYS.has(o.value)) return null;
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
  if (field.kind === "select" && (!field.options || field.options.length === 0))
    return null;
  if (typeof raw.min === "number") field.min = raw.min;
  if (typeof raw.max === "number") field.max = raw.max;
  if (raw.fields !== undefined) {
    if (!Array.isArray(raw.fields)) return null;
    if (raw.fields.length > MAX_REGISTRY_SCHEMA_FIELDS) return null;
    const nested: PropField[] = [];
    for (const child of raw.fields) {
      const clean = sanitizeField(child, depth + 1);
      if (!clean) return null;
      nested.push(clean);
    }
    field.fields = nested;
  }
  if (raw.showWhen !== undefined) {
    if (!isRecord(raw.showWhen) || typeof raw.showWhen.key !== "string")
      return null;
    if (
      HOSTILE_FIELD_KEYS.has(raw.showWhen.key) ||
      !FIELD_KEY_RE.test(raw.showWhen.key)
    )
      return null;
    const eq = cloneJsonValue(raw.showWhen.equals);
    if (eq === undefined) return null;
    field.showWhen = { key: raw.showWhen.key, equals: eq };
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
    // Ownership: plugin/theme ids require owner/widget parts
    // (`plugin:acme/reviews`, `theme:songoskriti/finder`). A bare
    // `plugin:acme` or `theme:songoskriti` claims a namespace without an
    // owner scope — key squatting surface — so it fails closed.
    if (
      (namespace === "plugin" || namespace === "theme") &&
      !id.includes("/")
    ) {
      return { ok: false, error: "bad_id" };
    }
    if (namespace === "plugin" || namespace === "theme") {
      const rest = id.slice(prefix.length);
      const [owner, widget] = rest.split("/");
      if (
        !owner ||
        !widget ||
        HOSTILE_FIELD_KEYS.has(owner) ||
        HOSTILE_FIELD_KEYS.has(widget)
      ) {
        return { ok: false, error: "bad_id" };
      }
    }
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
  if (input.propsSchema.fields.length > MAX_REGISTRY_SCHEMA_FIELDS) {
    return { ok: false, error: "bad_props_schema" };
  }
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
  // Frame30 contract members (plugin tier carry-over). Absent means
  // legacy-undeclared; present-but-malformed rejects registration.
  if (input.rendering !== undefined) {
    if (input.rendering !== "isolated" && input.rendering !== "themeable") {
      return { ok: false, error: "bad_rendering" };
    }
  }
  if (input.dataRequirements !== undefined) {
    if (!Array.isArray(input.dataRequirements)) {
      return { ok: false, error: "bad_data_requirements" };
    }
    if (input.dataRequirements.length > 8) {
      return { ok: false, error: "bad_data_requirements" };
    }
    for (const req of input.dataRequirements) {
      if (!isRecord(req) || typeof req.source !== "string") {
        return { ok: false, error: "bad_data_requirements" };
      }
      if (HOSTILE_FIELD_KEYS.has(req.source)) {
        return { ok: false, error: "bad_data_requirements" };
      }
    }
  }
  for (const listKey of ["actions", "states"] as const) {
    const list = (input as Record<string, unknown>)[listKey];
    if (list !== undefined) {
      if (!Array.isArray(list) || list.length > 32) {
        return { ok: false, error: `bad_${listKey}` };
      }
      for (const item of list) {
        if (
          typeof item !== "string" ||
          !ACTION_NAME_RE.test(item.trim()) ||
          HOSTILE_FIELD_KEYS.has(item.trim())
        ) {
          return { ok: false, error: `bad_${listKey}` };
        }
      }
    }
  }
  if (input.capabilities !== undefined) {
    // LEGACY hostile-drop: non-record `capabilities` (e.g. `["admin"]`
    // privilege claims) are dropped, never stored, never rejected — the
    // pre-contract behavior pinned by test. Record shapes are the Frame30
    // contract and malformed records reject.
    if (!isRecord(input.capabilities)) {
      // Drop hostile non-record capabilities; def still registers.
    } else {
      for (const k of Object.keys(input.capabilities)) {
        if (k !== "responsive" && k !== "styling") {
          return { ok: false, error: "bad_capabilities" };
        }
      }
      if (
        input.capabilities.responsive !== undefined &&
        typeof input.capabilities.responsive !== "boolean"
      ) {
        return { ok: false, error: "bad_capabilities" };
      }
      const styling = (input.capabilities as Record<string, unknown>).styling;
      if (
        styling !== undefined &&
        styling !== "isolated" &&
        styling !== "tokens"
      ) {
        return { ok: false, error: "bad_capabilities" };
      }
    }
  }
  if (input.themeCompatibility !== undefined) {
    if (!isRecord(input.themeCompatibility)) {
      return { ok: false, error: "bad_theme_compatibility" };
    }
    for (const k of Object.keys(input.themeCompatibility)) {
      if (k !== "themes" && k !== "minBuilderApi") {
        return { ok: false, error: "bad_theme_compatibility" };
      }
    }
    const tc = input.themeCompatibility as Record<string, unknown>;
    if (tc.themes !== undefined) {
      if (
        !Array.isArray(tc.themes) ||
        tc.themes.length === 0 ||
        tc.themes.length > 32 ||
        !(tc.themes as unknown[]).every(
          (t) =>
            typeof t === "string" && THEME_KEY_RE.test(t.trim().toLowerCase()),
        )
      ) {
        return { ok: false, error: "bad_theme_compatibility" };
      }
    }
    if (
      tc.minBuilderApi !== undefined &&
      (typeof tc.minBuilderApi !== "string" ||
        !VERSION_RE.test((tc.minBuilderApi as string).trim()))
    ) {
      return { ok: false, error: "bad_theme_compatibility" };
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
  // Level B inert metadata: strict name-token shapes only (mirrors the
  // bridge envelope's component-token rule — documented duplication, not
  // import, so the registry stays dependency-free). Anything else is
  // dropped: the def still registers, but nothing can address it for
  // execution, so rendering falls back to the explicit placeholder.
  if (
    typeof (input as { themeId?: unknown }).themeId === "string" &&
    /^[a-z0-9-]{1,64}$/.test((input as { themeId: string }).themeId)
  ) {
    def.themeId = (input as { themeId: string }).themeId;
  }
  if (
    typeof (input as { themeComponent?: unknown }).themeComponent ===
      "string" &&
    /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(
      (input as { themeComponent: string }).themeComponent,
    )
  ) {
    def.themeComponent = (input as { themeComponent: string }).themeComponent;
  }
  if (input.minBuilderApi !== undefined) {
    def.minBuilderApi = (input.minBuilderApi as string).trim();
  }
  if (input.rendering !== undefined) {
    def.rendering = input.rendering as WidgetDef["rendering"];
  }
  if (input.dataRequirements !== undefined) {
    def.dataRequirements = cloneJson(
      input.dataRequirements,
    ) as WidgetDef["dataRequirements"];
  }
  if ((input as { actions?: unknown }).actions !== undefined) {
    def.actions = [...(input as { actions: string[] }).actions];
  }
  if ((input as { states?: unknown }).states !== undefined) {
    def.states = [...(input as { states: string[] }).states];
  }
  if (input.capabilities !== undefined && isRecord(input.capabilities)) {
    def.capabilities = cloneJson(
      input.capabilities,
    ) as WidgetDef["capabilities"];
  }
  if (input.themeCompatibility !== undefined) {
    def.themeCompatibility = cloneJson(
      input.themeCompatibility,
    ) as WidgetDef["themeCompatibility"];
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
  /** Platform suspension (kill switch / review regression). Checked before `enabled`. */
  suspended: boolean;
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
  /** Platform suspension: `suspended` miss (explicit, never substitution). */
  suspendWidget(id: unknown): MutationVerdict;
  unsuspendWidget(id: unknown): MutationVerdict;
  /** True when the record is platform-suspended (false for unknown ids). */
  isSuspended(id: unknown): boolean;
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
            suspended: false,
            deprecatedId: false,
          };
      record.versions.set(clean.def.version, clean.def);
      // Cache invalidation: `latest` is recomputed synchronously on every
      // mutation (register/update/rollback) — there is no read cache, so the
      // next resolve observes the newest version. Held references are frozen
      // snapshots and stay stale by design (callers must re-resolve).
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
      // Platform suspension wins over merchant disable (stronger action).
      if (found.record.suspended) return miss(trimmed, "suspended", context);
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

  function setSuspended(id: unknown, suspended: boolean): MutationVerdict {
    const found = lookup(id);
    if (!found) return { ok: false, error: "unknown_widget" };
    found.record.suspended = suspended;
    return { ok: true };
  }

  return {
    registerWidget,
    resolveWidget,
    enableWidget: (id) => setEnabled(id, true),
    disableWidget: (id) => setEnabled(id, false),
    suspendWidget: (id) => setSuspended(id, true),
    unsuspendWidget: (id) => setSuspended(id, false),
    isSuspended: (id) => lookup(id)?.record.suspended ?? false,

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
export function suspendWidget(id: unknown): MutationVerdict {
  return shared.suspendWidget(id);
}
export function unsuspendWidget(id: unknown): MutationVerdict {
  return shared.unsuspendWidget(id);
}
export function isSuspended(id: unknown): boolean {
  return shared.isSuspended(id);
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
 * P2 consolidation — AST inspector fields to registry prop fields.
 *
 * Maps the catalogue `Field` vocabulary onto the closed registry `PropField`
 * kind set 1:1 (never inventing kinds, never loosening validation — the
 * value layer in `widget-props.ts` is untouched):
 * text→text, textarea/html→richtext (benign markup preserved, scripts and
 * handlers neutralised — the closest value policy, and it renders the
 * multiline control), number/range/unit→number (bounds carried),
 * select→select (options cloned; option-less selects dropped — an empty
 * option list would reject every value), url/embed→link, boolean→boolean,
 * bitext→text (the base key; bilingual tabs stay bespoke and the bn sibling
 * prop rides alongside untouched), color→color, image→image,
 * taxonomy→category, group→group and array→repeater (rows mapped
 * recursively; nested repeaters skipped — repeaters do not nest by
 * value-layer design).
 *
 * `menu` has no registry counterpart (a recursive nav tree, not a scalar or
 * flat row) and returns null so the def still registers with every other
 * field intact; the single omission is pinned by test. Unknown future kinds
 * also return null (fail closed, never a fallback input).
 */
function astFieldToPropField(field: AstField): PropField | null {
  const base = { key: field.key, label: field.label };
  const max = typeof field.max === "number" ? { max: field.max } : {};
  switch (field.kind) {
    case "text":
      return { ...base, kind: "text", ...max };
    case "textarea":
    case "html":
      return { ...base, kind: "richtext", ...max };
    case "number":
    case "range":
    case "unit": {
      const bounds = {
        ...(typeof field.min === "number" ? { min: field.min } : {}),
        ...max,
      };
      return { ...base, kind: "number", ...bounds };
    }
    case "select": {
      const options = (field.options ?? []).map((o) => ({
        value: o.value,
        label: o.label,
      }));
      if (options.length === 0) return null;
      return { ...base, kind: "select", options };
    }
    case "url":
    case "embed":
      return { ...base, kind: "link", ...max };
    case "boolean":
      return { ...base, kind: "boolean" };
    case "bitext":
      return { ...base, kind: "text", ...max };
    case "color":
      return { ...base, kind: "color" };
    case "image":
      return { ...base, kind: "image" };
    case "taxonomy":
      return { ...base, kind: "category", ...max };
    case "group": {
      const nested: PropField[] = [];
      for (const child of field.fields ?? field.children ?? []) {
        const mapped = astFieldToPropField(child);
        if (mapped) nested.push(mapped);
      }
      if (nested.length === 0) return null;
      return { ...base, kind: "group", fields: nested };
    }
    case "array": {
      const rows: PropField[] = [];
      for (const child of field.fields ?? field.children ?? []) {
        if (child.kind === "array") continue;
        const mapped = astFieldToPropField(child);
        if (mapped) rows.push(mapped);
      }
      if (rows.length === 0) return null;
      return { ...base, kind: "repeater", fields: rows };
    }
    case "menu":
      return null;
    default:
      return null;
  }
}

/**
 * Adapt builtin renderers to WidgetDefs. Enrichment (label, category, slots,
 * fields) comes from the Phase 0.2 `WIDGET_REGISTRY` view via `widgetMeta`
 * — the catalogue through it, so the tray and the inspector can never
 * disagree about a widget — with `catalogEntry` as the fallback for renderer
 * keys outside the closed enum and as the source of `defaults` (the registry
 * view carries no defaults). Renderer is `builtin`; `propsSchema` carries the
 * mapped inspector fields, so builtins resolve through the schema path in
 * `SectionInspector.resolveSchemaForSection` like every other authored tier.
 *
 * The old no-import rule guarded a `widget-registry.ts` cycle that does not
 * exist: that module imports only `builder-ast`, which never imports this
 * module (verified by `tsc` and the adapter tests below — a cycle would fail
 * the build and empty the schemas).
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
    const meta = widgetMeta(key as SectionType);
    const entry = catalogEntry(key as SectionType);
    const astFields = meta?.fields ?? entry?.fields ?? [];
    const fields: PropField[] = [];
    for (const field of astFields) {
      const mapped = astFieldToPropField(field);
      if (mapped) fields.push(mapped);
    }
    return deepFreeze({
      id: `builtin:${key}`,
      namespace: "builtin" as const,
      version: "1.0.0",
      label: meta?.label ?? entry?.label ?? key,
      category: meta?.group ?? entry?.group ?? "general",
      slots: meta ? [...meta.slots] : entry ? [...entry.slots] : [],
      defaults: entry
        ? (cloneJson(entry.defaults) as Record<string, unknown>)
        : {},
      propsSchema: { fields },
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

/** Minimum builder API implied by a manifest `api` range.
 *
 * `^x.y.z` floors at the caret base, `>=a <b` at `a`, and exact pins floor
 * at the pin itself — via `exactApiVersion`, the single home for the exact
 * shape, so this floor and `satisfiesApiRange` (the filter) can never
 * disagree about what an exact pin means.
 */
function minApiFromRange(range: string): string | undefined {
  const trimmed = range.trim();
  const exact = exactApiVersion(trimmed);
  if (exact) return exact;
  const caret = /^\^(\d+\.\d+\.\d+)$/.exec(trimmed);
  if (caret) return caret[1];
  const pair = /^>=\s*(\d+\.\d+\.\d+)\s+<\s*(\d+\.\d+\.\d+)$/.exec(trimmed);
  if (pair) return pair[1];
  return undefined;
}

/**
 * Adapt installed plugin widgets. Filtering mirrors the existing resolver
 * semantics (`resolvePluginWidget` / `pluginTrayEntries`): merchant-disabled,
 * platform-suspended and builder-incompatible manifests contribute nothing —
 * install-level states surface at resolve time via `resolvePluginWidget`
 * (`disabled`/`suspended`/`incompatible`) with data preserved, while the
 * registry layer (install-agnostic) reports absent plugin ids as
 * `uninstalled`. Renderer is `sandbox` (bundles run only in the null-origin
 * island; the registry never sees the entry bytes — no `entry` member
 * exists on WidgetDef). Global install `settings` are NEVER copied into
 * `defaults`: per-instance defaults derive ONLY from the widget's own
 * `propsSchema`/`defaultProps` (see the settings-vs-props separation test).
 * A widget WITHOUT its own `propsSchema`/`defaultProps` keeps the legacy
 * shape exactly: `defaults` is `{}` and the schema is the empty
 * legacy-unvalidated shape.
 *
 * Frame30 — full contract carry-over: `version` (per-widget or manifest
 * fallback), `category` (`plugin` fallback), `rendering` (declared or
 * derived from `themeable`), `dataRequirements`/`actions`/`states`
 * (declared, or Class B `themeable.actions/states` fallback),
 * `capabilities` (declared or legacy-isolated default) and
 * `themeCompatibility` (declared plus the manifest-API floor) ride into the
 * def. Per-widget failures (bad schema, non-record defaults, contract
 * violation via `validatePluginWidgetContract`) fail THAT widget only — it
 * is skipped while siblings still adapt — never the whole manifest: one bad
 * declaration must not blank the tray. Every emitted def still registers
 * through the same `sanitizeDef` path as every other tier.
 */
export function fromPluginManifest(
  installed: readonly InstalledPlugin[],
  opts?: { api?: string },
): WidgetDef[] {
  const api = opts?.api ?? BUILDER_API_VERSION;
  const out: WidgetDef[] = [];
  for (const item of installed) {
    if (!item || !item.enabled || item.suspended === true) continue;
    const manifest = item.manifest;
    if (!manifest || !satisfiesApiRange(manifest.api, api)) continue;
    const minBuilderApi = minApiFromRange(manifest.api);
    for (const w of manifest.widgets) {
      // Runtime boundary: hand-built installs face the gate's exact rules.
      if (!validatePluginWidgetContract(w, manifest.id).ok) continue;
      let fields: PropField[] = [];
      let defaults: Record<string, unknown> = {};
      if (w.propsSchema !== undefined || w.defaultProps !== undefined) {
        const checked = sanitizePluginWidgetPropsSchema(w.propsSchema ?? []);
        if (!checked.ok) continue;
        if (w.defaultProps !== undefined && !isRecord(w.defaultProps)) continue;
        fields = checked.fields;
        defaults = validateProps({ fields }, w.defaultProps ?? {}).clean;
      }
      const def: WidgetDef = {
        id: pluginWidgetKey(manifest.id, w.key),
        namespace: "plugin",
        version:
          typeof w.version === "string" && w.version.trim()
            ? w.version.trim()
            : manifest.version,
        label: w.label,
        category:
          typeof w.category === "string" && w.category.trim()
            ? w.category.trim().slice(0, 40)
            : "plugin",
        slots: [...w.slots],
        defaults,
        propsSchema: { fields },
        renderer: "sandbox",
      };
      def.rendering = w.rendering ?? (w.themeable ? "themeable" : "isolated");
      if (w.dataRequirements !== undefined) {
        def.dataRequirements = cloneJson(
          w.dataRequirements,
        ) as WidgetDef["dataRequirements"];
      } else if (w.themeable?.data || w.themeable?.schema) {
        // Class B data-shape refs ride as a single contract requirement so
        // the registry carries the data dependency without inventing sources.
        def.dataRequirements = [
          {
            source: "contract",
            params: {
              schema: w.themeable.schema,
              ...(w.themeable.data ? { data: w.themeable.data } : {}),
            } as Record<string, JsonValue>,
          },
        ];
      }
      const actions = w.actions ?? w.themeable?.actions;
      if (actions !== undefined) def.actions = [...actions];
      const states = w.states ?? w.themeable?.states;
      if (states !== undefined) def.states = [...states];
      if (w.capabilities !== undefined) {
        def.capabilities = cloneJson(
          w.capabilities,
        ) as WidgetDef["capabilities"];
      } else {
        def.capabilities = { responsive: false, styling: "isolated" };
      }
      const themeCompatibility: WidgetThemeCompatibility = {
        ...(w.themeCompatibility ? cloneJson(w.themeCompatibility) : {}),
      } as WidgetThemeCompatibility;
      // The manifest-API floor always rides (resolve-time gate); a widget
      // floor, when declared, must not undercut it (adapter keeps the max).
      const floors = [minBuilderApi, themeCompatibility.minBuilderApi].filter(
        (v): v is string => typeof v === "string" && !!v,
      );
      if (floors.length) {
        let max = floors[0]!;
        for (const f of floors.slice(1)) {
          try {
            if (compareSemver(f, max) > 0) max = f;
          } catch {
            // Unparseable floor: keep the manifest floor (gate validated).
          }
        }
        themeCompatibility.minBuilderApi = max;
      }
      if (
        themeCompatibility.themes !== undefined ||
        themeCompatibility.minBuilderApi !== undefined
      ) {
        def.themeCompatibility = themeCompatibility;
      }
      if (minBuilderApi && !def.minBuilderApi)
        def.minBuilderApi = minBuilderApi;
      if (themeCompatibility.minBuilderApi) {
        def.minBuilderApi = themeCompatibility.minBuilderApi;
      }
      // Registration-time gate: malformed carry-over never leaves the adapter.
      if (!sanitizeDef(def).ok) continue;
      out.push(deepFreeze(def));
    }
  }
  return out;
}

/**
 * P5 consolidation — the single tray registry builder for every write path.
 *
 * Seeds a fresh factory registry with every tier (builtin + studio +
 * installed-plugin defs) plus explicit tenant `themeDefs`, then best-effort
 * merges the shared singleton (LEGACY shim: global in-repo theme defs such
 * as the songoskriti ornament register there; absent keeps the legacy tray
 * identical). Hostile or unreadable entries are dropped, never stored;
 * merchant-disabled / platform-suspended installs and builder-incompatible
 * manifests contribute nothing — the shared adapter filtering, so listing
 * and insertion read the same truth and the tray can never offer a widget
 * it cannot insert. Never throws. Tenant isolation: pass tenant theme defs
 * via `themeDefs` (never the singleton) so two tenants' trays stay disjoint.
 */
export function buildTrayRegistry(
  installed: readonly InstalledPlugin[],
  opts?: { api?: string; themeDefs?: readonly WidgetDef[] },
): UnifiedRegistry {
  const registry = createWidgetRegistry();
  for (const def of [
    ...fromBuiltinWidgets(),
    ...fromStudioCatalog(),
    ...fromPluginManifest(installed, opts),
    ...(Array.isArray(opts?.themeDefs) ? opts.themeDefs : []),
  ]) {
    try {
      registry.registerWidget(def);
    } catch {
      // A single bad adapter def never breaks the tray.
    }
  }
  // LEGACY shim: theme defs ride the shared singleton when present (global
  // in-repo defs such as the songoskriti ornament register there; tenant
  // defs MUST ride `themeDefs` above, never the singleton). Absent keeps the
  // legacy tray identical.
  try {
    for (const def of listWidgets()) {
      try {
        registry.registerWidget(def);
      } catch {
        // Hostile singleton entries are dropped, never stored.
      }
    }
  } catch {
    // Singleton unreadable — tier registry still stands.
  }
  return registry;
}
