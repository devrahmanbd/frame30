/**
 * Level B thin vertical slice — manifest gates.
 *
 * Fixture: `examples/dev-theme-slice/` (`dev.theme.json` + `manifest.ts`).
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` §1-2/§4.
 *
 * Run: `npx vitest run --config examples/dev-theme-slice/vitest.config.ts`
 * (the repo root config only includes `src/**` and `starter-theme`, so this
 * slice ships its own config — same precedent as `starter-plugin` — and
 * touches no existing file).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEV_THEME_FIELD_TYPES,
  parseDevThemeManifest,
} from "../../src/lib/dev-theme-manifest";
import { SLICE_MANIFEST_SOURCE, sliceManifest } from "./manifest";

const here = dirname(fileURLToPath(import.meta.url));
const manifestJson: unknown = JSON.parse(
  readFileSync(join(here, "dev.theme.json"), "utf8"),
);

describe("dev-theme slice — manifest validates", () => {
  it("the shipped dev.theme.json passes parseDevThemeManifest", () => {
    const verdict = parseDevThemeManifest(manifestJson);
    expect(verdict.ok).toBe(true);
  });

  it("the manifest.ts source agrees byte-for-byte with dev.theme.json", () => {
    expect(SLICE_MANIFEST_SOURCE).toEqual(manifestJson);
    expect(sliceManifest().id).toBe((manifestJson as { id: string }).id);
  });

  it("declares the animation capability", () => {
    expect(sliceManifest().capabilities).toContain("animation");
  });

  it("declares NO webgl and NO cart-write capabilities", () => {
    expect(sliceManifest().capabilities).not.toContain("webgl");
    expect(sliceManifest().capabilities).not.toContain("cart-write");
  });

  it("binds the animated product section to the main slot", () => {
    const sections = sliceManifest().sections;
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      key: "animated-spotlight",
      slot: "main",
      component: "AnimatedProductSection",
    });
  });

  it("uses only the closed builder-field set for merchant settings", () => {
    const allowed = new Set<string>([...DEV_THEME_FIELD_TYPES]);
    expect(sliceManifest().settings.length).toBeGreaterThan(0);
    for (const setting of sliceManifest().settings) {
      expect(allowed.has(setting.type), `setting ${setting.key}`).toBe(true);
    }
  });

  it("exposes heading, product selection, and animation intensity settings", () => {
    const byKey = new Map(
      sliceManifest().settings.map((setting) => [setting.key, setting.type]),
    );
    expect(byKey.get("heading")).toBe("text");
    expect(byKey.get("products")).toBe("product-selection");
    expect(byKey.get("intensity")).toBe("animation");
  });
});

describe("dev-theme slice — validator rejections", () => {
  it("rejects a setting outside the closed field set (type: code)", () => {
    const tampered = structuredClone(manifestJson) as {
      settings: Array<{ key: string; label: string; type: string }>;
    };
    tampered.settings.push({ key: "snippet", label: "Snippet", type: "code" });
    const verdict = parseDevThemeManifest(tampered);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/settings/);
  });

  it("rejects a setting outside the closed field set (type: url)", () => {
    const tampered = structuredClone(manifestJson) as {
      settings: Array<{ key: string; label: string; type: string }>;
    };
    tampered.settings.push({ key: "link", label: "Link", type: "url" });
    expect(parseDevThemeManifest(tampered).ok).toBe(false);
  });

  it("rejects a forbidden top-level key (server)", () => {
    const tampered = structuredClone(manifestJson) as Record<string, unknown>;
    tampered["server"] = { entry: "server.js" };
    const verdict = parseDevThemeManifest(tampered);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/forbidden/);
  });

  it("rejects a non-exact runtime pin", () => {
    const tampered = structuredClone(manifestJson) as Record<string, unknown>;
    tampered["runtime"] = "^1.0.0";
    const verdict = parseDevThemeManifest(tampered);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/runtime/);
  });
});
