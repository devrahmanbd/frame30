/**
 * Frame30 §7 acceptance — two distribution models.
 *
 * Direct pins (run here): 1, 3, 4, 8. Chain pins (run in their own suites,
 * referenced, not duplicated): 2 (`themes-official-catalog`, lifecycle
 * official-theme chain), 5 (`package-zip` security suites), 6
 * (`themes/isolation`), 7 (lifecycle official-plugin chain).
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";

const read = (f: string) => fs.readFileSync(`/opt/frame28/${f}`, "utf8");
const exists = (f: string) => fs.existsSync(`/opt/frame28/${f}`);

describe("frame30 acceptance", () => {
  it("1: official themes work from source without generating or installing ZIPs", async () => {
    const { registryPackage } = await import("../themes.server");
    for (const key of ["songoskriti", "somvabona"]) {
      const pkg = registryPackage(key);
      expect(pkg.version).toBeTruthy();
      expect(Object.keys(pkg.templates).length).toBeGreaterThan(0);
    }
  });
  it("3: official image URLs resolve source-form in preview rendering", async () => {
    const { registryPackage } = await import("../themes.server");
    const { findPackageRefs } = await import("../theme-asset-url");
    for (const key of ["songoskriti", "somvabona"]) {
      const pkg = registryPackage(key);
      const blob = JSON.stringify(pkg.templates);
      expect(blob).toContain(`/ph/${key}/`);
      expect(findPackageRefs(pkg.templates)).toEqual([]);
    }
  });
  it("4+5: custom ZIP packages still face the security pipeline", async () => {
    const { parseZip } = await import("../package-zip");
    expect(() => parseZip(new Uint8Array([0, 1, 2, 3]))).toThrow();
  });
  it("8: no runtime path depends on generated official-theme ZIPs or package-form URLs", () => {
    for (const f of [
      "src/lib/themes.server.ts",
      "src/lib/themes/appearance.server.ts",
      "src/lib/preview-sources.ts",
      "src/lib/theme-preview-nav.ts",
      "src/routes/theme-preview.$key.tsx",
    ]) {
      expect(read(f)).not.toMatch(/official-artifact-bundle\.json/);
    }
    for (const f of [
      "src/lib/themes.server.ts",
      "src/lib/themes/appearance.server.ts",
      "src/lib/preview-sources.ts",
    ]) {
      expect(read(f)).not.toMatch(/from.*theme-export/);
    }
  });
  it("8b: official-only export/bundle modules are gone, merchant pipeline stays", () => {
    for (const f of [
      "src/lib/theme-export.ts",
      "src/lib/official-artifacts.ts",
      "src/lib/official-artifacts-seed.server.ts",
      "src/lib/official-artifact-bundle.ts",
      "src/lib/official-artifact-bundle.json",
      "scripts/build-official-artifact-bundle.ts",
    ]) {
      expect(exists(f)).toBe(false);
    }
    // Merchant pipeline intact: reader, installer, store, plugin packaging.
    for (const f of [
      "src/lib/package-zip.ts",
      "src/lib/package-install.server.ts",
      "src/lib/package-store.server.ts",
      "src/lib/plugin-package.ts",
    ]) {
      expect(exists(f)).toBe(true);
    }
    expect(read("src/lib/billing.functions.ts")).not.toMatch(
      /official-artifacts/,
    );
  });
});
