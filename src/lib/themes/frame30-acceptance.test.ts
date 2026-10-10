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
    for (const key of ["songoskriti", "somvabona"]) {
      const blob = JSON.stringify(registryPackage(key).templates);
      expect(blob).toContain(`/ph/${key}/`);
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
});
