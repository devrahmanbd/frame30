/**
 * Demo theme fixture — manifest gates.
 *
 * Fixture: `examples/demo-theme/` (`dev.theme.json` + `manifest.ts`).
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` §1-2/§4.
 *
 * Run: `npx vitest run --config examples/demo-theme/vitest.config.ts`
 * (the repo root config does not include this fixture, so it ships its own
 * config — same precedent as `starter-plugin` — and touches no existing
 * file).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEV_THEME_FIELD_TYPES,
  parseDevThemeManifest,
} from "../../src/lib/dev-theme-manifest";
import { DEMO_MANIFEST_SOURCE, demoManifest } from "./manifest";
import { CAROUSEL_SETTINGS_SCHEMA } from "./media-carousel";
import { CARDS_SETTINGS_SCHEMA } from "./product-cards";
import { STORY_SETTINGS_SCHEMA } from "./story-block";

const here = dirname(fileURLToPath(import.meta.url));
const manifestJson: unknown = JSON.parse(
  readFileSync(join(here, "dev.theme.json"), "utf8"),
);

describe("demo theme — manifest validates", () => {
  it("the shipped dev.theme.json passes parseDevThemeManifest", () => {
    const verdict = parseDevThemeManifest(manifestJson);
    expect(verdict.ok).toBe(true);
  });

  it("the manifest.ts source agrees byte-for-byte with dev.theme.json", () => {
    expect(DEMO_MANIFEST_SOURCE).toEqual(manifestJson);
    expect(demoManifest().id).toBe((manifestJson as { id: string }).id);
    expect(demoManifest().version).toBe("0.1.0");
  });

  it("declares presentation + animation plus the commerce pair", () => {
    const capabilities = demoManifest().capabilities;
    expect(capabilities).toEqual(
      expect.arrayContaining([
        "presentation",
        "animation",
        "commerce-read",
        "cart-write",
      ]),
    );
  });

  it("declares NO webgl capability (isolated canvas is a follow-up)", () => {
    expect(demoManifest().capabilities).not.toContain("webgl");
  });

  it("binds all three demo sections to the main slot", () => {
    expect(demoManifest().sections).toEqual([
      { key: "story-arc", slot: "main", component: "StoryArc" },
      { key: "media-carousel", slot: "main", component: "MediaCarousel" },
      { key: "curated-cards", slot: "main", component: "CuratedCards" },
    ]);
  });

  it("uses only the closed builder-field set for merchant settings", () => {
    const allowed = new Set<string>([...DEV_THEME_FIELD_TYPES]);
    expect(demoManifest().settings.length).toBeGreaterThan(0);
    for (const setting of demoManifest().settings) {
      expect(allowed.has(setting.type), `setting ${setting.key}`).toBe(true);
    }
  });

  it("covers every per-section settings schema key", () => {
    const byKey = new Map(
      demoManifest().settings.map((setting) => [setting.key, setting.type]),
    );
    for (const schema of [
      STORY_SETTINGS_SCHEMA,
      CAROUSEL_SETTINGS_SCHEMA,
      CARDS_SETTINGS_SCHEMA,
    ]) {
      for (const field of schema) {
        expect(byKey.get(field.key), `setting ${field.key}`).toBe(field.type);
      }
    }
  });

  it("exposes a product-selection setting for the cards rail", () => {
    const byKey = new Map(
      demoManifest().settings.map((setting) => [setting.key, setting.type]),
    );
    expect(byKey.get("cards-products")).toBe("product-selection");
    expect(byKey.get("story-motion")).toBe("animation");
    expect(byKey.get("carousel-poster")).toBe("image");
  });
});

describe("demo theme — validator rejections", () => {
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

  it.each(["server", "hooks", "secrets", "network", "network-capability"])(
    "rejects the forbidden top-level key %s",
    (key) => {
      const tampered = structuredClone(manifestJson) as Record<string, unknown>;
      tampered[key] = {};
      const verdict = parseDevThemeManifest(tampered);
      expect(verdict.ok).toBe(false);
      expect(verdict.errors.join(" ")).toMatch(/forbidden/);
    },
  );

  it("rejects an unknown capability", () => {
    const tampered = structuredClone(manifestJson) as Record<string, unknown>;
    tampered["capabilities"] = ["presentation", "camera"];
    const verdict = parseDevThemeManifest(tampered);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/capabilit/);
  });

  it("rejects a non-exact runtime pin", () => {
    const tampered = structuredClone(manifestJson) as Record<string, unknown>;
    tampered["runtime"] = "^1.0.0";
    const verdict = parseDevThemeManifest(tampered);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/runtime/);
  });
});
