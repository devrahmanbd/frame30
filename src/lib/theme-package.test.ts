import { describe, expect, it } from "vitest";
import { validateThemePackage } from "./theme-package";

const good = {
  key: "demo-studio",
  nameEn: "Demo Studio",
  nameBn: "ডেমো স্টুডিও",
  summaryEn: "Minimal demo theme.",
  summaryBn: "সাধারণ ডেমো থিম।",
  category: "fashion",
  version: "1.0.0",
  api: "^3.0.0",
  sortOrder: 10,
  tokens: {},
  templates: {
    index: { header: [], main: [], footer: [] },
  },
};

describe("validateThemePackage", () => {
  it("accepts a minimal valid package", () => {
    const out = validateThemePackage(good);
    expect(out.ok).toBe(true);
  });

  it("rejects raw HTML and javascript: URLs", () => {
    const bad = {
      ...good,
      templates: {
        index: {
          header: [],
          main: [
            {
              id: "x-html-1",
              type: "html",
              props: { html: "<script>alert(1)</script>" },
            },
          ],
          footer: [],
        },
      },
    };
    const out = validateThemePackage(bad);
    expect(out.ok).toBe(false);
  });

  it("rejects oversized packages", () => {
    const big = {
      ...good,
      templates: {
        index: {
          header: [],
          main: Array.from({ length: 500 }, (_, i) => ({
            id: `x-${i}`,
            type: "divider",
            props: {},
          })),
          footer: [],
        },
      },
    };
    const out = validateThemePackage(big);
    expect(out.ok).toBe(false);
  });

  it("rejects api versions outside ^3.0.0", () => {
    const out = validateThemePackage({ ...good, api: "^4.0.0" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors.some((e) => /api/i.test(e))).toBe(true);
    }
  });

  it("round-trips builder-shaped state", () => {
    const out = validateThemePackage({
      ...good,
      templates: {
        index: {
          header: [],
          main: [
            {
              id: "demo-hero-1",
              type: "hero_carousel",
              props: {
                slides: [{ headline: "Hello" }],
              },
            },
          ],
          footer: [],
        },
      },
    });
    expect(out.ok).toBe(true);
  });

  it("ships a valid example package", async () => {
    const fs = await import("node:fs");
    const pkg = JSON.parse(
      fs.readFileSync("docs/themes/example-studio.theme.json", "utf8"),
    );
    expect(validateThemePackage(pkg).ok).toBe(true);
  });
});
