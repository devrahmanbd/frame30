#!/usr/bin/env bun
/**
 * PROVIDER lane — deploy-time official artifact bundle builder.
 *
 * Builds the two official themes from SOURCE (`src/lib/themes/*` via
 * `official-artifacts.ts` → `theme-export.ts`) and emits the checked-in JSON
 * bundle (`src/lib/official-artifact-bundle.json`) that the runtime provider
 * (`src/lib/official-artifact-bundle.ts`) loads for anonymous preview +
 * official catalogue display.
 *
 * This script is the ONLY place allowed to import theme source for the
 * bundle. The runtime NEVER imports source — it reads the emitted artifact
 * rows only (O2 source-free runtime graph).
 *
 * Canonical checksum contract (MUST match the provider byte-for-byte):
 *   checksum = sha256Hex(utf8(stableStringify({
 *     key, version, themeName, themeNameBn, author,
 *     summaryEn, summaryBn, category, tokens, templates, variations,
 *   })))
 * `stableStringify` sorts keys recursively, so field order is irrelevant but
 * the FIELD SET is load-bearing — changing it here without changing the
 * provider invalidates every checksum (the parity test pins this).
 *
 * Templates are stored as BARE ThemeAst (`{ header, main, footer }`): the
 * package envelope (`format`/`theme`/`template`/`packageVersion`) is
 * transport, not content, and `parseTemplates` accepts the bare form
 * directly (same gate the installed path runs).
 *
 * Usage:
 *   bun scripts/build-official-artifact-bundle.ts --write   # regenerate bundle
 *   bun scripts/build-official-artifact-bundle.ts --check   # CI: fail on drift
 *
 * Hooked into the deploy build (`package.json` `build` runs this with
 * `--write` before `vite build`), so every deploy ships freshly-built,
 * version-pinned, checksummed artifacts.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildOfficialArtifact,
  type OfficialThemeKey,
} from "../src/lib/official-artifacts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT_PATH = join(
  ROOT,
  "src",
  "lib",
  "official-artifact-bundle.json",
);

/** Pinned manifest + template payload version for both official themes. */
const OFFICIAL_BUNDLE_VERSION = "1.0.0";

const BUNDLE_KEYS: OfficialThemeKey[] = ["songoskriti", "somvabona"];

/* ------------------------------------------------------- canonical helpers
 * Byte-identical twins of the provider's `stableStringify` + canonical
 * payload shape. Any drift here breaks every checksum — the parity test
 * (`official-artifact-bundle.test.ts`) rebuilds through this script's
 * exports and compares against the checked-in bundle.
 */

export function stableStringify(value: unknown): string {
  const sort = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(sort);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(node as Record<string, unknown>).sort()) {
        out[k] = sort((node as Record<string, unknown>)[k]);
      }
      return out;
    }
    return node;
  };
  return JSON.stringify(sort(value));
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type BundleArtifactRow = {
  key: string;
  version: string;
  themeName: string;
  themeNameBn: string;
  author: string;
  summaryEn: string;
  summaryBn: string;
  category: string;
  tokens: unknown;
  templates: unknown;
  variations: unknown;
  checksum: string;
};

export type OfficialBundleJson = {
  bundleVersion: 1;
  builtAt: string;
  artifacts: BundleArtifactRow[];
};

function readBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

function themeInput(key: OfficialThemeKey): {
  key: OfficialThemeKey;
  version: string;
  cssText: string;
  assets: { file: string; bytes: Uint8Array }[];
  // Runtime bundle serves over HTTP: keep servable source-form URLs.
  // Package-form rewriting happens only in the ZIP distribution path.
  urlForm: "source";
} {
  const cssText = readFileSync(
    join(ROOT, "src", "lib", "themes", key, "skins.css"),
    "utf8",
  );
  const dir = join(ROOT, "public", "ph", key);
  const assets = readdirSync(dir)
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort()
    .map((file) => ({ file, bytes: readBytes(join(dir, file)) }));
  return { key, version: OFFICIAL_BUNDLE_VERSION, cssText, assets, urlForm: "source" as const };
}

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

