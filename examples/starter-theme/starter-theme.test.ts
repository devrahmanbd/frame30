/**
 * Starter-theme gates — mirrors the per-theme suites that pin the shipped
 * themes (`wiring.test.ts` for composition, `skins.test.ts` for
 * token-driven CSS, `preview.test.ts` for preview bodies, plus the studio
 * twin-parity suite in `src/lib/studio/catalog.test.ts:837`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  catalogEntry,
  parseAst,
  type SectionBuilder,
  type SectionType,
  type TemplateKey,
} from "../../src/lib/builder-ast";
import {
  buildStarterFooterMain,
  buildStarterHeaderMain,
  buildStarterHomepageMain,
  STARTER_HOMEPAGE_TYPES,
} from "./homepage";
import { starterPreviewSource } from "./preview";
import {
  STARTER_SKIN_DEFAULTS,
  STARTER_WIDGET_DEFAULTS,
  resolveStarterSkin,
  withStarterDefaults,
} from "./skins";
import { STARTER_TOKENS } from "./tokens";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "skins.css"), "utf8");

let n = 0;
const s: SectionBuilder = (type, props = {}) => ({
  id: `starter-${n++}`,
  type,
  props: { ...props },
});

describe("starter-theme gates", () => {
  it("locks brand tokens", () => {
    expect(STARTER_TOKENS.brand).toBe("#166534");
    expect(STARTER_TOKENS.accent).toBe("#CA8A04");
    expect(STARTER_TOKENS.surface).toBe("#FFFFFF");
    expect(STARTER_TOKENS.ink).toBe("#1F2937");
    expect(STARTER_TOKENS.radius).toBe("8px");
    expect(STARTER_TOKENS.dark).toBeNull();
    expect(STARTER_TOKENS.digits).toBe("latin");
    expect(STARTER_TOKENS.locale).toBe("en");
    expect(STARTER_TOKENS.currencyDisplay).toBe("symbol");
  });

  it("resolves skin defaults under authored props", () => {
    const t = withStarterDefaults(s);
    // Defaults apply when the author says nothing …
    expect(t("product_rail", { heading: "X" }).props["skin"]).toBe("compact");
    expect(t("hero_carousel", {}).props["skin"]).toBe("minimal");
    // … but an explicit inspector value always wins.
    expect(t("product_rail", { heading: "X", skin: "editorial" }).props["skin"]).toBe(
      "editorial",
    );
    // Unknown values fall back to the widget default, never a crash.
    expect(resolveStarterSkin("product_rail", "nope")).toBe("compact");
    expect(resolveStarterSkin("product_rail", "")).toBe("compact");
    expect(resolveStarterSkin("product_rail", undefined)).toBe("compact");
    expect(resolveStarterSkin("hero_carousel", "fullbleed")).toBe("fullbleed");
    // Non-skinnable types pass through untouched.
    expect(resolveStarterSkin("banner", "x")).toBe("x");
    // Every default is a member of its closed vocabulary.
    for (const [type, defaults] of Object.entries(STARTER_WIDGET_DEFAULTS)) {
      const vocab: readonly string[] = (
        {
          product_rail: ["editorial", "compact", "minimal"],
          hero_carousel: ["split", "fullbleed", "minimal"],
          testimonials: ["carousel", "wall", "single"],
          product_grid: ["cards", "rows"],
        } as Record<string, readonly string[]>
      )[type]!;
      expect(vocab).toContain(defaults.skin as string);
    }
    expect(STARTER_SKIN_DEFAULTS.product_rail).toBe("compact");
  });

  it("keeps skins.css token-driven: theme vars only, no hex literals", () => {
    // Every default skin is keyed off data-widget + data-skin.
    for (const [type, defaults] of Object.entries(STARTER_WIDGET_DEFAULTS)) {
      expect(
        css.includes(`[data-widget="${type}"][data-skin="${defaults.skin}"]`),
        `${type}/${defaults.skin}`,
      ).toBe(true);
    }
    expect(css).toMatch(/var\(--theme-/);
    expect(css).toMatch(/var\(--theme-brand\)/);
    expect(css).toMatch(/var\(--theme-surface\)/);
    expect(css).toMatch(/var\(--theme-ink\)/);
    expect(css).toMatch(/var\(--theme-accent\)/);
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it("emits only types resolvable via catalogEntry (studio twin parity)", () => {
    const source = starterPreviewSource();
    const authored: TemplateKey[] = ["index", "collection", "product"];
    const sections = [
      ...buildStarterHeaderMain(s),
      ...buildStarterHomepageMain(s),
      ...buildStarterFooterMain(s),
      ...authored.flatMap((key) => source.main(key, s) ?? []),
    ];
    // Homepage keeps its declared order with the hero first.
    expect(buildStarterHomepageMain(s).map((x) => x.type)).toEqual([
      ...STARTER_HOMEPAGE_TYPES,
    ]);
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(
        catalogEntry(section.type as SectionType),
        `${section.type} must exist in the catalog`,
      ).toBeDefined();
    }
    // Templates the theme does not author return null so the engine can
    // synthesize the generic demo body — never an empty array.
    const unauthored: TemplateKey[] = [
      "page",
      "blog",
      "cart",
      "checkout",
      "search",
      "account",
    ];
    for (const key of unauthored) {
      expect(source.main(key, s), key).toBeNull();
    }
  });

  it("survives a persist round trip with skins and twins intact", () => {
    const doc = {
      header: buildStarterHeaderMain(s),
      main: buildStarterHomepageMain(s),
      footer: buildStarterFooterMain(s),
    };
    const parsed = parseAst(JSON.parse(JSON.stringify(doc)));
    expect(parsed.main).toHaveLength(doc.main.length);
    expect(parsed.header).toHaveLength(doc.header.length);
    expect(parsed.footer).toHaveLength(doc.footer.length);
    // Skin defaults are catalogue fields, so they survive the round trip.
    const hero = parsed.main[0]!;
    expect(hero.type).toBe("hero_carousel");
    expect(hero.props["skin"]).toBe("minimal");
    const rail = parsed.main[1]!;
    expect(rail.props["skin"]).toBe("compact");
    // Bilingual twins ride along through the same coercion.
    expect(rail.props["heading_bn"]).toBe("সবচেয়ে জনপ্রিয়");
    // Ids stay unique per template.
    const ids = [...parsed.header, ...parsed.main, ...parsed.footer].map(
      (x) => x.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
