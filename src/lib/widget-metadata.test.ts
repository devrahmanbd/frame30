import { describe, expect, it } from "vitest";
import { SECTION_CATALOG, flattenFields, type SectionType } from "./builder-ast";
import {
  HEADING_LEVEL_OPTIONS,
  applyPreset,
  dataEmptyState,
  headingLevelNumber,
  isDataWidget,
  isMediaWidget,
  presetsFor,
  propHint,
  requiredAltKeys,
  searchWidgets,
  verticalsOf,
  widgetHelp,
} from "./widget-metadata";
import { createRecentStore } from "./widget-recent";

const BENGALI = /[\u0980-\u09FF]/;

describe("Phase 2 exit gate — widget metadata", () => {
  it("every widget has bilingual help", () => {
    const missing = SECTION_CATALOG.filter((e) => {
      const help = widgetHelp(e.type);
      return !help?.en.trim() || !BENGALI.test(help.bn);
    });
    expect(missing.map((e) => e.type)).toEqual([]);
    expect(SECTION_CATALOG.length).toBe(126);
  });

  it("every data widget declares an editor empty state", () => {
    const data = SECTION_CATALOG.filter((e) => isDataWidget(e.type));
    expect(data.length).toBeGreaterThan(30);
    for (const entry of data) {
      const hint = dataEmptyState(entry.type);
      expect(hint?.en, entry.type).toBeTruthy();
      expect(BENGALI.test(hint!.bn), entry.type).toBe(true);
    }
    expect(dataEmptyState("spacer")).toBeNull();
  });

  it("every non-obvious prop resolves a hint", () => {
    const kinds = new Set(["number", "range", "unit", "select", "taxonomy", "embed", "url", "html", "array", "boolean", "image"]);
    const unexplained = new Set<string>();
    for (const entry of SECTION_CATALOG) {
      for (const field of flattenFields(entry.fields)) {
        if (!kinds.has(field.kind)) continue;
        if (!propHint(field.key)) unexplained.add(`${field.key}:${field.kind}`);
      }
    }
    expect([...unexplained]).toEqual([]);
  });

  it("media widgets require alt text", () => {
    const media = SECTION_CATALOG.filter((e) => isMediaWidget(e.type));
    expect(media.length).toBeGreaterThan(0);
    for (const entry of media) {
      const keys = requiredAltKeys(entry.type);
      expect(keys.length, entry.type).toBeGreaterThan(0);
      const owned = new Set(flattenFields(entry.fields).map((f) => f.key));
      for (const key of keys) expect(owned.has(key), `${entry.type}.${key}`).toBe(true);
    }
  });

  it("heading levels cannot skip a level", () => {
    expect([...HEADING_LEVEL_OPTIONS]).toEqual(["h2", "h3"]);
    const levels = HEADING_LEVEL_OPTIONS.map(headingLevelNumber).sort();
    // h1 comes from the claiming widget; every option is reachable from it.
    expect(levels).toEqual([2, 3]);
    for (const level of levels) expect(levels.includes(level - 1) || level === 2).toBe(true);
  });

  it("presets only write props the widget owns", () => {
    for (const entry of SECTION_CATALOG) {
      for (const preset of presetsFor(entry.type)) {
        const applied = applyPreset(entry.type, preset.key);
        expect(applied.dropped, `${entry.type}/${preset.key}`).toEqual([]);
        expect(Object.keys(applied.props).length).toBeGreaterThan(0);
      }
    }
    expect(presetsFor("hero").length).toBeGreaterThan(1);
  });

  it("search matches label, synonym and help, and respects slot legality", () => {
    const byLabel = searchWidgets({ term: "hero", slot: "main" });
    expect(byLabel[0]?.type).toBe("hero");
    const bySynonym = searchWidgets({ term: "carousel", slot: "main" });
    expect(bySynonym.some((h) => h.type === "product_rail" && h.reason === "synonym")).toBe(true);
    const byHelp = searchWidgets({ term: "instalment", slot: "main" });
    expect(byHelp.some((h) => h.type === "emi_calculator")).toBe(true);
    for (const hit of searchWidgets({ term: "", slot: "header" })) {
      const entry = SECTION_CATALOG.find((e) => e.type === hit.type)!;
      expect(entry.slots).toContain("header");
    }
  });

  it("recently used ranks ahead of equal matches and survives hostile storage", () => {
    const ranked = searchWidgets({ term: "", slot: "main", recent: ["faq"] });
    const faq = ranked.find((h) => h.type === "faq")!;
    const other = ranked.find((h) => h.type === "divider")!;
    expect(faq.score).toBeGreaterThan(other.score);

    const events: string[] = [];
    const hostile = {
      getItem: () => "{not json",
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const store = createRecentStore({ storage: hostile, logger: (e) => events.push(e) });
    expect(store.read()).toEqual([]);
    expect(store.push("hero")).toEqual(["hero"]);
    expect(events).toContain("builder.recent.write_failed");

    const map = new Map<string, string>();
    const good = createRecentStore({ storage: { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) } });
    good.push("hero");
    good.push("faq");
    expect(good.read()).toEqual(["faq", "hero"]);
    map.set("framique.builder.recent.v1", JSON.stringify(["nope", "hero", "hero"]));
    expect(good.read()).toEqual(["hero" as SectionType]);
  });

  it("verticals partition the themed widget families", () => {
    expect(verticalsOf("size_guide")).toContain("apparel");
    expect(verticalsOf("warranty_panel")).toContain("electronics");
    expect(verticalsOf("shade_finder")).toContain("beauty");
    expect(verticalsOf("hero")).toEqual(["general"]);
  });
});
