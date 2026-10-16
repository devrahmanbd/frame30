/**
 * PKG-4 — official/custom plugin ZIP exporter (pure module).
 *
 * Parity target: official plugins (`BUILTIN_PLUGINS` in
 * `src/lib/builtin-plugins.ts`) and third-party plugins install through the
 * SAME pipeline — `installPackage(kind: "plugin")` in
 * `src/lib/package-install.server.ts` — from the SAME artifact shape, a ZIP
 * holding a root `plugin.json` manifest plus data-only companions
 * (`locales/*.json`). `exportBuiltinPluginZip(id)` materialises the official
 * side of that parity; custom authors build the identical layout by hand.
 *
 * Manifest + settings ONLY — by design, not by omission. Widget bundle code
 * is NOT separately exportable and never ships as standalone files:
 * - `validatePackageLayout` (`src/lib/package-zip.ts`) refuses executable
 *   extensions anywhere in the archive (`zip.blocked_extension`: `.js` /
 *   `.ts` / `.exe` / `.sh` / …), so a `bundle/` or `dist/` directory can
 *   never survive the layout gate;
 * - a widget `entry` travels INLINE inside `plugin.json` as a data string
 *   and is evaluated only inside the sandboxed null-origin island behind
 *   the `render_storefront` grant (`src/lib/plugin-manifest.ts`), never as
 *   a page-level script — no sandbox weakening;
 * - entries carrying dynamic code are rejected at both gates:
 *   `widgets[i].entry.dynamic_code` (`parseManifest`) and
 *   `bundle.dynamic_code` (`validateBundle` in
 *   `src/lib/marketplace-scopes.ts`).
 *
 * This module enforces that contract on the way out: every export runs the
 * same two gates the install path runs (`parseManifest` + `validateBundle`)
 * and throws instead of writing a ZIP the pipeline would refuse. Pure
 * module: no network, no database, no React, no new npm packages — the ZIP
 * writer below is hand-rolled stored entries (method 0) plus a real central
 * directory + EOCD, mirroring the repo's test builder
 * (`src/lib/__fixtures__/test-zip.ts`) so archives parse without a library.
 */

import { BUILTIN_PLUGINS, getBuiltinPlugin } from "./builtin-plugins";
import {
  BUILDER_API_VERSION,
  PLUGIN_BUDGET,
  parseManifest,
  satisfiesApiRange,
  type PluginManifest,
} from "./plugin-manifest";
import { validateBundle } from "./marketplace-scopes";
import {
  validateProps,
  type PropField as ValuePropField,
  type WidgetProps,
} from "./widget-props";

export class PluginPackageError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PluginPackageError";
  }
}

function fail(code: string, message: string): never {
  throw new PluginPackageError(code, message);
}

/* ------------------------------------------------------- tiny zip writer */

