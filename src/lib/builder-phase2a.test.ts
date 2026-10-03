/**
 * Phase 2A — template suffix + fallback chain, named zones, global_ref.
 *
 * Covers: suffix resolution order, the full fallback chain (including
 * unknown suffixes), the zone allowlist, global_ref resolve + missing-ref
 * placeholder, and preview fallback resolution.
 */
import { describe, expect, it } from "vitest";
import {
  GLOBAL_REF_ENTRY,
  GLOBAL_REF_MISSING,
  TEMPLATE_ZONES,
  catalogEntry,
  globalRefTarget,
  isNamedZone,
  isSlot,
  isVariantTemplateKey,
  isZone,
  lintTemplate,
  normalizeTemplateSuffix,
  parseAst,
  parseTemplates,
  resolveGlobalRef,
  resolveTemplate,
  resolveTemplateCandidates,
  templateSuffixFromOverride,
  zoneAllowed,
  zonesFor,
  type GlobalRefBlock,
  type Section,
  type TemplateKey,
  type ThemeAst,
} from "./builder-ast";
import { resolvePreviewAst } from "./theme-preview-nav";

const body = (id: string, text: string): ThemeAst =>
  parseAst({
    header: [],
    main: [{ id, type: "heading", props: { text } }],
    footer: [],
  });

const node = (id: string, type: string, props: Record<string, unknown>) =>
  ({ id, type, props }) as unknown as Section;

describe("template suffix candidates", () => {
  it("orders most-specific first: suffix → base → page → index", () => {
    expect(
      resolveTemplateCandidates("product", { suffix: "summer" }),
    ).toEqual(["product_summer", "product", "page", "index"]);
  });

  it("adds slug variants incl. the old page_<slug> package shape", () => {
    expect(
      resolveTemplateCandidates("blog", { slug: "our-craft" }),
    ).toEqual([
      "blog_our_craft",
      "page_our_craft",
      "blog",
      "page",
      "index",
    ]);
  });

  it("skips the redundant page_<slug> hop when the base is page", () => {
    expect(resolveTemplateCandidates("page", { slug: "about" })).toEqual([
      "page_about",
      "page",
      "index",
    ]);
  });

  it("ignores malformed suffixes instead of building junk keys", () => {
    expect(resolveTemplateCandidates("product", { suffix: "" })).toEqual([
      "product",
      "page",
      "index",
    ]);
    expect(
      resolveTemplateCandidates("product", { suffix: "../../etc" }),
    ).toEqual(["product", "page", "index"]);
  });

  it("normalises hyphens to underscores, rejects the rest", () => {
    expect(normalizeTemplateSuffix("Summer-Sale")).toBe("summer_sale");
    expect(normalizeTemplateSuffix("  ")).toBeNull();
    expect(normalizeTemplateSuffix("../../etc")).toBeNull();
    expect(normalizeTemplateSuffix("a".repeat(65))).toBeNull();
    expect(normalizeTemplateSuffix(42)).toBeNull();
  });

  it("derives the suffix from a row template override", () => {
    expect(templateSuffixFromOverride("product", "summer")).toBe("summer");
    expect(templateSuffixFromOverride("product", "product_summer")).toBe(
      "summer",
    );
    expect(templateSuffixFromOverride("product", "default")).toBeNull();
    expect(templateSuffixFromOverride("product", "")).toBeNull();
    expect(templateSuffixFromOverride("product", null)).toBeNull();
  });
});

