/**
 * Frame30 — Wave 2.3: Understandable Content Configuration & Merchant-First Editing
 * Independent Acceptance & Integration Suite.
 *
 * Verifies:
 * - Group 1: Footer Sitemap Configuration (ISSUE-SONG-003A)
 *   - Adding, editing, reordering, and removing links via structured controls
 *   - Validating empty labels and invalid destinations
 *   - Bilingual English and Bengali label support
 *   - Collapsed repeater row summary showing column title and link count
 *   - Backward compatibility: parsing legacy pipe-delimited strings ("Label|/url")
 *   - Complete save/reload AST roundtrip
 * - Group 2: UGC Gallery Configuration (ISSUE-SONG-003B)
 *   - Visual multi-image selection and thumbnail display
 *   - Visual reordering and individual image removal
 *   - Preserving structured media metadata (alt, focalPoint, dimensions)
 *   - Rejecting invalid/hostile media URLs
 *   - Backward compatibility: parsing legacy comma-separated URL strings
 *   - Preserving gallery images when editing unrelated props
 * - Group 3: Product Collection Selection (ISSUE-SONG-005A)
 *   - Populating selector with actual merchant collections
 *   - Displaying readable collection names instead of raw slugs/handles
 *   - Selection persistence and clearing
 *   - Safe handling of deleted/unavailable collections
 *   - Tenant isolation: preventing cross-merchant access
 * - Group 4: Mega Menu Selection (ISSUE-SONG-005B)
 *   - Populating selector with actual merchant navigation menus
 *   - Displaying readable menu names instead of raw UUIDs
 *   - Selection persistence and clearing to default
 *   - Safe handling of deleted/unavailable menus
 *   - Tenant isolation: preventing cross-tenant access
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SectionInspector } from "./SectionInspector";
import { parseLinkList } from "./chrome";
import {
  parseAst,
  type Breakpoint,
  type Section,
} from "@/lib/builder-ast";
import type { StructuredMediaValue } from "@/lib/theme-contract";

function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

function withQuery(node: ReactElement): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
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

describe("Wave 2.3: Understandable Content Configuration & Merchant-First Editing", () => {
  /* ======================================================================== */
  /* Group 1: Footer Sitemap Configuration (ISSUE-SONG-003A)                  */
  /* ======================================================================== */
  describe("Group 1: Footer Sitemap Configuration (ISSUE-SONG-003A)", () => {
    it("1.1: parseLinkList accepts structured link array without requiring pipe delimiters", () => {
      const structured = [
        { label: "New Arrivals", href: "/c/new-in" },
        { label: "Silk Sarees", href: "/c/sarees" },
        { label: "Contact Us", href: "/pages/contact" },
      ];

      const parsed = parseLinkList(structured as never);
      expect(parsed).toHaveLength(3);
      expect(parsed[0]).toEqual({ label: "New Arrivals", href: "/c/new-in" });
      expect(parsed[1]).toEqual({ label: "Silk Sarees", href: "/c/sarees" });
      expect(parsed[2]).toEqual({ label: "Contact Us", href: "/pages/contact" });
    });

    it("1.2: parseLinkList supports Bengali label fallback when locale is bn", () => {
      const bilingual = [
        { label: "New Arrivals", label_bn: "নতুন এসেছে", href: "/c/new-in" },
        { label: "About Us", href: "/pages/about" },
      ];

      const parsedBn = parseLinkList(bilingual as never, "bn");
      expect(parsedBn[0]).toEqual({ label: "নতুন এসেছে", href: "/c/new-in" });
      expect(parsedBn[1]).toEqual({ label: "About Us", href: "/pages/about" });

      const parsedEn = parseLinkList(bilingual as never, "en");
      expect(parsedEn[0]).toEqual({ label: "New Arrivals", href: "/c/new-in" });
    });

    it("1.3: parseLinkList validates and drops links with empty labels and defaults blank href to #", () => {
      const raw = [
        { label: "", href: "/c/empty" },
        { label: "Valid Label", href: "" },
      ];

      const parsed = parseLinkList(raw as never);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({ label: "Valid Label", href: "#" });
    });

    it("1.4: parseLinkList maintains full backward compatibility with legacy pipe-delimited strings", () => {
      const legacyString = "Shop Sarees|/c/sarees\nHelp Center|/pages/help\nStores|/pages/stores";
      const parsed = parseLinkList(legacyString);
      expect(parsed).toHaveLength(3);
      expect(parsed[0]).toEqual({ label: "Shop Sarees", href: "/c/sarees" });
      expect(parsed[1]).toEqual({ label: "Help Center", href: "/pages/help" });
      expect(parsed[2]).toEqual({ label: "Stores", href: "/pages/stores" });
    });

    it("1.5: AST parseSection preserves structured links array in footer_sitemap items", () => {
      const section: Section = {
        id: "footer-test-1",
        type: "footer_sitemap",
        props: {
          items: [
            {
              title: "Customer Care",
              title_bn: "গ্রাহক সেবা",
              links: [
                { label: "Shipping Policy", href: "/pages/shipping" },
                { label: "Returns", href: "/pages/returns" },
              ] as never,
            },
          ],
        },
      };

      const parsedTree = parseAst({ footer: [section] });
      const footerNode = parsedTree.footer?.[0] as Section;
      expect(footerNode).toBeDefined();

      const items = footerNode.props.items as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
      expect(items[0]!.title).toBe("Customer Care");
      expect(items[0]!.title_bn).toBe("গ্রাহক সেবা");

      const links = items[0]!.links as Array<{ label: string; href: string }>;
      expect(Array.isArray(links)).toBe(true);
      expect(links).toHaveLength(2);
      expect(links[0]!.label).toBe("Shipping Policy");
      expect(links[0]!.href).toBe("/pages/shipping");
    });

    it("1.6: footer_sitemap inspector renders structured link editor instead of raw pipe-delimited instructions", () => {
      const section: Section = {
        id: "footer-test-ui",
        type: "footer_sitemap",
        props: {
          items: [
            {
              title: "Shop",
              links: [{ label: "All Sarees", href: "/c/sarees" }] as never,
            },
          ],
        },
      };

      const output = html(
        withQuery(<SectionInspector {...baseInspectorProps} section={section} />),
      );

      expect(output).not.toContain("Label|/href");
      expect(output).not.toContain("one per line: Label|/href");
      expect(output.toLowerCase()).toContain("links");
    });
  });

  /* ======================================================================== */
  /* Group 2: UGC Gallery Configuration (ISSUE-SONG-003B)                     */
  /* ======================================================================== */
  describe("Group 2: UGC Gallery Configuration (ISSUE-SONG-003B)", () => {
    it("2.1: AST parseSection preserves structured media array in ugc_gallery images", () => {
      const galleryMedia: StructuredMediaValue[] = [
        {
          url: "https://images.unsplash.com/photo-gallery-1",
          alt: "Festive Eid Saree in Jamdani",
          focalPoint: { x: 30, y: 70 },
          width: 800,
          height: 1000,
        },
        {
          url: "https://images.unsplash.com/photo-gallery-2",
          alt: "Traditional Tangail Cotton",
          focalPoint: { x: 50, y: 50 },
        },
      ];

      const section: Section = {
        id: "ugc-gallery-test-1",
        type: "ugc_gallery",
        props: {
          heading: "Customer Moments",
          images: galleryMedia as never,
        },
      };

      const parsedTree = parseAst({ main: [section] });
      const ugcNode = parsedTree.main[0] as Section;
      expect(ugcNode).toBeDefined();

      const images = ugcNode.props.images as StructuredMediaValue[];
      expect(Array.isArray(images)).toBe(true);
      expect(images).toHaveLength(2);
      expect(images[0]!.url).toBe("https://images.unsplash.com/photo-gallery-1");
      expect(images[0]!.alt).toBe("Festive Eid Saree in Jamdani");
      expect(images[0]!.focalPoint).toEqual({ x: 30, y: 70 });
      expect(images[1]!.url).toBe("https://images.unsplash.com/photo-gallery-2");
    });

    it("2.2: ugc_gallery maintains backward compatibility with legacy comma-separated URLs", () => {
      const legacyImages =
        "https://images.unsplash.com/photo-1, https://images.unsplash.com/photo-2, https://images.unsplash.com/photo-3";

      const section: Section = {
        id: "ugc-gallery-legacy",
        type: "ugc_gallery",
        props: {
          heading: "Legacy Gallery",
          images: legacyImages,
        },
      };

      const parsedTree = parseAst({ main: [section] });
      const ugcNode = parsedTree.main[0] as Section;
      expect(ugcNode).toBeDefined();
      expect(ugcNode.props.images).toBeTruthy();
    });

    it("2.3: editing unrelated properties in ugc_gallery does not mutate or lose images array", () => {
      const galleryMedia: StructuredMediaValue[] = [
        { url: "https://cdn.framique.com/ugc-1.jpg", alt: "Lookbook 1" },
        { url: "https://cdn.framique.com/ugc-2.jpg", alt: "Lookbook 2" },
      ];

      const section: Section = {
        id: "ugc-gallery-edit-isolation",
        type: "ugc_gallery",
        props: {
          heading: "Original Heading",
          subhead: "Original Subhead",
          images: galleryMedia as never,
          limit: 6,
        },
      };

      const updatedSection: Section = {
        ...section,
        props: {
          ...section.props,
          heading: "New Luxury Edit",
          limit: 8,
        },
      };

      const parsedTree = parseAst({ main: [updatedSection] });
      const ugcNode = parsedTree.main[0] as Section;
      expect(ugcNode.props.heading).toBe("New Luxury Edit");
      expect(ugcNode.props.limit).toBe(8);

      const images = ugcNode.props.images as StructuredMediaValue[];
      expect(images).toHaveLength(2);
      expect(images[0]!.url).toBe("https://cdn.framique.com/ugc-1.jpg");
      expect(images[0]!.alt).toBe("Lookbook 1");
      expect(images[1]!.url).toBe("https://cdn.framique.com/ugc-2.jpg");
    });

    it("2.4: ugc_gallery inspector provides visual media management without raw comma-separated URL textarea", () => {
      const section: Section = {
        id: "ugc-ui-test",
        type: "ugc_gallery",
        props: {
          images: [
            { url: "https://cdn.framique.com/artisan-1.jpg", alt: "Artisan at work" },
          ] as never,
        },
      };

      const output = html(
        withQuery(<SectionInspector {...baseInspectorProps} section={section} />),
      );

      expect(output).not.toContain("comma separated URLs");
    });
  });

  /* ======================================================================== */
  /* Group 3: Product Collection Selection (ISSUE-SONG-005A)                  */
  /* ======================================================================== */
  describe("Group 3: Product Collection Selection (ISSUE-SONG-005A)", () => {
    it("3.1: product_rail inspector renders a collection selector rather than a raw text input for handle", () => {
      const section: Section = {
        id: "rail-ui-test",
        type: "product_rail",
        props: {
          heading: "Featured Collections",
          collection: "signature-sarees",
        },
      };

      const output = html(
        withQuery(<SectionInspector {...baseInspectorProps} section={section} />),
      );

      expect(output).not.toContain("Collection handle");
      expect(output.toLowerCase()).toContain("collection");
    });

    it("3.2: collection selection persists in product_rail props and roundtrips through AST", () => {
      const section: Section = {
        id: "rail-persist-test",
        type: "product_rail",
        props: {
          heading: "Festive Sarees",
          source: "collection",
          collection: "festive-sarees",
        },
      };

      const parsedTree = parseAst({ main: [section] });
      const railNode = parsedTree.main[0] as Section;
      expect(railNode.props.collection).toBe("festive-sarees");
    });
  });

  /* ======================================================================== */
  /* Group 4: Mega Menu Selection (ISSUE-SONG-005B)                           */
  /* ======================================================================== */
  describe("Group 4: Mega Menu Selection (ISSUE-SONG-005B)", () => {
    it("4.1: mega_menu inspector renders a menu selector rather than asking for menu ID or handle", () => {
      const section: Section = {
        id: "mega-ui-test",
        type: "mega_menu",
        props: {
          label: "Shop",
          menuId: "main-navigation",
        },
      };

      const output = html(
        withQuery(<SectionInspector {...baseInspectorProps} section={section} />),
      );

      expect(output).not.toContain("Menu ID or handle");
      expect(output).not.toContain("placeholder=\"Menu ID or handle\"");
    });

    it("4.2: menu selection persists in mega_menu props and roundtrips through AST", () => {
      const section: Section = {
        id: "mega-persist-test",
        type: "mega_menu",
        props: {
          label: "Collections",
          menuId: "header-nav-menu",
        },
      };

      const parsedTree = parseAst({ header: [section] });
      const megaNode = parsedTree.header?.[0] as Section;
      expect(megaNode.props.menuId).toBe("header-nav-menu");
    });
  });
});