function crc32(data: Uint8Array): number {
  let table: number[] | null = (crc32 as { t?: number[] }).t ?? null;
  if (!table) {
    table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    (crc32 as { t?: number[] }).t = table;
  }
  let crc = 0xffffffff;
  for (const b of data) crc = table[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v: number) => [
  v & 0xff,
  (v >>> 8) & 0xff,
  (v >>> 16) & 0xff,
  (v >>> 24) & 0xff,
];

const enc = new TextEncoder();

export type PluginZipFile = { path: string; content: string | Uint8Array };

/** Stored-only archive with a real central directory — no dependencies. */
export function buildPluginZip(files: PluginZipFile[]): Uint8Array {
  if (files.length === 0) fail("plugin.empty", "Nothing to export.");
  const out: number[] = [];
  const central: number[] = [];
  for (const file of files) {
    const nameBytes = Array.from(enc.encode(file.path));
    const raw =
      typeof file.content === "string"
        ? enc.encode(file.content)
        : file.content;
    const localOffset = out.length;
    out.push(
      0x50,
      0x4b,
      0x03,
      0x04,
      ...u16(20),
      ...u16(0x0800),
      ...u16(0), // stored
      ...u16(0),
      ...u16(0),
      ...u32(crc32(raw)),
      ...u32(raw.length),
      ...u32(raw.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...nameBytes,
      ...Array.from(raw),
    );
    central.push(
      0x50,
      0x4b,
      0x01,
      0x02,
      ...u16(20),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc32(raw)),
      ...u32(raw.length),
      ...u32(raw.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(localOffset),
      ...nameBytes,
    );
  }
  const centralOffset = out.length;
  out.push(...central);
  const centralSize = out.length - centralOffset;
  out.push(
    0x50,
    0x4b,
    0x05,
    0x06,
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(centralSize),
    ...u32(centralOffset),
    ...u16(0),
  );
  return new Uint8Array(out);
}

/* ---------------------------------------------------------------- exporter */

/**
 * Gate an export exactly like the install path does: the manifest must pass
 * `parseManifest` and the bundle gate (`validateBundle`) the host
 * (`upsertPlugin` in `src/lib/plugins.server.ts`) runs before anything is
 * written. Returns the normalised manifest the ZIP carries.
 */
export function gateExportManifest(input: unknown): PluginManifest {
  const verdict = parseManifest(input);
  if (!verdict.ok) {
    fail(
      "plugin.manifest_invalid",
      `Refusing to export: ${verdict.errors.join(",")}`,
    );
  }
  const manifest = (verdict as { manifest: PluginManifest }).manifest;
  const bundle = validateBundle(manifest, manifest.permissions);
  if (!bundle.ok) {
    fail(
      "plugin.bundle_rejected",
      `Refusing to export: ${bundle.errors.join(",")}`,
    );
  }
  return manifest;
}

/**
 * Build the installable ZIP for a manifest object: root `plugin.json` plus
 * one data-only locale file per shipped dictionary. No code files — widget
 * entries stay inline in the manifest (see module header).
 */
export function exportPluginManifestZip(input: unknown): Uint8Array {
  const manifest = gateExportManifest(input);
  const files: PluginZipFile[] = [
    { path: "plugin.json", content: JSON.stringify(manifest, null, 2) },
  ];
  for (const locale of ["en", "bn"] as const) {
    const dict = manifest.i18n[locale];
    if (dict && Object.keys(dict).length > 0) {
      files.push({
        path: `locales/${locale}.json`,
        content: JSON.stringify(dict, null, 2),
      });
    }
  }
  return buildPluginZip(files);
}

/* ------------------------------------------------- PKG-1 validator seam
 *
 * The install pipeline (`installPackage` in
 * `src/lib/package-install.server.ts`) defaults to `stubManifestValidator`
 * (shape + semver + api-string + dependency list only) with a per-call
 * `validator` seam and a process-wide override. `pkg1ThemeValidator` (there)
 * already adapts the real theme gate; this is the plugin-side counterpart —
 * the same `parseManifest` gate the review pipeline, the install flow and
 * the host all run — so a plugin ZIP carrying dynamic-code entries or an
 * otherwise malformed manifest is refused at the package boundary with
 * `package.manifest_invalid`, not just at host projection time.
 */

export type PluginPackageDependency = { slug: string; kind?: string };

export type ValidatedPluginManifest = {
  slug: string;
  name: string;
  version: string;
  api?: string;
  dependencies: PluginPackageDependency[];
  raw: Record<string, unknown>;
};

export type PluginManifestValidator = (
  manifest: unknown,
  kind: "theme" | "plugin",
) =>
  | { ok: true; manifest: ValidatedPluginManifest }
  | { ok: false; errors: string[] };

/**
 * Real plugin gate for the install-pipeline `validator` seam. Plugin
 * manifests carry no `dependencies` field of their own, so dependency
 * declarations ride the same stub-compatible `dependencies` key
 * (string slugs or `{ slug }` objects) the pipeline resolves against the
 * install ledger. Non-plugin kinds are refused — themes keep
 * `pkg1ThemeValidator`.
 */
export function pkg1PluginValidator(
  manifest: unknown,
  kind: "theme" | "plugin",
): ReturnType<PluginManifestValidator> {
  if (kind !== "plugin") return { ok: false, errors: ["validator.kind"] };
  const verdict = parseManifest(manifest);
  if (!verdict.ok) return { ok: false, errors: verdict.errors };
  const m = (verdict as { manifest: PluginManifest }).manifest;
  const raw = (manifest ?? {}) as Record<string, unknown>;
  const dependencies: PluginPackageDependency[] = [];
  if (raw.dependencies !== undefined) {
    if (!Array.isArray(raw.dependencies)) {
      return { ok: false, errors: ["dependencies"] };
    }
    for (const dep of raw.dependencies) {
      const slug =
        typeof dep === "string"
          ? dep.trim()
          : typeof (dep as { slug?: unknown } | null)?.slug === "string"
            ? String((dep as { slug: unknown }).slug).trim()
            : "";
      if (!slug) return { ok: false, errors: ["dependencies.slug"] };
      dependencies.push({ slug });
    }
  }
  return {
    ok: true,
    manifest: {
      slug: m.id,
      name: m.name,
      version: m.version,
      api: m.api,
      dependencies,
      raw,
    },
  };
}
/** Official plugin ids that ship ZIP-identical artifacts (parity set). */
export function officialPluginIds(): string[] {
  return BUILTIN_PLUGINS.map((p) => p.manifest.id);
}

/**
 * Materialise an official plugin as the same ZIP a third-party author would
 * submit: root `plugin.json` + data-only locales. Unknown ids throw
 * `plugin.unknown_builtin` (never an empty archive).
 */
export function exportBuiltinPluginZip(pluginId: string): Uint8Array {
  const found = getBuiltinPlugin(pluginId);
  if (!found) fail("plugin.unknown_builtin", `No official plugin: ${pluginId}`);
  return exportPluginManifestZip((found as { manifest: unknown }).manifest);
}

/* ------------------------------------------- extension versioning + recovery
 *
 * Frame30 item 13 — version truth and recoverable failure states for the
 * install/update/rollback paths (`package-install.server.ts`,
 * `marketplace-install.server.ts`, `themes/appearance.server.ts`).
 *
 * All helpers here are pure (no network, no database, no React), mirroring
 * this module's exporter contract. They read the manifest/widget shapes the
 * `parseManifest` gate owns (imported read-only above — never re-declared)
 * so the gate and the update path can never disagree about what a version,
 * an API range, a budget ceiling or a props schema means.
 *
 * Recovery doctrine (pinned by tests below and in
 * `package-install-versioning.test.ts`):
 * - unavailable widgets, failed updates and revoked packages resolve to an
 *   explicit placeholder carrying the authored data — content is preserved,
 *   the state names how to recover, and the resolver NEVER substitutes a
 *   different widget (`substituteWidget` is always null) nor authorises
 *   executing an unapproved package (`executeAllowed` is always false here;
 *   execution stays behind the content-hash approval gates in
 *   `plugins.server.ts` / `themes/appearance.server.ts`).
 * - schema changes ride safe defaults (`validateProps` from the value layer)
 *   or an explicit drop list (`migrateExtensionProps`) — never silent loss.
 * - version ordering fails closed: unparseable versions are `null` (unknown),
 *   never a silent zero; ordering guards only engage when both sides parse
 *   (legacy rows without a version keep presence-suffices semantics, matching
 *   the dependency gate in `package-install.server.ts`).
 */

export type ParsedExtensionVersion = {
  major: number;
  minor: number;
  patch: number;
  /** Prerelease identifiers (`1.0.0-beta.1` → `beta.1`), else null. */
  prerelease: string | null;
};

const EXTENSION_VERSION_RE =
  /^(\d{1,5})\.(\d{1,5})\.(\d{1,5})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Parse an extension version. Build metadata (`+…`) is accepted and ignored
 * (it never orders); anything else malformed is null — never a silent zero.
 */
export function parseExtensionVersion(
  value: unknown,
): ParsedExtensionVersion | null {
  if (typeof value !== "string") return null;
  const m = EXTENSION_VERSION_RE.exec(value.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null,
  };
}

/**
 * Order two extension versions. A prerelease sorts below its release
 * (`1.0.0-alpha` < `1.0.0`); build metadata never orders. Returns null when
 * either side is unparseable — unknown is not equality, callers skip the
 * ordering guard (legacy presence-suffices) instead of failing or passing
 * silently.
 */
export function compareExtensionVersions(a: string, b: string): number | null {
  const pa = parseExtensionVersion(a);
  const pb = parseExtensionVersion(b);
  if (!pa || !pb) return null;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  if (pa.prerelease === pb.prerelease) return 0;
  if (pa.prerelease === null) return 1;
  if (pb.prerelease === null) return -1;
  return pa.prerelease < pb.prerelease ? -1 : 1;
}

/**
 * True when `candidate` is not a forward update over `installed` (older or
 * equal — a reinstall is not an update). False when the candidate is newer
 * OR when the installed line is legacy-unparseable (presence suffices, so a
 * legacy install is never stranded by an unreadable version string).
 */
export function isExtensionDowngrade(
  installed: string,
  candidate: string,
): boolean {
  const order = compareExtensionVersions(candidate, installed);
  if (order === null) return false;
  return order <= 0;
}

type SchemaFieldShape = {
  key: string;
  kind: string;
  required: boolean;
};

function shapeOfFields(raw: unknown): SchemaFieldShape[] {
  if (!Array.isArray(raw)) return [];
  const out: SchemaFieldShape[] = [];
  const seen = new Set<string>();
  const walk = (entry: unknown): void => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry))
      return;
    const rec = entry as Record<string, unknown>;
    const key = typeof rec.key === "string" ? rec.key : "";
    const kind = typeof rec.kind === "string" ? rec.kind : "";
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      key,
      kind,
      required: rec.required === true,
    });
    if (Array.isArray(rec.fields)) {
      for (const child of rec.fields) walk(child);
    }
  };
  for (const entry of raw) walk(entry);
  return out;
}

