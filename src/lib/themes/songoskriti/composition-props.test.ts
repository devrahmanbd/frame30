/**
 * The theme's authored props must be DECLARED fields that survive the
 * sanitiser.
 *
 * **The defect class.** The AST sanitiser (`parseSection`,
 * `src/lib/builder-ast.ts:7748-7772`) copies ONLY the props a widget's
 * catalogue entry declares, plus the advanced-tab fields. Every prop the
 * theme authors on a section that the catalogue does not declare is
 * **silently dropped on save** — no warning, no error, the merchant's copy
 * simply disappears and the renderer falls through to its own literal
 * fallback.
 *
 * That is how the archive's band label read **"Collection"**: the theme's
 * `category_header` composition sets `title` / `title_bn`
 * (`src/lib/themes/songoskriti/preview.ts`, the `case "archive":` body), the
 * catalogue declared only `heading` / `body` / `imageUrl` / `scrim` /
 * `showCount` / `showBreadcrumb` / `homeLabel`, so the sanitiser dropped the
 * title and the Songoskriti renderer's chain
 * (`src/components/builder/songoskriti.tsx:2279` —
 * `str("title") || str("text") || str("heading") || "Collection"`) fell
 * through to the literal.
 *
 * **The contract.** For EVERY composition the theme authors — the ten base
 * templates AND the two variant bodies — and for EVERY section in them:
 *
 *   1. every prop the theme sets is a **declared** field (a catalogue field,
 *      or an advanced-tab field, which travels on its own declared list);
 *   2. every prop the theme sets **survives `parseTemplates`** with the same
 *      value.
 *
 * One test, every composition: the archive, the search, the collection and
 * every other body the theme ships are covered by the same assertion, so the
 * class cannot come back on a template nobody looked at.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ADVANCED_FIELDS } from "../../builder-advanced";
import {
  TEMPLATE_KEYS,
  catalogEntry,
  parseTemplates,
  type PropValue,
  type Section,
  type SectionBuilder,
  type ThemeAst,
} from "../../builder-ast";
import { SONGOSKRITI_WIDGETS } from "../../../components/builder/songoskriti";
import {
  widgetReader,
  type WidgetCtx,
} from "../../../components/builder/widgets";
import { songoskritiPreviewSource } from "./preview";

/** The advanced-tab fields travel on their own declared list. */
const ADVANCED_KEYS = new Set(ADVANCED_FIELDS.map((field) => field.key));

/** The plain builder the engine uses — the theme's own default/variation
 *  wrap happens INSIDE `main` (`src/lib/themes/songoskriti/preview.ts:89`). */
