/**
 * B1 — internal official-artifact build suite (cases only).
 *
 * Covers `official-artifacts.ts` (pure build) against the REAL theme
 * sources plus `official-artifacts-seed.server.ts` against `fakeDb`:
 * - both themes build to validated, checksummed artifacts;
 * - determinism (rebuild → identical checksum);
 * - asset completeness (every ref shipped, manifest digests exact, no
 *   source-prefix leftovers, no dangling refs);
 * - provenance marking (official vs catalog vs merchant upload);
 * - seed idempotency (re-run → same rows, no duplicates; new checksum →
 *   appended version, live pointer untouched).
 *
 * On-disk inputs only in tests (`skins.css`, `public/ph/<theme>/*`); the
 * build module itself stays pure. No ZIP is written anywhere.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeDb } from "./__fixtures__/fake-db";
import { validateThemeManifest } from "./theme-package";
import { collectBrokenAssetRefs } from "./package-zip";
import {
  buildOfficialArtifact,
  isOfficialProvenance,
  provenanceOf,
  toThemeVersionRow,
  verifyOfficialArtifactChecksum,
  type ExportOfficialThemeInput,
  type OfficialArtifact,
  type OfficialThemeKey,
} from "./official-artifacts";
import { seedOfficialArtifacts } from "./official-artifacts-seed.server";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MERCHANT = "33333333-3333-4333-8333-333333333333";

function readBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

const inputCache = new Map<string, ExportOfficialThemeInput>();

function themeInputs(
  key: OfficialThemeKey,
  version = "1.0.0",
): ExportOfficialThemeInput {
  const cacheKey = `${key}@${version}`;
  const cached = inputCache.get(cacheKey);
  if (cached) return cached;
  const cssText = readFileSync(
    join(ROOT, "src", "lib", "themes", key, "skins.css"),
    "utf8",
  );
  const dir = join(ROOT, "public", "ph", key);
  const assets = readdirSync(dir)
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort()
    .map((file) => ({ file, bytes: readBytes(join(dir, file)) }));
  const input = { key, version, cssText, assets };
  inputCache.set(cacheKey, input);
  return input;
}

const artifactCache = new Map<string, OfficialArtifact>();

function artifactOf(key: OfficialThemeKey, version = "1.0.0"): OfficialArtifact {
  const cacheKey = `${key}@${version}`;
  const cached = artifactCache.get(cacheKey);
  if (cached) return cached;
  const built = buildOfficialArtifact(themeInputs(key, version));
  artifactCache.set(cacheKey, built);
  return built;
}

describe("B1 official build — both themes", () => {
  it.each(["songoskriti", "somvabona"] as const)(
    "builds a validated artifact for %s",
    (key) => {
      const artifact = artifactOf(key);
      expect(artifact.key).toBe(key);
      expect(artifact.version).toBe("1.0.0");
      expect(Object.keys(artifact.templates).length).toBeGreaterThan(0);
      expect(Object.keys(artifact.tokens).length).toBeGreaterThan(0);
      expect(artifact.styles.length).toBeGreaterThan(0);
      expect(Object.keys(artifact.locales.en).length).toBeGreaterThan(0);
      expect(Object.keys(artifact.locales.bn).length).toBeGreaterThan(0);
      expect(artifact.referencedAssets.length).toBeGreaterThan(0);
      // Shipped set is a superset of template refs (exporter ships every
      // supplied allowlisted file); every referenced basename is shipped.
      const shipped = new Set(
        artifact.assets.map((a) => a.path.slice("assets/".length)),
      );
      for (const ref of artifact.referencedAssets) {
        expect(shipped.has(ref), ref).toBe(true);
      }
      expect(artifact.assets.length).toBeGreaterThanOrEqual(
        artifact.referencedAssets.length,
      );
      expect(artifact.checksum).toMatch(/^[0-9a-f]{64}$/);
      // The installed pipeline gate accepts the shipped manifest.
      expect(validateThemeManifest(artifact.manifest).ok).toBe(true);
      // No distributable archive shape: package-relative paths only.
      for (const asset of artifact.assets) {
        expect(asset.path.startsWith("assets/")).toBe(true);
        expect(asset.path.endsWith(".zip")).toBe(false);
      }
    },
  );

  it("songoskriti ships every template key; somvabona ships its authored subset", async () => {
    const { TEMPLATE_KEYS } = await import("./builder-ast");
    expect(Object.keys(artifactOf("songoskriti").templates).sort()).toEqual(
      [...TEMPLATE_KEYS].sort(),
    );
    expect(Object.keys(artifactOf("somvabona").templates).sort()).toEqual(
      ["collection", "index", "product"],
    );
  });
});

describe("B1 determinism", () => {
  it.each(["songoskriti", "somvabona"] as const)(
    "rebuild yields the identical checksum for %s",
    (key) => {
      const first = buildOfficialArtifact(themeInputs(key));
      const second = buildOfficialArtifact(themeInputs(key));
      expect(second.checksum).toBe(first.checksum);
      expect(verifyOfficialArtifactChecksum(first)).toBe(true);
      expect(verifyOfficialArtifactChecksum(second)).toBe(true);
    },
  );

  it("checksum verification fails on a tampered checksum", () => {
    const artifact = artifactOf("somvabona");
    expect(
      verifyOfficialArtifactChecksum({ ...artifact, checksum: "0".repeat(64) }),
    ).toBe(false);
  });
});

describe("B1 asset completeness", () => {
  it.each(["songoskriti", "somvabona"] as const)(
    "manifest digests match shipped bytes and no refs dangle for %s",
    (key) => {
      const artifact = artifactOf(key);
      const digestByPath = new Map(
        artifact.assets.map((a) => [a.path, a.sha256]),
      );
      const manifestAssets = (
        (artifact.manifest.assetManifest ?? []) as {
          path: string;
          sha256: string;
        }[]
      ).filter((e) => e.path.startsWith("assets/"));
      expect(manifestAssets.length).toBe(artifact.assets.length);
      for (const entry of manifestAssets) {
        const asset = artifact.assets.find((a) => a.path === entry.path);
        expect(asset, entry.path).toBeDefined();
        expect(digestByPath.get(entry.path)).toBe(entry.sha256.toLowerCase());
      }
      // Template refs resolve against the shipped file list (install-lane unit).
      const files = [
        { path: "theme.json", bytes: new TextEncoder().encode("{}") },
        ...Object.entries(artifact.templates).map(([t, ast]) => ({
          path: `templates/${t}.json`,
          bytes: new TextEncoder().encode(JSON.stringify(ast)),
        })),
        ...artifact.assets.map((a) => ({ path: a.path, bytes: a.bytes })),
      ];
      expect(collectBrokenAssetRefs(files)).toEqual([]);
      // No private source-prefix strings survive into the stored payload.
      const serialized =
        JSON.stringify(artifact.templates) +
        JSON.stringify(artifact.locales) +
        artifact.styles;
      expect(serialized.includes("/ph/")).toBe(false);
    },
  );
});

describe("B1 provenance marking", () => {
  it("official rows are distinguishable from merchant uploads", () => {
    for (const key of ["songoskriti", "somvabona"] as const) {
      const row = toThemeVersionRow(artifactOf(key));
      expect(row.source_registry_key).toBe(key);
      expect(row.label).toBe(`official:${key}@1.0.0`);
      expect(row.checksum).toBe(artifactOf(key).checksum);
      expect(isOfficialProvenance(row)).toBe(true);
      expect(provenanceOf(row)).toBe("official");
    }
    // Merchant ZIP uploads leave the registry key NULL.
    expect(provenanceOf({ source_registry_key: null })).toBe("upload");
    expect(isOfficialProvenance({ source_registry_key: null })).toBe(false);
    // Non-official catalogue keys stay catalog, never official.
    expect(provenanceOf({ source_registry_key: "classic" })).toBe("catalog");
    expect(isOfficialProvenance({ source_registry_key: "classic" })).toBe(
      false,
    );
  });
});

function seedDb() {
  return fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_audit: [],
    },
  });
}

describe("B1 seed idempotency", () => {
  it("seeds both themes, then replays without duplicating", async () => {
    const db = seedDb();
    const artifacts = [artifactOf("songoskriti"), artifactOf("somvabona")];
    const first = await seedOfficialArtifacts(
      db.asClient(),
      MERCHANT,
      artifacts,
      "user-1",
    );
    expect(first).toHaveLength(2);
    for (const result of first) expect(result.created).toBe(true);
    expect(db.rows("store_themes")).toHaveLength(2);
    expect(db.rows("theme_versions")).toHaveLength(2);
    const stored = db.rows("theme_versions");
    // Versions carry the artifact content through the normal pipeline
    // (labels are `${key}@${version}`, checksums are ZIP artifact SHAs).
    for (const artifact of artifacts) {
      const row = stored.find((r) =>
        String(r.label).startsWith(`${artifact.key}@`),
      )!;
      expect(row.templates).toEqual(artifact.templates);
      expect(row.tokens).toEqual(artifact.tokens);
    }

    const second = await seedOfficialArtifacts(
      db.asClient(),
      MERCHANT,
      artifacts,
      "user-1",
    );
    expect(second.map((r) => r.created)).toEqual([false, false]);
    expect(second.map((r) => r.versionId)).toEqual(
      first.map((r) => r.versionId),
    );
    expect(db.rows("store_themes")).toHaveLength(2);
    expect(db.rows("theme_versions")).toHaveLength(2);
    // Replay is idempotent through the pipeline (no new versions).
    expect(db.rows("theme_versions")).toHaveLength(2);
  });

  it("a new version appends without moving the live pointer (activate to publish)", async () => {
    const db = seedDb();
    const v1 = artifactOf("somvabona");
    const [seeded] = await seedOfficialArtifacts(
      db.asClient(),
      MERCHANT,
      [v1],
      "user-1",
    );
    const themeBefore = db
      .rows("store_themes")
      .find((r) => r.source_listing_slug === "somvabona")!;
    // Install never publishes: the live pointer stays null until explicit
    // activation (activatePackage), for seeds and uploads alike.
    expect(themeBefore.published_version_id ?? null).toBeNull();

    const v2 = artifactOf("somvabona", "1.0.1");
    expect(v2.checksum).not.toBe(v1.checksum);
    const [upgraded] = await seedOfficialArtifacts(
      db.asClient(),
      MERCHANT,
      [v2],
      "user-1",
    );
    expect(upgraded.created).toBe(true);
    expect(upgraded.versionNumber).toBe(seeded.versionNumber + 1);
    expect(db.rows("theme_versions")).toHaveLength(2);
    // A new version never moves the live pointer by itself.
    const themeAfter = db
      .rows("store_themes")
      .find((r) => r.source_listing_slug === "somvabona")!;
    expect(themeAfter.published_version_id ?? null).toBeNull();
  });

  it("tenant isolation: another merchant seeds its own rows", async () => {
    const db = seedDb();
    const other = "44444444-4444-4434-8444-444444444444";
    await seedOfficialArtifacts(db.asClient(), MERCHANT, [artifactOf("somvabona")]);
    await seedOfficialArtifacts(db.asClient(), other, [artifactOf("somvabona")]);
    expect(
      db.rows("store_themes").filter((r) => r.merchant_id === MERCHANT),
    ).toHaveLength(1);
    expect(
      db.rows("theme_versions").filter((r) => r.merchant_id === other),
    ).toHaveLength(1);
  });
});