/**
 * Build one version-pinned, checksummed bundle row from source. Throws
 * fail-closed on anything the install pipeline would reject (via
 * `buildOfficialArtifact`) or on a malformed manifest.
 */
export function buildBundleRow(key: OfficialThemeKey): BundleArtifactRow {
  const artifact = buildOfficialArtifact(themeInput(key));
  const manifest = artifact.manifest as Record<string, unknown>;

  // Bare ThemeAst per template (envelope stripped — see module header).
  const templates: Record<string, unknown> = {};
  for (const [template, ast] of Object.entries(artifact.templates)) {
    const rec = ast as Record<string, unknown>;
    if (
      !rec ||
      typeof rec !== "object" ||
      !Array.isArray(rec["header"]) ||
      !Array.isArray(rec["main"]) ||
      !Array.isArray(rec["footer"])
    ) {
      throw new Error(
        `[build-official-artifact-bundle] malformed template payload: ${key}/${template}`,
      );
    }
    templates[template] = {
      header: rec["header"],
      main: rec["main"],
      footer: rec["footer"],
    };
  }
  if (Object.keys(templates).length === 0) {
    throw new Error(
      `[build-official-artifact-bundle] no templates for ${key}`,
    );
  }

  const variations = manifest["variations"];
  if (!Array.isArray(variations)) {
    throw new Error(
      `[build-official-artifact-bundle] manifest carries no variations array: ${key}`,
    );
  }

  const row: Omit<BundleArtifactRow, "checksum"> = {
    key: artifact.key,
    version: artifact.version,
    themeName: cleanString(manifest["name"], key),
    themeNameBn: cleanString(manifest["nameBn"], cleanString(manifest["name"], key)),
    author: cleanString(manifest["author"], "Framique"),
    summaryEn: cleanString(manifest["description"]),
    summaryBn: cleanString(manifest["descriptionBn"]),
    category: "general",
    tokens: artifact.tokens,
    templates,
    variations,
  };
  const checksum = sha256Hex(new TextEncoder().encode(stableStringify(row)));
  return { ...row, checksum };
}

export function buildBundleJson(builtAt = new Date().toISOString()): OfficialBundleJson {
  return {
    bundleVersion: 1,
    builtAt,
    artifacts: BUNDLE_KEYS.map((key) => buildBundleRow(key)),
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const write = args.includes("--write") || !check;

  const next = buildBundleJson();
  const serialized = `${JSON.stringify(next, null, 2)}\n`;

  if (check) {
    let current: OfficialBundleJson;
    try {
      current = JSON.parse(readFileSync(OUT_PATH, "utf8")) as OfficialBundleJson;
    } catch {
      console.error(
        `[build-official-artifact-bundle] CHECK FAILED: ${OUT_PATH} missing or unparseable — run with --write.`,
      );
      process.exit(1);
    }
    const same =
      Array.isArray(current.artifacts) &&
      current.artifacts.length === next.artifacts.length &&
      current.artifacts.every((row, i) => {
        const want = next.artifacts[i]!;
        return (
          row.key === want.key &&
          row.version === want.version &&
          row.checksum === want.checksum
        );
      });
    if (!same) {
      console.error(
        "[build-official-artifact-bundle] CHECK FAILED: bundle drifted from source — run with --write and commit the result.",
      );
      process.exit(1);
    }
    console.log(
      `[build-official-artifact-bundle] CHECK OK: ${next.artifacts.length} artifacts pinned (${next.artifacts.map((a) => `${a.key}@${a.version}`).join(", ")}).`,
    );
    return;
  }

  if (write) {
    writeFileSync(OUT_PATH, serialized, "utf8");
    console.log(
      `[build-official-artifact-bundle] WROTE ${OUT_PATH}: ${next.artifacts.length} artifacts (${next.artifacts.map((a) => `${a.key}@${a.version} ${a.checksum.slice(0, 12)}`).join(", ")}).`,
    );
  }
}

if (import.meta.main) main();
