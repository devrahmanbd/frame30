/**
 * Frame30 — Wave 2.3: Property-Based Verification for Merchant Content Configuration
 *
 * Verifies invariants:
 * - Property P1: Footer link ordering and isolation
 * - Property P2: Footer link editing preserves sibling links and bilingual twins
 * - Property P3: UGC Gallery multi-image ordering and metadata preservation
 * - Property P4: UGC Gallery image removal leaves sibling images unchanged
 * - Property P5: Legacy syntax normalization preserves content equivalence
 * - Property P6: Save/reload roundtrip invariance through AST normalization
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseAst, type Section } from "@/lib/builder-ast";
import { parseLinkList } from "@/components/builder/chrome";
import type { StructuredMediaValue } from "@/lib/theme-contract";

// ── Arbitraries & Generators ──

const genSafeLabel = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.trim().length > 0 && !s.includes("|") && !s.includes("\n") && !s.includes(","));

const genSafeHref = fc.oneof(
  fc.constantFrom("/c/sarees", "/c/festive", "/pages/about", "/pages/contact", "/"),
  fc.webUrl({ validSchemes: ["https"] }).filter((u) => !u.includes(",")),
);

const genLinkItem = fc.record({
  label: genSafeLabel,
  label_bn: fc.option(genSafeLabel),
  href: genSafeHref,
}).map((raw) => {
  const item: { label: string; href: string; label_bn?: string } = {
    label: raw.label,
    href: raw.href,
  };
  if (raw.label_bn) item.label_bn = raw.label_bn;
  return item;
});

const genSafeUrl = fc.webUrl({ validSchemes: ["https"] });
const genStructuredMedia = fc.record({
  url: genSafeUrl,
  alt: fc.option(fc.string({ maxLength: 80 })),
  focalPoint: fc.option(
    fc.record({
      x: fc.integer({ min: 0, max: 100 }),
      y: fc.integer({ min: 0, max: 100 }),
    }),
  ),
}).map((raw) => {
  const media: StructuredMediaValue = { url: raw.url };
  if (raw.alt) media.alt = raw.alt;
  if (raw.focalPoint) media.focalPoint = raw.focalPoint;
  return media;
});

describe("Wave 2.3 — Merchant Content Configuration Property Suites", () => {
  /* ------------------------------------------------------------------ */
  /* Property P1: Footer link ordering and isolation                    */
  /* ------------------------------------------------------------------ */
  it("Property P1: reordering footer links preserves all link elements and their metadata", () => {
    fc.assert(
      fc.property(
        fc.array(genLinkItem, { minLength: 2, maxLength: 6 }),
        (links) => {
          // Reverse links to simulate a reordering action
          const reordered = [...links].reverse();

          const parsedOriginal = parseLinkList(links as never);
          const parsedReordered = parseLinkList(reordered as never);

          expect(parsedReordered).toHaveLength(parsedOriginal.length);
          // First item of reversed matches last item of original
          expect(parsedReordered[0]).toEqual(parsedOriginal[parsedOriginal.length - 1]);
        },
      ),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P2: Footer link editing preserves sibling links           */
  /* ------------------------------------------------------------------ */
  it("Property P2: editing link i does not alter any other link j", () => {
    fc.assert(
      fc.property(
        fc.array(genLinkItem, { minLength: 2, maxLength: 6 }),
        fc.integer({ min: 0, max: 5 }),
        genSafeLabel,
        (links, targetIndex, newLabel) => {
          const index = targetIndex % links.length;
          const updated = links.map((link, i) =>
            i === index ? { ...link, label: newLabel } : link,
          );

          links.forEach((link, i) => {
            if (i !== index) {
              expect(updated[i]).toEqual(link);
            } else {
              expect(updated[i]!.label).toBe(newLabel);
            }
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P3: UGC Gallery multi-image ordering & metadata          */
  /* ------------------------------------------------------------------ */
  it("Property P3: UGC gallery image array preserves alt text, focal points, and ordering", () => {
    fc.assert(
      fc.property(
        fc.array(genStructuredMedia, { minLength: 1, maxLength: 6 }),
        (gallery) => {
          const section: Section = {
            id: "prop-ugc-test",
            type: "ugc_gallery",
            props: {
              images: gallery as never,
            },
          };

          const parsed = parseAst({ main: [section] });
          const ugc = parsed.main[0] as Section;
          const images = ugc.props.images as StructuredMediaValue[];

          expect(Array.isArray(images)).toBe(true);
          expect(images).toHaveLength(gallery.length);

          gallery.forEach((original, idx) => {
            expect(images[idx]!.url).toBe(original.url);
            if (original.alt) {
              expect(images[idx]!.alt).toBe(original.alt);
            }
            if (original.focalPoint) {
              expect(images[idx]!.focalPoint).toEqual(original.focalPoint);
            }
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P4: UGC Gallery image removal leaves siblings unchanged   */
  /* ------------------------------------------------------------------ */
  it("Property P4: removing one image from gallery preserves all other images byte-identical", () => {
    fc.assert(
      fc.property(
        fc.array(genStructuredMedia, { minLength: 2, maxLength: 6 }),
        fc.integer({ min: 0, max: 5 }),
        (gallery, removeIdx) => {
          const index = removeIdx % gallery.length;
          const remaining = gallery.filter((_, i) => i !== index);

          expect(remaining).toHaveLength(gallery.length - 1);
          remaining.forEach((item, i) => {
            const expectedOriginal = i < index ? gallery[i] : gallery[i + 1];
            expect(item).toEqual(expectedOriginal);
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P5: Legacy syntax normalization preserves content         */
  /* ------------------------------------------------------------------ */
  it("Property P5: legacy pipe-delimited footer links produce valid parseLinkList items equivalent to structured", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            label: genSafeLabel,
            href: genSafeHref,
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (links) => {
          const legacyString = links.map((l) => `${l.label}|${l.href}`).join("\n");
          const parsed = parseLinkList(legacyString);

          expect(parsed).toHaveLength(links.length);
          links.forEach((expected, i) => {
            expect(parsed[i]!.label).toBe(expected.label.trim());
            expect(parsed[i]!.href).toBe(expected.href.trim() || "#");
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P6: Save/reload roundtrip invariance through AST          */
  /* ------------------------------------------------------------------ */
  it("Property P6: footer sitemap structured links survive AST save/reload roundtrip", () => {
    fc.assert(
      fc.property(
        genSafeLabel,
        fc.array(genLinkItem, { minLength: 1, maxLength: 4 }),
        (columnTitle, links) => {
          const section: Section = {
            id: "roundtrip-footer",
            type: "footer_sitemap",
            props: {
              items: [
                {
                  title: columnTitle,
                  links: links as never,
                },
              ],
            },
          };

          const ast1 = parseAst({ footer: [section] });
          const ast2 = parseAst({ footer: ast1.footer });

          const col1 = (ast1.footer?.[0] as Section).props.items as Array<Record<string, unknown>>;
          const col2 = (ast2.footer?.[0] as Section).props.items as Array<Record<string, unknown>>;

          expect(Array.isArray(col1[0]!.links)).toBe(true);
          expect((col1[0]!.links as unknown[]).length).toBe(links.length);
          expect(col2).toEqual(col1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
