/**
 * The distinctness gate's coverage for the **archive** key — the tenth
 * template, the one Decision **D1'** created.
 *
 * **Why a separate suite.** The gate's own suite
 * (`template-distinctness.test.ts`) already walks `TEMPLATE_KEYS` generically,
 * so it would keep passing even if the archive's row went quiet. A table that
 * quietly drops a template is a gate that quietly stops guarding it — the
 * plan's Review Focus 5. This suite therefore pins the archive row
 * **explicitly**: it names the six types and the six slots the archive body
 * must carry, it proves the row rejects the engine's generic demo body, it
 * proves the row is not vacuous (a body that carries NONE of the required
 * types is rejected), and it proves the archive is distinct from the nine
 * bodies that ship beside it.
 *
 * **The archive's shape, and why it is what it is.** `archive` is the
 * CONTENT archive (a category, a tag, an author — Decision **D1'**), and it is
 * a route-`<h1>` template: the route owns the page's `<h1>` (the resolved
 * term's name), so the body carries no `heading`. The body is the listing
 * frame — the `category_header` band, the blog pack (`blog_terms`,
 * `blog_archive`, `blog_pager`), the `pagination` and the `empty_state` —
 * and NO `product_grid`: the grid reads the host's `productSlot`, which only
 * the search template grants, so a grid on an archive would render eight
 * product skeletons.
 *
 * The machinery under test is the SAME machinery the other nine templates use
 * (`checkSongoskritiTemplateDistinctness`); this suite is a **focused** suite,
 * not a second implementation.
 */
import { describe, expect, it } from "vitest";
import {
  TEMPLATE_KEYS,
  catalogEntry,
  type Section,
  type SectionBuilder,
  type SectionType,
  type TemplateKey,
} from "../../builder-ast";
import { genericDemoMain } from "../../theme-preview-nav";
import {
  SONOSKRITI_TEMPLATE_EXPECTATIONS,
  checkSongoskritiTemplateDistinctness,
  checkTemplateDistinctness,
  previewSourceMainTypes,
} from "./template-distinctness";
import { songoskritiPreviewSource } from "./preview";