describe("template fallback chain", () => {
  it("prefers the suffix variant over the base template", () => {
    const templates = parseTemplates({
      product: body("base", "Base"),
      product_summer: body("suffix", "Summer"),
    });
    const hit = resolveTemplate(templates, "product", { suffix: "summer" });
    expect(hit.key).toBe("product_summer");
    expect(hit.match).toBe("suffix");
  });

  it("falls back to base for an unknown suffix, never a crash", () => {
    const templates = parseTemplates({ product: body("base", "Base") });
    const hit = resolveTemplate(templates, "product", { suffix: "nope" });
    expect(hit.key).toBe("product");
    expect(hit.match).toBe("base");
  });

  it("resolves page_<slug> for old theme-package per-page ASTs", () => {
    const templates = parseTemplates({
      page: body("base", "Base"),
      page_about_us: body("slug", "About"),
    });
    const hit = resolveTemplate(templates, "blog", { slug: "about-us" });
    expect(hit.key).toBe("page_about_us");
    expect(hit.match).toBe("slug");
  });

  it("walks base → generic page → index", () => {
    const templates = parseTemplates({ index: body("home", "Home") });
    const hit = resolveTemplate(templates, "product", { suffix: "nope" });
    expect(hit.key).toBe("index");
    expect(hit.match).toBe("index");
    const paged = parseTemplates({
      index: body("home", "Home"),
      page: body("page", "Generic"),
    });
    expect(resolveTemplate(paged, "product").key).toBe("page");
  });

  it("does not let an empty variant shadow its authored base", () => {
    const templates = parseTemplates({
      product: body("base", "Base"),
      product_summer: { header: [], main: [], footer: [] },
    });
    const hit = resolveTemplate(templates, "product", { suffix: "summer" });
    expect(hit.key).toBe("product");
    expect(hit.match).toBe("base");
  });

  it("returns EMPTY_AST with match empty when nothing is authored", () => {
    const hit = resolveTemplate(parseTemplates({}), "product");
    expect(hit.match).toBe("empty");
    expect(hit.ast).toEqual({ header: [], main: [], footer: [] });
  });
});

describe("parseTemplates variant compatibility", () => {
  it("keeps page_<slug> variant keys through the round-trip", () => {
    const parsed = parseTemplates({
      index: body("home", "Home"),
      page_about: body("about", "About"),
    });
    expect(parsed["page_about"]?.main[0]?.id).toBe("about");
  });

  it("still drops unknown-prefix and malicious keys", () => {
    const parsed = parseTemplates({
      index: body("home", "Home"),
      evil_key: body("x", "X"),
      "../../etc/passwd": { main: [] },
    });
    expect(Object.keys(parsed).sort()).toEqual(["index"]);
  });

  it("recognises variant keys only with a known base", () => {
    expect(isVariantTemplateKey("product_summer")).toBe(true);
    expect(isVariantTemplateKey("page_about_us")).toBe(true);
    expect(isVariantTemplateKey("evil_key")).toBe(false);
    expect(isVariantTemplateKey("product")).toBe(false);
    expect(isVariantTemplateKey("../../etc/passwd")).toBe(false);
  });
});

describe("named zones allowlist", () => {
  it("allows the layout slots on every template", () => {
    const keys = Object.keys(TEMPLATE_ZONES) as TemplateKey[];
    expect(keys).toHaveLength(9);
    for (const key of keys) {
      expect(zoneAllowed(key, "header")).toBe(true);
      expect(zoneAllowed(key, "main")).toBe(true);
      expect(zoneAllowed(key, "footer")).toBe(true);
    }
  });

  it("covers not_found on the generic canvases and account first", () => {
    expect(zoneAllowed("account", "not_found")).toBe(true);
    expect(zoneAllowed("index", "not_found")).toBe(true);
    expect(zoneAllowed("page", "not_found")).toBe(true);
    expect(zoneAllowed("product", "not_found")).toBe(false);
    expect(zoneAllowed("checkout", "not_found")).toBe(false);
  });

  it("gates password/coming_soon to the generic canvases", () => {
    expect(zoneAllowed("index", "password")).toBe(true);
    expect(zoneAllowed("page", "coming_soon")).toBe(true);
    expect(zoneAllowed("product", "password")).toBe(false);
    expect(zoneAllowed("account", "password")).toBe(false);
  });

  it("keeps thank_you on checkout (and account history), popups off checkout", () => {
    expect(zoneAllowed("checkout", "thank_you")).toBe(true);
    expect(zoneAllowed("account", "thank_you")).toBe(true);
    expect(zoneAllowed("index", "thank_you")).toBe(false);
    expect(zoneAllowed("checkout", "popup")).toBe(false);
    expect(zoneAllowed("index", "popup")).toBe(true);
  });

  it("denies unknown zones and templates, and types the guards", () => {
    expect(zoneAllowed("index", "nope")).toBe(false);
    expect(zoneAllowed("nope", "main")).toBe(false);
    expect(zoneAllowed(null, "main")).toBe(false);
    expect(zonesFor("nope")).toEqual([]);
    expect(isZone("drawer")).toBe(true);
    expect(isZone("nope")).toBe(false);
    expect(isNamedZone("drawer")).toBe(true);
    expect(isNamedZone("main")).toBe(false);
    // The classic slot guards are unchanged: unknown slots read as main.
    expect(isSlot("drawer")).toBe(false);
  });
});

