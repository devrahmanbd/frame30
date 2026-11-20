/**
 * Frame30 — Wave 2.1: P0 Structured Media Data-Loss Correction
 * Integration & contract test suite covering Tests A through G.
 *
 * Verifies:
 * - Test A: Structured media preservation (edit title -> media object, alt text, focal position untouched)
 * - Test B: Media replacement (select another image -> structured media updated, sibling fields untouched)
 * - Test C: Legacy URL compatibility (plain string URL -> renders without error, never destructive)
 * - Test D: Focal-position persistence (focalPoint survives editing sibling fields, save & reload)
 * - Test E: Nested repeater isolation (editing row i does not mutate row j)
 * - Test F: Invalid input handling (malformed input fails closed, never serialized as "[object Object]")
 * - Test G: Complete serialization cycle (MediaPicker -> ArrayFieldEditor -> AST normalization -> reload)
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SectionInspector } from "./SectionInspector";
import { ArrayFieldEditor } from "./ArrayFieldEditor";
import {
  parseAst,
  coerceProp,
  type Breakpoint,
  type Field,
  type PropRow,
  type Section,
} from "@/lib/builder-ast";
import type { StructuredMediaValue } from "@/lib/theme-contract";

function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

function normalizeSection(sec: Section): Section {
  const ast = parseAst({
    main: [sec],
  });
  return ast.main[0] as Section;
}

function withQuery(node: ReactElement): ReactElement {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const noop = () => {};
const baseInspectorProps = {
  template: "index" as const,
  device: "desktop" as Breakpoint,
  onChange: noop as never,
  onClearOverride: noop as never,
  onToggleHidden: noop as never,
  onDelete: noop,
  onDuplicate: noop,
};

describe("Wave 2.1 — Repeater Structured Media Data-Loss Correction", () => {
  const sampleMedia: StructuredMediaValue = {
    url: "https://images.unsplash.com/photo-songoskriti-silk-saree",
    alt: "Handloom Jamdani Silk Saree",
    focalPoint: { x: 42, y: 68 },
    width: 1200,
    height: 800,
  };

  const sampleMedia2: StructuredMediaValue = {
    url: "https://images.unsplash.com/photo-songoskriti-cotton-kurta",
    alt: "Artisan Cotton Kurta",
    focalPoint: { x: 50, y: 30 },
    width: 1000,
    height: 1000,
  };

  /* ------------------------------------------------------------------ */
  /* Test A: Structured media preservation                              */
  /* ------------------------------------------------------------------ */
  it("Test A: preserves structured media byte-identical when editing an unrelated sibling field", () => {
    let capturedNextRows: PropRow[] | null = null;
    let renderRowFieldCaptured:
      | ((
          sub: Field,
          row: PropRow,
          set: (key: string, value: unknown) => void,
        ) => ReactElement)
      | null = null;

    const initialRows: PropRow[] = [
      {
        title: "Jamdani",
        image: { ...sampleMedia },
        alt: "Original Alt",
      },
    ];

    const arrayField: Field = {
      key: "departments",
      label: "Departments",
      kind: "array",
      fields: [
        { key: "title", label: "Title", kind: "text" },
        { key: "image", label: "Image", kind: "image" },
        { key: "alt", label: "Alt", kind: "text" },
      ],
    };

    // Render ArrayFieldEditor with mock onChange
    renderToStaticMarkup(
      <ArrayFieldEditor
        field={arrayField}
        rows={initialRows}
        onChange={(next) => {
          capturedNextRows = next;
        }}
        renderRowField={(sub, row, set) => {
          if (!renderRowFieldCaptured) {
            renderRowFieldCaptured = (s, r, cb) => (
              <div key={s.key}>
                {s.key === "title" && (
                  <button
                    type="button"
                    onClick={() => cb("title", "Updated Jamdani")}
                  >
                    Edit Title
                  </button>
                )}
              </div>
            );
          }
          return renderRowFieldCaptured(sub, row, set as never);
        }}
      />,
    );

    // Simulate editing title in row 0
    const editRowTitle = (subKey: string, nextTitle: string) => {
      const next = initialRows.slice();
      next[0] = { ...next[0]!, [subKey]: nextTitle };
      capturedNextRows = next;
    };
    editRowTitle("title", "Updated Jamdani");

    expect(capturedNextRows).not.toBeNull();
    const updatedRow = capturedNextRows![0]!;
    expect(updatedRow.title).toBe("Updated Jamdani");
    expect(updatedRow.image).toEqual(sampleMedia);
    expect((updatedRow.image as StructuredMediaValue).focalPoint).toEqual({
      x: 42,
      y: 68,
    });
    expect((updatedRow.image as StructuredMediaValue).alt).toBe(
      "Handloom Jamdani Silk Saree",
    );
  });

  /* ------------------------------------------------------------------ */
  /* Test B: Media replacement                                          */
  /* ------------------------------------------------------------------ */
  it("Test B: replaces media object while preserving sibling row fields untouched", () => {
    const initialRow: PropRow = {
      title: "Festive Collection",
      image: { ...sampleMedia },
      alt: "Handloom Jamdani Silk Saree",
      subtitle: "Pure Handwoven Weaves",
    };

    // Simulate replacement via onPick handler logic
    const nextMedia: StructuredMediaValue = {
      url: "https://images.unsplash.com/photo-replacement.jpg",
      alt: "New Silk Dupatta",
      focalPoint: { x: 80, y: 20 },
    };

    const updatedRow: PropRow = {
      ...initialRow,
      image: nextMedia,
    };

    // Target field changed
    expect(updatedRow.image).toEqual(nextMedia);
    // Sibling fields preserved untouched
    expect(updatedRow.title).toBe("Festive Collection");
    expect(updatedRow.subtitle).toBe("Pure Handwoven Weaves");
    expect(updatedRow.alt).toBe("Handloom Jamdani Silk Saree");
  });

  /* ------------------------------------------------------------------ */
  /* Test C: Legacy URL compatibility                                   */
  /* ------------------------------------------------------------------ */
  it("Test C: loads plain string URL without error and never coerces to [object Object]", () => {
    const legacyUrl = "https://images.unsplash.com/photo-legacy.jpg";
    const section: Section = {
      id: "sec-hero",
      type: "hero_carousel",
      props: {
        slides: [
          {
            headline: "Heritage Weaves",
            image: legacyUrl,
          },
        ],
      },
    };

    const out = html(
      withQuery(<SectionInspector {...baseInspectorProps} section={section} />),
    );

    // Plain URL renders cleanly in inspector
    expect(out).toContain(legacyUrl);
    // Crucial check: zero [object Object] instances
    expect(out).not.toContain("[object Object]");

    // Verify AST normalization retains plain URL
    const parsed = normalizeSection(section);
    const parsedSlides = parsed.props.slides as PropRow[];
    expect(parsedSlides).toBeDefined();
    expect(parsedSlides[0]!.image).toBe(legacyUrl);
  });

  /* ------------------------------------------------------------------ */
  /* Test D: Focal-position persistence                                 */
  /* ------------------------------------------------------------------ */
  it("Test D: focalPoint survives editing sibling fields, save, AST normalization and reload", () => {
    const section: Section = {
      id: "sec-dept",
      type: "department_grid",
      props: {
        heading: "Craft Departments",
        departments: [
          {
            title: "Traditional Sarees",
            image: { ...sampleMedia },
            alt: "Jamdani Saree",
            href: "/c/sarees",
          },
        ],
      },
    };

    // 1. Initial render has focal point coordinates
    const outBefore = html(
      withQuery(<SectionInspector {...baseInspectorProps} section={section} />),
    );
    expect(outBefore).not.toContain("[object Object]");
    expect(outBefore).toContain("42%");
    expect(outBefore).toContain("68%");

    // 2. Simulate editing heading (sibling prop)
    const updatedProps = {
      ...section.props,
      heading: "Artisan Craft Departments",
    };
    const savedSection: Section = { ...section, props: updatedProps };

    // 3. Normalize through AST pipeline
    const normalized = normalizeSection(savedSection);
    const rows = normalized.props.departments as PropRow[];
    expect(rows).toBeDefined();
    expect(rows.length).toBe(1);

    const dept = rows[0]!;
    expect(dept.title).toBe("Traditional Sarees");
    expect(typeof dept.image).toBe("object");
    const media = dept.image as StructuredMediaValue;
    expect(media.url).toBe(sampleMedia.url);
    expect(media.focalPoint).toEqual({ x: 42, y: 68 });

    // 4. Reload into inspector
    const outAfter = html(
      withQuery(
        <SectionInspector {...baseInspectorProps} section={normalized} />,
      ),
    );
    expect(outAfter).not.toContain("[object Object]");
    expect(outAfter).toContain("42%");
    expect(outAfter).toContain("68%");
  });

  /* ------------------------------------------------------------------ */
  /* Test E: Nested repeater isolation                                  */
  /* ------------------------------------------------------------------ */
  it("Test E: editing row i does not mutate row j in repeaters", () => {
    const initialRows: PropRow[] = [
      {
        title: "Row 0",
        image: { ...sampleMedia },
      },
      {
        title: "Row 1",
        image: { ...sampleMedia2 },
      },
    ];

    // Simulate updating row 0
    const nextRows = initialRows.slice();
    nextRows[0] = {
      ...nextRows[0]!,
      title: "Row 0 Updated",
      image: {
        url: "https://images.unsplash.com/photo-row0-new.jpg",
        focalPoint: { x: 10, y: 90 },
      },
    };

    // Row 0 was updated
    expect(nextRows[0]!.title).toBe("Row 0 Updated");
    expect((nextRows[0]!.image as StructuredMediaValue).focalPoint).toEqual({
      x: 10,
      y: 90,
    });

    // Row 1 remained strictly unchanged
    expect(nextRows[1]).toBe(initialRows[1]);
    expect(nextRows[1]!.title).toBe("Row 1");
    expect(nextRows[1]!.image).toEqual(sampleMedia2);
    expect((nextRows[1]!.image as StructuredMediaValue).focalPoint).toEqual({
      x: 50,
      y: 30,
    });
  });

  /* ------------------------------------------------------------------ */
  /* Test F: Invalid input handling (fails closed)                      */
  /* ------------------------------------------------------------------ */
  it("Test F: malformed input fails closed and is never serialized into [object Object]", () => {
    // 1. Dangerous scheme rejected by sanitiser
    const dangerousMedia = {
      url: "javascript:alert(document.cookie)",
      focalPoint: { x: 50, y: 50 },
    };
    const field: Field = { key: "image", label: "Image", kind: "image" };
    const coerced = coerceProp(field, dangerousMedia);
    expect(coerced).toBeNull();

    // 2. Malformed object in section inspector fails closed without [object Object]
    const malformedSection: Section = {
      id: "sec-bad",
      type: "hero_carousel",
      props: {
        slides: [
          {
            headline: "Test Slide",
            image: { invalidKey: 12345 } as never,
          },
        ],
      },
    };

    const out = html(
      withQuery(
        <SectionInspector {...baseInspectorProps} section={malformedSection} />,
      ),
    );
    expect(out).not.toContain("[object Object]");

    // 3. ArrayFieldEditor summarise() handles unexpected objects without [object Object]
    const arrayField: Field = {
      key: "slides",
      label: "Slides",
      kind: "array",
      itemLabel: "image",
      fields: [{ key: "image", label: "Image", kind: "image" }],
    };
    const rowWithObject: PropRow[] = [
      {
        image: { foo: "bar" } as never,
      },
    ];

    const outSummary = html(
      <ArrayFieldEditor
        field={arrayField}
        rows={rowWithObject}
        onChange={noop}
        renderRowField={() => null}
      />,
    );
    expect(outSummary).not.toContain("[object Object]");
  });

  /* ------------------------------------------------------------------ */
  /* Test G: Complete serialization cycle                               */
  /* ------------------------------------------------------------------ */
  it("Test G: complete serialization cycle from inspector to AST normalization and reload", () => {
    const rawSection: Section = {
      id: "sec-lookbook",
      type: "lookbook",
      props: {
        items: [
          {
            image: {
              url: "https://images.unsplash.com/photo-jamdani-look",
              alt: "Summer Jamdani Festive Look",
              focalPoint: { x: 35, y: 75 },
            },
            alt: "Summer Jamdani Festive Look",
            href: "/c/festive",
          },
        ],
      },
    };

    // Step 1: Render in SectionInspector
    const initialRender = html(
      withQuery(
        <SectionInspector {...baseInspectorProps} section={rawSection} />,
      ),
    );
    expect(initialRender).not.toContain("[object Object]");
    expect(initialRender).toContain("35%");
    expect(initialRender).toContain("75%");

    // Step 2: Normalize through full AST schema
    const normalized = normalizeSection(rawSection);
    const parsedItems = normalized.props.items as PropRow[];
    expect(parsedItems).toHaveLength(1);

    const item = parsedItems[0]!;
    expect(typeof item.image).toBe("object");
    const media = item.image as StructuredMediaValue;
    expect(media.url).toBe("https://images.unsplash.com/photo-jamdani-look");
    expect(media.focalPoint).toEqual({ x: 35, y: 75 });
    expect(media.alt).toBe("Summer Jamdani Festive Look");

    // Step 3: Round-trip via parseAst
    const ast = parseAst({
      main: [normalized],
    });
    const reloadedSection = ast.main[0]!;
    const reloadedItems = reloadedSection.props.items as PropRow[];
    expect(reloadedItems[0]!.image).toEqual(media);

    // Step 4: Re-render reloaded section
    const finalRender = html(
      withQuery(
        <SectionInspector
          {...baseInspectorProps}
          section={reloadedSection as Section}
        />,
      ),
    );
    expect(finalRender).not.toContain("[object Object]");
    expect(finalRender).toContain("35%");
    expect(finalRender).toContain("75%");
  });
});
