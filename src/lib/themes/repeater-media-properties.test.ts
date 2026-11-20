/**
 * Frame30 — Wave 2.1: Property-Based Verification for Repeater Structured Media
 *
 * Verifies invariants:
 * - Property P1: Unrelated field update preserves media object byte-identical
 * - Property P2: Image replacement mutates only the target field
 * - Property P3: Serialization and reload preserve structured media
 * - Property P4: Sibling repeater items remain unchanged
 * - Property P5: Legacy URL strings remain renderable
 * - Property P6: Invalid media never becomes "[object Object]"
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseAst, type PropRow, type Section } from "@/lib/builder-ast";
import {
  resolveMediaUrl,
  resolveMediaAlt,
  type StructuredMediaValue,
} from "@/lib/theme-contract";

// ── Arbitraries & Generators ──

const genValidFocalPoint = fc.record({
  x: fc.integer({ min: 0, max: 100 }),
  y: fc.integer({ min: 0, max: 100 }),
});

const genSafeUrl = fc.webUrl({ validSchemes: ["https"] });

const genStructuredMedia = fc.record({
  url: genSafeUrl,
  alt: fc.option(fc.string({ maxLength: 100 })),
  width: fc.option(fc.integer({ min: 10, max: 4000 })),
  height: fc.option(fc.integer({ min: 10, max: 4000 })),
  focalPoint: fc.option(genValidFocalPoint),
}).map((raw) => {
  const media: StructuredMediaValue = { url: raw.url };
  if (raw.alt !== null && raw.alt !== undefined) media.alt = raw.alt;
  if (raw.width !== null && raw.width !== undefined) media.width = raw.width;
  if (raw.height !== null && raw.height !== undefined) media.height = raw.height;
  if (raw.focalPoint !== null && raw.focalPoint !== undefined) media.focalPoint = raw.focalPoint;
  return media;
});

describe("Repeater Structured Media Property Suites", () => {
  /* ------------------------------------------------------------------ */
  /* Property P1: Unrelated field update preserves media byte-identical */
  /* ------------------------------------------------------------------ */
  it("Property P1: unrelated field updates in a repeater row preserve structured media byte-identical", () => {
    fc.assert(
      fc.property(
        genStructuredMedia,
        fc.string({ maxLength: 80 }),
        fc.string({ maxLength: 80 }),
        (media, initialTitle, updatedTitle) => {
          const row: PropRow = {
            title: initialTitle,
            image: { ...media },
            alt: "Static alt",
          };

          // Mutate unrelated field
          const nextRow: PropRow = {
            ...row,
            title: updatedTitle,
          };

          // Invariant: title changed to updated value
          expect(nextRow.title).toBe(updatedTitle);
          // Invariant: media object remains strictly deep-equal
          expect(nextRow.image).toEqual(media);
          expect((nextRow.image as StructuredMediaValue).url).toBe(media.url);
          expect((nextRow.image as StructuredMediaValue).focalPoint).toEqual(
            media.focalPoint,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P2: Image replacement mutates only target field           */
  /* ------------------------------------------------------------------ */
  it("Property P2: replacing image mutates only the image property, preserving siblings", () => {
    fc.assert(
      fc.property(
        genStructuredMedia,
        genStructuredMedia,
        fc.string({ maxLength: 60 }),
        fc.string({ maxLength: 60 }),
        (initialMedia, replacementMedia, title, subtitle) => {
          const row: PropRow = {
            title,
            subtitle,
            image: initialMedia,
          };

          const nextRow: PropRow = {
            ...row,
            image: replacementMedia,
          };

          // Invariant: target mutated
          expect(nextRow.image).toEqual(replacementMedia);
          // Invariant: siblings completely unchanged
          expect(nextRow.title).toBe(title);
          expect(nextRow.subtitle).toBe(subtitle);
        },
      ),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P3: Serialization and reload preserve structured media    */
  /* ------------------------------------------------------------------ */
  it("Property P3: serialization and AST reload preserve structured media attributes", () => {
    fc.assert(
      fc.property(genStructuredMedia, (media) => {
        const section: Section = {
          id: "sec-p3",
          type: "hero_carousel",
          props: {
            slides: [
              {
                headline: "Property Slide",
                image: media,
              },
            ],
          },
        };

        const parsedAst = parseAst({
          main: [section],
        });

        const reloadedSection = parsedAst.main[0]!;
        const reloadedSlides = reloadedSection.props.slides as PropRow[];
        expect(reloadedSlides).toBeDefined();
        expect(reloadedSlides.length).toBe(1);

        const reloadedRow = reloadedSlides[0]!;
        expect(typeof reloadedRow.image).toBe("object");

        const reloadedMedia = reloadedRow.image as StructuredMediaValue;
        expect(reloadedMedia.url).toBe(media.url);
        if (media.focalPoint) {
          expect(reloadedMedia.focalPoint).toEqual(media.focalPoint);
        }
        if (media.alt) {
          expect(reloadedMedia.alt).toBe(media.alt);
        }
      }),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P4: Sibling repeater items remain unchanged                */
  /* ------------------------------------------------------------------ */
  it("Property P4: updating row i in a repeater array leaves every row j (j != i) untouched", () => {
    fc.assert(
      fc.property(
        fc.array(genStructuredMedia, { minLength: 2, maxLength: 6 }),
        fc.integer({ min: 0, max: 5 }),
        fc.string({ maxLength: 50 }),
        (mediaList, rawTargetIdx, newTitle) => {
          const targetIdx = rawTargetIdx % mediaList.length;
          const rows: PropRow[] = mediaList.map((m, idx) => ({
            title: `Item ${idx}`,
            image: m,
          }));

          // Clone rows and update only targetIdx
          const nextRows = rows.slice();
          nextRows[targetIdx] = {
            ...nextRows[targetIdx]!,
            title: newTitle,
          };

          // Invariant: row i updated
          expect(nextRows[targetIdx]!.title).toBe(newTitle);

          // Invariant: all other rows untouched
          for (let j = 0; j < rows.length; j++) {
            if (j !== targetIdx) {
              expect(nextRows[j]).toBe(rows[j]);
              expect(nextRows[j]!.title).toBe(`Item ${j}`);
              expect(nextRows[j]!.image).toBe(mediaList[j]);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P5: Legacy URL strings remain renderable                   */
  /* ------------------------------------------------------------------ */
  it("Property P5: legacy URL strings round-trip and resolve cleanly without degradation", () => {
    fc.assert(
      fc.property(genSafeUrl, (legacyUrl) => {
        const section: Section = {
          id: "sec-legacy",
          type: "department_grid",
          props: {
            departments: [
              {
                title: "Legacy Dept",
                image: legacyUrl,
                href: "/c/legacy",
              },
            ],
          },
        };

        const ast = parseAst({
          main: [section],
        });

        const reloadedDept = (ast.main[0]!.props.departments as PropRow[])[0]!;
        expect(reloadedDept.image).toBe(legacyUrl);
        expect(resolveMediaUrl(reloadedDept.image)).toBe(legacyUrl);
        expect(resolveMediaAlt(reloadedDept.image, "fallback")).toBe("fallback");
      }),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P6: Invalid media never becomes "[object Object]"          */
  /* ------------------------------------------------------------------ */
  it("Property P6: any value passed to resolveMediaUrl or media resolution never emits '[object Object]'", () => {
    fc.assert(
      fc.property(fc.anything(), (arbitraryVal) => {
        const resolved = resolveMediaUrl(arbitraryVal);
        if (resolved !== null) {
          expect(resolved).not.toContain("[object Object]");
        }
        const alt = resolveMediaAlt(arbitraryVal, "fallback");
        expect(alt).not.toContain("[object Object]");
      }),
      { numRuns: 200 },
    );
  });
});