function manifestWidgetsOf(raw: unknown): {
  key: string;
  propsShapes: SchemaFieldShape[];
}[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];
  const widgets = (raw as Record<string, unknown>).widgets;
  if (!Array.isArray(widgets)) return [];
  const out: { key: string; propsShapes: SchemaFieldShape[] }[] = [];
  for (const w of widgets) {
    if (w === null || typeof w !== "object" || Array.isArray(w)) continue;
    const rec = w as Record<string, unknown>;
    if (typeof rec.key !== "string" || !rec.key) continue;
    out.push({ key: rec.key, propsShapes: shapeOfFields(rec.propsSchema) });
  }
  return out;
}

function manifestStringsOf(raw: unknown, member: string): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];
  const list = (raw as Record<string, unknown>)[member];
  if (!Array.isArray(list)) return [];
  return list.filter((v): v is string => typeof v === "string");
}

export type ExtensionSchemaDiff = {
  added: string[];
  removed: string[];
  typeChanged: { key: string; from: string; to: string }[];
};

/**
 * Key-level diff of two props-schema field lists (nested group/repeater
 * rows flattened — a nested rename surfaces under its leaf key). Pure shape
 * comparison: kinds as declared, no validation.
 */
export function diffExtensionSchemas(
  oldFields: unknown,
  newFields: unknown,
): ExtensionSchemaDiff {
  const before = new Map(shapeOfFields(oldFields).map((f) => [f.key, f]));
  const after = new Map(shapeOfFields(newFields).map((f) => [f.key, f]));
  const added = [...after.keys()].filter((k) => !before.has(k)).sort();
  const removed = [...before.keys()].filter((k) => !after.has(k)).sort();
  const typeChanged: ExtensionSchemaDiff["typeChanged"] = [];
  for (const [key, next] of after) {
    const prev = before.get(key);
    if (prev && prev.kind !== next.kind) {
      typeChanged.push({ key, from: prev.kind, to: next.kind });
    }
  }
  typeChanged.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  return { added, removed, typeChanged };
}