/** The plain builder the engine uses. */
function plainBuilder(): SectionBuilder {
  let n = 0;
  return (type, props = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
}

/** The theme's own shipped body for one template. */
function shippedMain(template: TemplateKey): Section[] {
  return songoskritiPreviewSource().main(template, plainBuilder())!;
}

/** A body built from a list of types. */
function fixtureBody(types: readonly string[]): Section[] {
  return types.map((type, index) => ({
    id: `${type}-${index}`,
    type: type as SectionType,
    props: {},
  }));
}

/** The rule ids the gate reported for one body. */
function ruleIdsOf(template: TemplateKey, main: readonly Section[]): string[] {
  return checkSongoskritiTemplateDistinctness(template, { main }).map(
    (issue) => issue.rule,
  );
}

/** The archive's six functional slots — the catalogue rows that carry `"archive"`. */
const ARCHIVE_SLOTS = [
  "category_header",
  "blog_terms",
  "blog_archive",
  "blog_pager",
  "pagination",
  "empty_state",
] as const;

describe("the distinctness gate covers the archive key", () => {
  it("declares a NON-EMPTY archive row — types AND slots", () => {
    const row = SONOSKRITI_TEMPLATE_EXPECTATIONS.archive;

    // The row must exist at all (the table is total — this suite re-runs the
    // totality assertion against the grown `TEMPLATE_KEYS`).
    expect(row, "the archive row must exist").toBeDefined();
    expect(Object.keys(SONOSKRITI_TEMPLATE_EXPECTATIONS).sort()).toEqual(
      [...TEMPLATE_KEYS].sort(),
    );
    expect(TEMPLATE_KEYS, "the archive key is in the union").toContain(
      "archive",
    );

    // A row with no required types and no required slots would let ANY body
    // pass the archive — the exact quiet the gate exists to prevent.
    expect(
      row.requiredTypes.length,
      "the archive row must require its own composition",
    ).toBeGreaterThan(0);
    expect(
      row.requiredSlots.length,
      "the archive row must require its functional slots",
    ).toBeGreaterThan(0);

    // The six slots are the archive's own — and they are exactly the six the
    // body ships.
    expect([...row.requiredSlots].sort()).toEqual([...ARCHIVE_SLOTS].sort());
    for (const slot of row.requiredSlots) {
      expect(
        row.requiredTypes,
        `the archive's required slot ${slot} must also be a required type`,
      ).toContain(slot);
    }
  });

  it("requires every archive slot to be a context widget granted on `archive`", () => {
    // The catalogue is the permission list: a required slot that carries no
    // `templates:` allowlist can never be fed by a host, and one that is not
    // granted on `archive` is a publish-blocking context mismatch
    // (`isContextMismatch`, `src/lib/builder-ast.ts:7935-7943`).
    for (const slot of ARCHIVE_SLOTS) {
      const entry = catalogEntry(slot);
      expect(entry, `the catalogue must know ${slot}`).toBeDefined();
      expect(
        entry!.templates ?? [],
        `${slot} must be granted on the archive template`,
      ).toContain("archive");
    }
  });

  it("rejects the engine's generic demo body on `archive` — R1", () => {
    // Built by the engine's OWN function, not by hand: the fixture cannot
    // drift from what a theme that authored nothing would ship.
    const generic = genericDemoMain("archive", plainBuilder());
    expect(
      generic.map((section) => section.type),
      "the engine's generic body is heading + rich_text",
    ).toEqual(["heading", "rich_text"]);

    const issues = checkSongoskritiTemplateDistinctness("archive", {
      main: generic,
    });
    const ids = issues.map((issue) => issue.rule);
    expect(ids, "a generic body on the archive must be rejected").toContain(
      "R1-not-generic",
    );
    const finding = issues.find((issue) => issue.rule === "R1-not-generic");
    expect(finding?.message).toContain("archive");
  });

  it("rejects a body that carries NONE of the archive's own composition — R2", () => {
    // A heading-led body that is NOT the engine's generic body (so the
    // exact-body clause cannot fire) and carries none of the archive's
    // required types: the composition clause of `R1` must fire, and `R2` must
    // fire with it. It carries `rich_text` — one of the engine's generic demo
    // shapes — because the heading-led clause of `R1` needs one.
    const body = fixtureBody(["heading", "rich_text", "image"]);
    const ids = ruleIdsOf("archive", body);
    expect(
      ids,
      "a body with no archive composition must be rejected",
    ).toContain("R1-not-generic");
    expect(ids, "the archive's own composition must be required").toContain(
      "R2-theme-composition",
    );
  });

  it("rejects a body that misses one of the archive's functional slots — R3", () => {
    // The body carries the archive's types but drops ONE slot: `R3` must
    // report the missing slot by name.
    const types = ARCHIVE_SLOTS.filter((slot) => slot !== "blog_pager");
    const ids = ruleIdsOf("archive", fixtureBody(types));
    expect(ids, "a body missing a functional slot must be rejected").toContain(
      "R3-functional-slots",
    );

    const issues = checkSongoskritiTemplateDistinctness("archive", {
      main: fixtureBody(types),
    });
    const finding = issues.find(
      (issue) => issue.rule === "R3-functional-slots",
    );
    expect(finding?.details.join(" ")).toContain("blog_pager");
  });

  it("rejects the archive's forbidden shapes — R5", () => {
    // The `product_grid` would render product skeletons (no `productSlot` on
    // the archive), a `heading` would claim the `<h1>` the route owns, and a
    // `rich_text` would be demo copy on a content surface.
    const body = fixtureBody([...ARCHIVE_SLOTS, "product_grid", "heading"]);
    const ids = ruleIdsOf("archive", body);
    expect(ids, "the forbidden shapes must be rejected").toContain(
      "R5-no-forbidden-types",
    );
    const finding = checkSongoskritiTemplateDistinctness("archive", {
      main: fixtureBody([...ARCHIVE_SLOTS, "product_grid", "heading"]),
    }).find((issue) => issue.rule === "R5-no-forbidden-types");
    expect(finding?.details.join(" ")).toContain("product_grid");
    expect(finding?.details.join(" ")).toContain("heading");
  });

  it("checks the archive against the OTHER templates — R6", () => {
    // The archive body must differ from every body that ships beside it. The
    // peer set is read from the theme's OWN preview source, so this compares
    // against what actually ships.
    const archiveTypes = shippedMain("archive").map((section) => section.type);
    for (const other of TEMPLATE_KEYS) {
      if (other === "archive") continue;
      const peer = shippedMain(other).map((section) => section.type);
      expect(
        archiveTypes,
        `the archive body must differ from the ${other} body`,
      ).not.toEqual(peer);
    }

    // And the gate FIRES when the archive duplicates another template: the
    // `blog` body's types are the closest neighbour (the blog pack), so a
    // copy of it must be caught on the archive.
    const blogTypes = shippedMain("blog").map((section) => section.type);
    const issues = checkSongoskritiTemplateDistinctness("archive", {
      main: fixtureBody(blogTypes),
    });
    const ids = issues.map((issue) => issue.rule);
    expect(
      ids,
      "an archive body that duplicates the blog body must be caught",
    ).toContain("R6-distinct-across-templates");
    const finding = issues.find(
      (issue) => issue.rule === "R6-distinct-across-templates",
    );
    expect(finding?.details.join(" ")).toContain("blog");
  });

  it("passes the shipped archive body — the gate must not reject what ships", () => {
    const issues = checkSongoskritiTemplateDistinctness("archive", {
      main: shippedMain("archive"),
    });
    expect(
      issues.map((issue) => `${issue.rule}: ${issue.message}`),
      "the shipped archive body must pass the gate",
    ).toEqual([]);
  });

  it("rejects the generic body for a theme that does NOT author an archive", () => {
    // The theme-agnostic property (the gate's own last suite, re-run for the
    // new key): a template the theme does not author has no theme-owned body
    // — the engine synthesises the generic demo body for it — and the gate
    // must reject that body. Somvabona does not author an archive today, so
    // the loop must reach the archive and reject its fall-through body.
    const source = songoskritiPreviewSource();
    const authored = source.main("archive", plainBuilder());
    expect(
      authored,
      "this suite's premise: the theme under test authors the archive",
    ).not.toBeNull();

    // The machinery, run with an EMPTY expectation table (the theme-agnostic
    // shape), must still reject the generic body for `archive`.
    const issues = checkTemplateDistinctness(
      "archive",
      { main: genericDemoMain("archive", plainBuilder()) },
      { expectations: {}, peerMainTypes: previewSourceMainTypes(source) },
    );
    expect(
      issues.map((issue) => issue.rule),
      "the generic body must be rejected for the un-authored archive",
    ).toContain("R1-not-generic");
  });
});
