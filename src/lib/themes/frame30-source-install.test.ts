import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import { findPackageRefs } from "../theme-asset-url";

describe("frame30 source-direct runtime", () => {
  it("registryPackage resolves songoskriti from source with /ph/ URLs", async () => {
    const { registryPackage } = await import("../themes.server");
    const pkg = registryPackage("songoskriti");
    const blob = JSON.stringify(pkg.templates);
    expect(blob).toContain("/ph/songoskriti/");
    expect(findPackageRefs(pkg.templates)).toEqual([]);
  });
  it("no runtime source file imports the bundle or exporter", () => {
    const runtimeFiles = [
      "src/lib/themes.server.ts",
      "src/lib/themes/appearance.server.ts",
      "src/lib/preview-sources.ts",
      "src/lib/theme-preview-nav.ts",
    ];
    for (const f of runtimeFiles) {
      const s = fs.readFileSync(`/opt/frame28/${f}`, "utf8");
      expect(s).not.toMatch(/official-artifact-bundle|official-artifacts|theme-export/);
    }
  });
});