export type ExtensionSchemaMigration = {
  widget: string;
  droppedKeys: string[];
  typeChanged: { key: string; from: string; to: string }[];
};

export type ExtensionUpdateCompatVerdict =
  | {
      ok: true;
      warnings: string[];
      /** Permissions the candidate adds — the caller must re-consent. */
      addedPermissions: string[];
      /** True when `addedPermissions` is non-empty. */
      requiresConsent: boolean;
      /** Installed widget keys the candidate no longer ships (data stays). */
      widgetsRemoved: string[];
      /** Per-widget schema notes for non-breaking changes. */
      schemaMigrations: ExtensionSchemaMigration[];
    }
  | {
      ok: false;
      code:
        | "version_invalid"
        | "version_not_newer"
        | "api_range_invalid"
        | "api_incompatible"
        | "capability_ceiling"
        | "schema_migration_required";
      errors: string[];
    };

/**
 * Validate that `candidateManifest` is a safe forward update over
 * `installedManifest` at `builderApi` (defaults to the running API).
 *
 * Both manifests are read defensively (normalized `PluginManifest` or raw
 * `plugin.json` — the install path holds one of each), extracting only the
 * gate-owned members: version, api range, budget, permissions, widget keys
 * and per-widget props schemas.
 *
 * Fail-closed: unparseable candidate versions, non-forward ordering,
 * unsatisfiable API ranges (ranges AND exact pins, via the gate's own
 * `satisfiesApiRange`), over-ceiling budgets, and breaking schema changes
 * (required-field removal, kind changes on shared keys). Non-breaking change
 * passes with explicit signals the caller must honour: `addedPermissions`
 * (re-consent), `widgetsRemoved` (keep the placeholder + data, never
 * delete), `schemaMigrations` (optional drops covered by safe defaults).
 */
