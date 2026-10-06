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
import { parseManifest, type PluginManifest } from "./plugin-manifest";
import { validateBundle } from "./marketplace-scopes";

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
