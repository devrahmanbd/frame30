/**
 * PROVIDER lane — bundled official artifacts (cases only).
 *
 * Anonymous preview + official catalogue display resolve from the
 * deploy-time-built JSON bundle (`official-artifact-bundle.json`) through the
 * runtime provider (`official-artifact-bundle.ts`) — never from theme source:
 * - both official keys resolve to version-pinned, checksum-verified presets;
 * - stored checksums verify (build-time node:crypto == runtime vendored SHA-256);
 * - tampered artifacts (tokens/templates/version/checksum edits) are refused;
 * - unknown keys fail closed to null (route 404s, never a silent wrong theme);
 * - the checked-in bundle matches a fresh source rebuild (script parity);
 * - the runtime graph ships no theme-source imports.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bundle from "./official-artifact-bundle.json";
import {
  bundledArtifactFor,
  bundledOfficialCatalogEntries,
  bundledOfficialKeys,
  bundledPreviewSourceFor,
  resolveBundledOfficialPreview,
  sha256Hex,
  verifyBundledArtifactChecksum,
  type BundledOfficialArtifact,
} from "./official-artifact-bundle";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function nodeSha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("vendored SHA-256 matches node:crypto", () => {
  it.each([
    ["empty", new Uint8Array([])],
    ["abc", new TextEncoder().encode("abc")],
    [
      "448-bit digest vector",
      new TextEncoder().encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    ],
    ["multibyte", new TextEncoder().encode("সংস্কৃতি 🎭")],
  ])("%s", (_label, bytes) => {
    expect(sha256Hex(bytes)).toBe(nodeSha256Hex(bytes));
  });
});

describe("bundled artifacts are version-pinned and checksum-verified", () => {
  it("carries exactly the two official keys, pinned to 1.0.0", () => {
    expect(bundledOfficialKeys().sort()).toEqual(["somvabona", "songoskriti"]);
    for (const key of ["songoskriti", "somvabona"]) {
      expect(bundledArtifactFor(key)?.version).toBe("1.0.0");
    }
    expect((bundle as { bundleVersion: number }).bundleVersion).toBe(1);
  });

  it("every stored checksum verifies (build-time == runtime hash)", () => {
    for (const row of (bundle as { artifacts: BundledOfficialArtifact[] })
      .artifacts) {
      expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(verifyBundledArtifactChecksum(row)).toBe(true);
    }
  });

  it("tampered rows are refused (never a silent wrong theme)", () => {
    const row = bundledArtifactFor("songoskriti")!;
    expect(
      verifyBundledArtifactChecksum({
        ...row,
        tokens: { ...(row.tokens as Record<string, unknown>), surface: "#000000" },
      }),
    ).toBe(false);
    expect(
      verifyBundledArtifactChecksum({
        ...row,
        templates: { index: { header: [], main: [], footer: [] } },
      }),
    ).toBe(false);
    // The version rides inside the checksum: a re-pinned row is a new build.
    expect(verifyBundledArtifactChecksum({ ...row, version: "9.9.9" })).toBe(
      false,
    );
    expect(
      verifyBundledArtifactChecksum({ ...row, checksum: "0".repeat(64) }),
    ).toBe(false);
    expect(
      verifyBundledArtifactChecksum({
        ...row,
        themeName: "Evil Twin",
      }),
    ).toBe(false);
  });

  it("unknown keys fail closed to null", () => {
    expect(bundledArtifactFor("nope")).toBeNull();
    expect(bundledArtifactFor("")).toBeNull();
    expect(bundledPreviewSourceFor("nope")).toBeNull();
    expect(resolveBundledOfficialPreview("nope")).toBeNull();
    expect(resolveBundledOfficialPreview("nope", "minimal")).toBeNull();
  });
});

describe("anonymous preview resolves bundled (no installed set needed)", () => {
  it("songoskriti resolves with authored content + base tokens", () => {
    const preset = resolveBundledOfficialPreview("songoskriti")!;
    expect(preset.key).toBe("songoskriti");
    expect(preset.themeName).toBe("Songoskriti");
    expect(preset.author).toBe("Framique");
    expect(preset.variation).toBeNull();
    expect(preset.variations.map((v) => v.key).sort()).toEqual([
      "festive",
      "minimal",
    ]);
    expect(preset.tokens.surface).toBe("#faf9f7");
    expect(preset.templates.index.main.length).toBeGreaterThan(0);
  });

  it("somvabona resolves its authored subset", () => {
    const preset = resolveBundledOfficialPreview("somvabona")!;
    expect(preset.key).toBe("somvabona");
    expect(preset.templates.index.main.length).toBeGreaterThan(0);
    // Un-authored templates synthesize the generic demo body, never empty.
    expect(preset.templates.cart.main.length).toBeGreaterThan(0);
  });

  it("variation deep-links apply; unknown keys fall back to base (never 404)", () => {
    expect(
      resolveBundledOfficialPreview("songoskriti", "minimal")?.tokens.surface,
    ).toBe("#FFFFFF");
    expect(
      resolveBundledOfficialPreview("songoskriti", "minimal")?.variation?.key,
    ).toBe("minimal");
    const fallback = resolveBundledOfficialPreview("songoskriti", "nope")!;
    expect(fallback.variation).toBeNull();
    expect(fallback.tokens.surface).toBe("#faf9f7");
  });

  it("matches the installed-artifact path (anonymous == merchant rendering)", async () => {
    // The merchant path resolves the same rows through the installed set
    // (`preview-sources.ts` installed discovery); anonymous bundled preview
    // must render byte-identical tokens/templates for the same artifact.
    const { previewSourceFor } = await import("./preview-sources");
    const { resolveThemePreview } = await import("./theme-preview-nav");
    for (const key of ["songoskriti", "somvabona"]) {
      const row = bundledArtifactFor(key)!;
      const installed = [
        {
          key: row.key,
          themeName: row.themeName,
          author: row.author,
          tokens: row.tokens,
          templates: row.templates,
          variations: row.variations,
        },
      ];
      expect(previewSourceFor(key, undefined, installed)?.tokens).toEqual(
        bundledPreviewSourceFor(key)?.tokens,
      );
      const viaInstalled = resolveThemePreview(key, undefined, installed)!;
      const viaBundled = resolveBundledOfficialPreview(key)!;
      expect(viaBundled.tokens).toEqual(viaInstalled.tokens);
      expect(viaBundled.themeName).toBe(viaInstalled.themeName);
      expect(viaBundled.author).toBe(viaInstalled.author);
      expect(viaBundled.variations).toEqual(viaInstalled.variations);
      for (const template of Object.keys(viaBundled.templates)) {
        expect(
          viaBundled.templates[template as keyof typeof viaBundled.templates]
            .main.length,
        ).toBe(
          viaInstalled.templates[template as keyof typeof viaInstalled.templates]
            .main.length,
        );
      }
    }
  });
});

describe("bundled official catalogue rows (display only)", () => {
  it("lists both official keys with serializable artifact refs", () => {
    const entries = bundledOfficialCatalogEntries();
    expect(entries.map((e) => e.key)).toEqual(["songoskriti", "somvabona"]);
    for (const entry of entries) {
      expect(entry.version).toBe("1.0.0");
      expect(entry.artifact).toMatchObject({
        version: "1.0.0",
        fileName: `${entry.key}.zip`,
        pinned: `official:${entry.key}`,
      });
      expect(entry.artifact.checksum).toMatch(/^[0-9a-f]{64}$/);
      // The catalogue ref pins the exact verified bundle checksum.
      expect(entry.artifact.checksum).toBe(
        bundledArtifactFor(entry.key)?.checksum,
      );
    }
    expect(entries[0]).toMatchObject({
      nameEn: "Songoskriti",
      category: "general",
    });
  });

  it("never carries a third (vapor) key", () => {
    expect(bundledOfficialCatalogEntries()).toHaveLength(2);
  });
});

describe("build script parity (checked-in bundle matches fresh source build)", () => {
  it("rebuilding from source yields the stored checksums", async () => {
    const { buildBundleRow } = await import(
      "../../scripts/build-official-artifact-bundle"
    );
    const stored = new Map(
      (bundle as { artifacts: BundledOfficialArtifact[] }).artifacts.map(
        (a) => [a.key, a] as const,
      ),
    );
    for (const key of ["songoskriti", "somvabona"] as const) {
      const rebuilt = buildBundleRow(key);
      expect(rebuilt.checksum).toBe(stored.get(key)?.checksum);
      expect(rebuilt.version).toBe("1.0.0");
    }
  }, 30_000);
});

describe("runtime graph ships no theme-source imports (O2)", () => {
  it("provider + route + bundle reference no source modules", () => {
    const provider = readFileSync(
      join(ROOT, "src", "lib", "official-artifact-bundle.ts"),
      "utf8",
    );
    expect(provider).not.toMatch(/themes\/(songoskriti|somvabona)/);
    expect(provider).not.toMatch(/from ["']\.\/theme-export["']/);
    expect(provider).not.toMatch(/from ["']\.\/official-artifacts["']/);
    const route = readFileSync(
      join(ROOT, "src", "routes", "theme-preview.$key.tsx"),
      "utf8",
    );
    expect(route).not.toMatch(/themes\/(songoskriti|somvabona)\/preview/);
    expect(route).toMatch(/official-artifact-bundle/);
  });
});