export function checkExtensionUpdateCompat(input: {
  installedManifest: unknown;
  candidateManifest: unknown;
  builderApi?: string;
}): ExtensionUpdateCompatVerdict {
  const builderApi =
    typeof input.builderApi === "string" && input.builderApi
      ? input.builderApi
      : BUILDER_API_VERSION;
  const installed = (input.installedManifest ?? {}) as Record<string, unknown>;
  const candidate = (input.candidateManifest ?? {}) as Record<string, unknown>;

  const candidateVersion =
    typeof candidate.version === "string" ? candidate.version.trim() : "";
  if (!parseExtensionVersion(candidateVersion)) {
    return {
      ok: false,
      code: "version_invalid",
      errors: [`version:${candidateVersion || "missing"}`],
    };
  }
  const installedVersion =
    typeof installed.version === "string" ? installed.version.trim() : "";
  const order =
    installedVersion && parseExtensionVersion(installedVersion)
      ? compareExtensionVersions(candidateVersion, installedVersion)
      : null;
  if (order !== null && order <= 0) {
    return {
      ok: false,
      code: "version_not_newer",
      errors: [`version:${candidateVersion}<=${installedVersion}`],
    };
  }

  const api = typeof candidate.api === "string" ? candidate.api.trim() : "";
  if (!api) {
    return { ok: false, code: "api_range_invalid", errors: ["api:missing"] };
  }
  if (!satisfiesApiRange(api, builderApi)) {
    return {
      ok: false,
      code: "api_incompatible",
      errors: [`api:${api}!=${builderApi}`],
    };
  }

  const budget = (candidate.budget ?? {}) as Record<string, unknown>;
  const jsKb = typeof budget.jsKb === "number" ? budget.jsKb : 0;
  const mainThreadMs =
    typeof budget.mainThreadMs === "number" ? budget.mainThreadMs : 0;
  if (jsKb > PLUGIN_BUDGET.jsKb || mainThreadMs > PLUGIN_BUDGET.mainThreadMs) {
    return {
      ok: false,
      code: "capability_ceiling",
      errors: [`budget:${jsKb}kb/${mainThreadMs}ms`],
    };
  }

  const warnings: string[] = [];
  if (order === null && installedVersion) {
    warnings.push(`installed_version_legacy:${installedVersion}`);
  }
  const oldPerms = manifestStringsOf(installed, "permissions");
  const newPerms = manifestStringsOf(candidate, "permissions");
  const addedPermissions = newPerms.filter((p) => !oldPerms.includes(p)).sort();

  const installedWidgets = manifestWidgetsOf(installed);
  const candidateWidgets = manifestWidgetsOf(candidate);
  const candidateKeys = new Set(candidateWidgets.map((w) => w.key));
  const widgetsRemoved = installedWidgets
    .map((w) => w.key)
    .filter((k) => !candidateKeys.has(k))
    .sort();
  if (widgetsRemoved.length) {
    warnings.push(`widgets_removed:${widgetsRemoved.join(",")}`);
  }

  const schemaMigrations: ExtensionSchemaMigration[] = [];
  for (const next of candidateWidgets) {
    const prev = installedWidgets.find((w) => w.key === next.key);
    if (!prev) continue;
    const before = new Map(prev.propsShapes.map((f) => [f.key, f]));
    const after = new Map(next.propsShapes.map((f) => [f.key, f]));
    const droppedKeys = [...before.keys()].filter((k) => !after.has(k)).sort();
    const typeChanged: ExtensionSchemaMigration["typeChanged"] = [];
    for (const [key, shape] of after) {
      const old = before.get(key);
      if (old && old.kind !== shape.kind) {
        typeChanged.push({ key, from: old.kind, to: shape.kind });
      }
    }
    // Breaking: a required field disappears (merchant-supplied data would be
    // silently dropped) or a shared key changes kind (stored values invalid).
    const requiredDrops = droppedKeys.filter(
      (k) => before.get(k)?.required === true,
    );
    if (requiredDrops.length || typeChanged.length) {
      return {
        ok: false,
        code: "schema_migration_required",
        errors: [
          `widget:${next.key}`,
          ...requiredDrops.map((k) => `required_removed:${k}`),
          ...typeChanged.map((t) => `type_changed:${t.key}`),
        ],
      };
    }
    if (droppedKeys.length) {
      schemaMigrations.push({ widget: next.key, droppedKeys, typeChanged });
      warnings.push(
        `schema_optional_dropped:${next.key}:${droppedKeys.join(",")}`,
      );
    }
  }

  return {
    ok: true,
    warnings,
    addedPermissions,
    requiresConsent: addedPermissions.length > 0,
    widgetsRemoved,
    schemaMigrations,
  };
}