describe("global_ref section type", () => {
  const block: GlobalRefBlock = {
    id: "block-1",
    name: "Shared footer",
    nodes: [node("n1", "heading", { text: "Hi" })],
  };

  it("is a registered catalog entry for header/footer chrome", () => {
    expect(catalogEntry("global_ref")).toBe(GLOBAL_REF_ENTRY);
    expect(GLOBAL_REF_ENTRY.slots).toEqual(["header", "footer"]);
    expect(GLOBAL_REF_ENTRY.heading).toBe(false);
  });

  it("keeps the ref pointer through parse in header/footer", () => {
    const ast = parseAst({
      header: [{ id: "g1", type: "global_ref", props: { ref: "block-1" } }],
      main: [],
      footer: [],
    });
    expect(globalRefTarget(ast.header[0]!)).toBe("block-1");
    expect(lintTemplate(ast, "index").filter((i) => /slot/.test(i.message))).toEqual(
      [],
    );
  });

  it("flags a global_ref dropped into main as an illegal slot", () => {
    const ast = parseAst({
      header: [],
      main: [{ id: "g1", type: "global_ref", props: { ref: "block-1" } }],
      footer: [],
    });
    expect(ast.main[0]?.invalid).toContain("illegal_slot");
  });

  it("resolves by id and by case-insensitive name", () => {
    const ref = node("g1", "global_ref", { ref: "block-1" });
    const byId = resolveGlobalRef(ref as Section, [block]);
    expect(byId.missing).toBe(false);
    expect(byId.sections.map((s) => s.id)).toEqual(["g1~n1"]);

    const byName = resolveGlobalRef(
      node("g2", "global_ref", { ref: "shared FOOTER" }) as Section,
      [block],
    );
    expect(byName.missing).toBe(false);
    expect(byName.sections[0]?.id).toBe("g2~n1");
  });

  it("grafts detached copies and never mutates inputs", () => {
    const ref = node("g1", "global_ref", { ref: "block-1" }) as Section;
    const before = JSON.stringify({ ref, block });
    const out = resolveGlobalRef(ref, [block]);
    expect(out.sections[0]).not.toBe(block.nodes[0]);
    expect(out.sections[0]?.props).not.toBe(block.nodes[0]?.props);
    expect(JSON.stringify({ ref, block })).toBe(before);
  });

  it("returns a missing-ref placeholder and never crashes", () => {
    for (const ref of ["gone", "", "  ", 42, null]) {
      const out = resolveGlobalRef(
        node("g1", "global_ref", { ref: ref as never }) as Section,
        [block],
      );
      expect(out.missing).toBe(true);
      expect(out.sections).toHaveLength(1);
      expect(out.sections[0]?.invalid).toBe(GLOBAL_REF_MISSING);
    }
    // A non-ref node never resolves to a block.
    expect(
      globalRefTarget(node("h1", "heading", { text: "Hi" }) as Section),
    ).toBeNull();
  });
});

describe("preview fallback resolution", () => {
  it("resolves a preview target through suffix → base → generic", () => {
    const templates = parseTemplates({
      index: body("home", "Home"),
      product: body("base", "Base"),
      product_summer: body("suffix", "Summer"),
    });
    const hit = resolvePreviewAst(templates, {
      template: "product",
      slug: null,
      query: null,
    }, { suffix: "summer" });
    expect(hit.key).toBe("product_summer");
    expect(hit.match).toBe("suffix");
  });

  it("uses the clicked page slug for page_<slug> compatibility", () => {
    const templates = parseTemplates({
      index: body("home", "Home"),
      page: body("page", "Generic"),
      page_about: body("about", "About"),
    });
    const hit = resolvePreviewAst(templates, {
      template: "page",
      slug: "about",
      query: null,
    });
    expect(hit.key).toBe("page_about");
    expect(hit.match).toBe("slug");
  });

  it("never lands on an empty page while a generic template exists", () => {
    const templates = parseTemplates({ index: body("home", "Home") });
    const hit = resolvePreviewAst(templates, {
      template: "collection",
      slug: "unknown-thing",
      query: null,
    });
    expect(hit.key).toBe("index");
    expect(hit.ast.main.length).toBeGreaterThan(0);
  });
});
