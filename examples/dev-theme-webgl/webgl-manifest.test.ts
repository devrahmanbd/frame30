/**
 * Level B WebGL capability proof — manifest gates.
 *
 * Fixture: `examples/dev-theme-webgl/` (`dev.theme.json` + `manifest.ts`).
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` §1-2/§4.
 *
 * Run: `npx vitest run --config examples/dev-theme-webgl/vitest.config.ts`
 * (the repo root config does not include this dir, so the slice ships its
 * own config — same precedent as `examples/dev-theme-slice` — and touches
 * no existing file).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEV_THEME_FIELD_TYPES,
  parseDevThemeManifest,
} from "../../src/lib/dev-theme-manifest";
import { WEBGL_MANIFEST_SOURCE, webglManifest } from "./manifest";

const here = dirname(fileURLToPath(import.meta.url));
const manifestJson: unknown = JSON.parse(
  readFileSync(join(here, "dev.theme.json"), "utf8"),
);

describe("dev-theme webgl — manifest validates", () => {
  it("the shipped dev.theme.json passes parseDevThemeManifest", () => {
    const verdict = parseDevThemeManifest(manifestJson);
    expect(verdict.ok).toBe(true);
  });

  it("the manifest.ts source agrees byte-for-byte with dev.theme.json", () => {
    expect(WEBGL_MANIFEST_SOURCE).toEqual(manifestJson);
    expect(webglManifest().id).toBe((manifestJson as { id: string }).id);
  });

  it("declares the webgl capability", () => {
    expect(webglManifest().capabilities).toContain("webgl");
  });

  it("declares presentation and commerce-read alongside webgl", () => {
    expect(webglManifest().capabilities).toContain("presentation");
    expect(webglManifest().capabilities).toContain("commerce-read");
  });

  it("declares NO animation and NO cart-write capabilities", () => {
    expect(webglManifest().capabilities).not.toContain("animation");
    expect(webglManifest().capabilities).not.toContain("cart-write");
  });

  it("binds the showcase section to the main slot", () => {
    const sections = webglManifest().sections;
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      key: "webgl-showcase",
      slot: "main",
      component: "WebGLProductShowcase",
    });
  });

  it("uses only the closed builder-field set for merchant settings", () => {
    const allowed = new Set<string>([...DEV_THEME_FIELD_TYPES]);
    expect(webglManifest().settings.length).toBeGreaterThan(0);
    for (const setting of webglManifest().settings) {
      expect(allowed.has(setting.type), `setting ${setting.key}`).toBe(true);
    }
  });

  it("exposes heading, product selection, and fallback poster settings", () => {
    const byKey = new Map(
      webglManifest().settings.map((setting) => [setting.key, setting.type]),
    );
    expect(byKey.get("heading")).toBe("text");
    expect(byKey.get("products")).toBe("product-selection");
    expect(byKey.get("poster")).toBe("image");
  });

  it("pins three with version, license, and integrity shape", () => {
    const three = webglManifest().dependencies.find(
      (dep) => dep.name === "three",
    );
    expect(three).toBeDefined();
    expect(three?.version).toBe("0.186.1");
    expect(three?.license.trim().length).toBeGreaterThan(0);
    expect(three?.integrity).toMatch(/^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/);
  });
});

describe("dev-theme webgl — validator rejections", () => {
  it("rejects an unknown capability", () => {
    const tampered = structuredClone(manifestJson) as {
      capabilities: string[];
    };
    tampered.capabilities.push("raw-gpu");
    const verdict = parseDevThemeManifest(tampered);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/capabilit/);
  });

  it("rejects a forbidden top-level key (network)", () => {
    const tampered = structuredClone(manifestJson) as Record<string, unknown>;
    tampered["network"] = { hosts: ["cdn.example"] };
    const verdict = parseDevThemeManifest(tampered);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/forbidden/);
  });

  it("rejects a dependency without an integrity digest", () => {
    const tampered = structuredClone(manifestJson) as {
      dependencies: Array<Record<string, unknown>>;
    };
    delete tampered.dependencies[0]["integrity"];
    const verdict = parseDevThemeManifest(tampered);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/integrity/);
  });

  it("rejects a non-exact runtime pin", () => {
    const tampered = structuredClone(manifestJson) as Record<string, unknown>;
    tampered["runtime"] = "^1.0.0";
    const verdict = parseDevThemeManifest(tampered);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/runtime/);
  });
});