export type ExtensionMigrationResult = {
  /** Stored props cleaned against the NEW schema (safe defaults applied). */
  props: WidgetProps;
  /** Stored keys absent from the new schema — reported, never silent. */
  dropped: string[];
  /** Non-fatal validation notes (salvaged values preferred, per contract). */
  errors: string[];
};

/**
 * Migrate stored instance props across a schema change. Values for surviving
 * keys are preserved (repaired to safe defaults when invalid); keys the new
 * schema no longer declares are listed in `dropped` — the caller keeps the
 * raw authored JSON alongside, so nothing is silently lost.
 */
export function migrateExtensionProps(
  oldSchema: unknown,
  newSchema: unknown,
  stored: unknown,
): ExtensionMigrationResult {
  const afterFields = Array.isArray(newSchema)
    ? (newSchema as ValuePropField[])
    : [];
  const input =
    stored !== null && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const checked = validateProps({ fields: afterFields }, input);
  const afterKeys = new Set(shapeOfFields(newSchema).map((f) => f.key));
  // `oldSchema` stays in the signature: migration callers pass (old, new,
  // stored) so the direction is explicit at the call site, and the drop
  // report below is read against that move. Only the NEW schema decides what
  // survives — anything stored but undeclared there is reported, never kept
  // silently and never executed.
  void oldSchema;
  const dropped = Object.keys(input)
    .filter((k) => !afterKeys.has(k))
    .sort();
  return { props: checked.clean, dropped, errors: checked.errors };
}

export type ExtensionRecoveryReason =
  | "unknown"
  | "disabled"
  | "suspended"
  | "incompatible"
  | "uninstalled"
  | "revoked"
  | "update_failed";