function plainBuilder(): SectionBuilder {
  let n = 0;
  return (type, props = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
}

/** The variant bodies the theme authors (`blog_listing`, `blog_article`). */
const VARIANTS = ["blog_listing", "blog_article"] as const;

/** Every composition the theme authors, with the template key it parses under. */
function compositions(): { key: string; label: string; ast: ThemeAst }[] {
  const source = songoskritiPreviewSource();
  const out: { key: string; label: string; ast: ThemeAst }[] = [];
  for (const key of TEMPLATE_KEYS) {
    const main = source.main(key, plainBuilder()) ?? [];
    out.push({ key, label: key, ast: { header: [], main, footer: [] } });
  }
  const variantMain = source.variantMain;
  if (variantMain) {
    for (const variant of VARIANTS) {
      const main = variantMain(variant, plainBuilder()) ?? [];
      out.push({
        key: variant,
        label: `variant:${variant}`,
        ast: { header: [], main, footer: [] },
      });
    }
  }
  return out;
}

/** Flatten a composition's sections, depth first. */
function flatten(sections: Section[]): Section[] {
  const out: Section[] = [];
  for (const section of sections) {
    out.push(section);
    if (section.children) out.push(...flatten(section.children));
  }
  return out;
}

/** The parsed section with the same id, or undefined when parse dropped it. */
function findById(sections: Section[], id: string): Section | undefined {
  for (const section of flatten(sections)) {
    if (section.id === id) return section;
  }
  return undefined;
}

/**
 * The declared prop keys of one widget: its catalogue fields, PLUS the
 * বাংলা sibling of every `bitext` field. A `bitext` field is a text field
 * whose `${key}_bn` sibling travels with it (`withBiText`,
 * `src/lib/builder-ast.ts:6505-6521`), so the sibling is a declared prop
 * even though it is not a field of its own.
 */
function declaredKeys(type: Section): Set<string> {
  const entry = catalogEntry(type.type)!;
  const keys = new Set(entry.fields.map((field) => field.key));
  for (const field of entry.fields) {
    if (field.kind === "bitext") keys.add(`${field.key}_bn`);
  }
  return keys;
}

describe("songoskriti composition props — declared and surviving", () => {
  it("authors only declared props, and every one of them survives the sanitiser", () => {
    const problems: string[] = [];

    for (const { key, label, ast } of compositions()) {
      const parsed = parseTemplates({ [key]: ast });
      const parsedAst = parsed[key];
      if (!parsedAst) {
        problems.push(
          `${label}: the template key did not survive parseTemplates`,
        );
        continue;
      }
      for (const section of flatten(ast.main)) {
        const entry = catalogEntry(section.type);
        if (!entry) {
          problems.push(`${label}: unknown widget type ${section.type}`);
          continue;
        }
        const declared = declaredKeys(section);
        for (const [prop, value] of Object.entries(section.props)) {
          if (!declared.has(prop) && !ADVANCED_KEYS.has(prop)) {
            problems.push(
              `${label}: ${section.type}.${prop} is not a declared field — the sanitiser drops it on save`,
            );
            continue;
          }
          const parsedSection = findById(parsedAst.main, section.id);
          if (!parsedSection) {
            problems.push(
              `${label}: ${section.type} was dropped by parseTemplates`,
            );
            continue;
          }
          const survived = parsedSection.props[prop];
          if (survived === undefined) {
            problems.push(
              `${label}: ${section.type}.${prop} did not survive parseTemplates`,
            );
            continue;
          }
          if (!sameValue(survived, value)) {
            problems.push(
              `${label}: ${section.type}.${prop} changed across parseTemplates (${JSON.stringify(
                value,
              )} → ${JSON.stringify(survived)})`,
            );
          }
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it("covers every composition the theme authors — the ten templates and both variants", () => {
    // The pin: a new template or variant that is NOT enumerated above would
    // silently escape the contract, so the count is exact.
    const labels = compositions().map((c) => c.label);
    expect(labels).toEqual([
      ...TEMPLATE_KEYS,
      "variant:blog_listing",
      "variant:blog_article",
    ]);
    expect(labels.length).toBe(12);
  });

  it("keeps the archive band's title — the prop that fell through to 'Collection'", () => {
    // The named instance of the class, pinned separately so a regression
    // names itself. The archive's `category_header` sets `title` (the
    // merchant-safe label) and leaves `heading` blank (the route owns the
    // page's <h1>), so the surviving `title` is what the band renders.
    const source = songoskritiPreviewSource();
    const main = source.main("archive", plainBuilder()) ?? [];
    const header = main.find((section) => section.type === "category_header");
    expect(header).toBeDefined();
    expect(header!.props.heading).toBe("");
    expect(header!.props.title).toBe("Archive");

    const parsed = parseTemplates({
      archive: { header: [], main, footer: [] },
    });
    const parsedHeader = parsed.archive!.main.find(
      (section) => section.type === "category_header",
    )!;
    expect(parsedHeader.props.title).toBe("Archive");
    expect(parsedHeader.props.title_bn).toBe("আর্কাইভ");
  });

  it("RENDERS the archive band's label from the parsed props — never 'Collection'", () => {
    // The end-to-end proof of the MUST FIX: the theme's own renderer, fed
    // the props the SANITISER kept, must show the band label and not the
    // renderer's literal fallback.
    const source = songoskritiPreviewSource();
    const main = source.main("archive", plainBuilder()) ?? [];
    const parsed = parseTemplates({
      archive: { header: [], main, footer: [] },
    });
    const parsedHeader = parsed.archive!.main.find(
      (section) => section.type === "category_header",
    )!;
    const html = renderToStaticMarkup(
      createElement(
        SONGOSKRITI_WIDGETS.category_header as (
          p: WidgetCtx,
        ) => React.ReactElement,
        {
          section: parsedHeader,
          ...widgetReader(parsedHeader, undefined, "en"),
          Heading: "h2",
          primary: false,
          editing: false,
          locale: "en",
          storeSlug: "songoskriti",
          data: { rows: undefined, pending: false },
          renderChildren: () => null,
          link: (href: string) => href,
        },
      ),
    );
    expect(html).toContain("Archive");
    expect(html).not.toContain("Collection");
  });
});

/** Structural equality for the prop values a section may carry. */
function sameValue(a: PropValue, b: PropValue): boolean {
  if (a === b) return true;
  if (typeof a === "object" && typeof b === "object") {
    // Key ORDER is not part of the value: the sanitiser rebuilds every row
    // object in the catalogue's own field order, so a row survives with the
    // same KEYS and the same VALUES in a different order.
    return canonical(a) === canonical(b);
  }
  return false;
}

/** A stable, order-insensitive JSON form of a prop value. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const bag = value as Record<string, unknown>;
    return `{${Object.keys(bag)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(bag[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