export type ExtensionRecoveryState = {
  /** Recovery always renders an explicit placeholder — never a live widget. */
  status: "placeholder";
  widgetId: string;
  reason: ExtensionRecoveryReason;
  /** Authored data, cloned — the placeholder preserves it untouched. */
  preservedData: Record<string, unknown>;
  /**
   * Always null: recovery NEVER substitutes a different widget. A caller
   * that wants a fallback must ask the merchant, not guess.
   */
  substituteWidget: null;
  /**
   * Always false here: executing a package is behind the content-hash
   * approval gates, never behind recovery. Recovery shows the placeholder.
   */
  executeAllowed: false;
  /** Safe to retry the same operation (transient causes only). */
  canRetry: boolean;
  /** Last-good version to roll back to, when one is known and allowed. */
  canRollbackTo: string | null;
  /** Merchant-facing guidance naming the recoverable state. */
  message: string;
};

const RECOVERY_MESSAGES: Record<ExtensionRecoveryReason, string> = {
  unknown:
    "This widget is unavailable. Your content is preserved — retry, or roll back to the last working version.",
  disabled:
    "This widget is paused. Your content is preserved — re-enable the plugin to restore it.",
  suspended:
    "This widget is suspended by platform review. Your content is preserved — it restores when the suspension lifts.",
  incompatible:
    "This widget needs a newer builder than this store runs. Your content is preserved — update the store, or roll back the widget.",
  uninstalled:
    "This widget is not installed. Your content is preserved — reinstall the plugin to restore it.",
  revoked:
    "This widget version was revoked. Your content is preserved — roll back to the last approved version.",
  update_failed:
    "The update did not complete, so the last working version is still live. Your content is preserved — retry the update or roll back.",
};

/**
 * Resolve the explicit recoverable state for a widget that cannot render.
 * Total function over the reason set: every failure maps to a placeholder
 * with preserved data — substitution and unapproved execution are
 * structurally impossible (both fields are constant).
 */
export function resolveExtensionRecovery(input: {
  widgetId: string;
  reason: ExtensionRecoveryReason;
  preservedData?: unknown;
  lastGoodVersion?: string | null;
}): ExtensionRecoveryState {
  const widgetId =
    typeof input.widgetId === "string" && input.widgetId
      ? input.widgetId
      : "unknown";
  const reasons: ExtensionRecoveryReason[] = [
    "unknown",
    "disabled",
    "suspended",
    "incompatible",
    "uninstalled",
    "revoked",
    "update_failed",
  ];
  const reason = reasons.includes(input.reason) ? input.reason : "unknown";
  const preservedData =
    input.preservedData !== null &&
    typeof input.preservedData === "object" &&
    !Array.isArray(input.preservedData)
      ? (JSON.parse(JSON.stringify(input.preservedData)) as Record<
          string,
          unknown
        >)
      : {};
  const lastGood =
    typeof input.lastGoodVersion === "string" && input.lastGoodVersion
      ? input.lastGoodVersion
      : null;
  // Revoked/suspended installs must never roll back INTO the revoked line:
  // the rollback target is the last GOOD version only for failed updates and
  // incompatibilities, where the previous line is still approved.
  const canRollbackTo =
    (reason === "update_failed" || reason === "incompatible") &&
    lastGood &&
    parseExtensionVersion(lastGood)
      ? lastGood
      : null;
  const canRetry = reason === "unknown" || reason === "update_failed";
  return {
    status: "placeholder",
    widgetId,
    reason,
    preservedData,
    substituteWidget: null,
    executeAllowed: false,
    canRetry,
    canRollbackTo,
    message: RECOVERY_MESSAGES[reason],
  };
}

/**
 * Pinned-version truth for marketplace installs: the ledger must claim the
 * version the bytes actually carry. A pinned row whose recorded version
 * differs from the installed artifact's manifest version is a version lie —
 * fail closed (`market_version_mismatch` at the caller), never patch the row
 * into agreement.
 */
export function checkPinnedVersionTruth(input: {
  artifactVersion: string;
  pinnedVersion: string | null | undefined;
}): { ok: true } | { ok: false; code: "version_lie"; detail: string } {
  const pinned = (input.pinnedVersion ?? "").trim();
  if (!pinned) return { ok: true };
  const artifact = (input.artifactVersion ?? "").trim();
  if (artifact === pinned) return { ok: true };
  return {
    ok: false,
    code: "version_lie",
    detail: `pinned:${pinned}!=artifact:${artifact}`,
  };
}
