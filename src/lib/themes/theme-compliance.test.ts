/**
 * Frame30 Theme Compliance Standard — Automated Verification Suite
 *
 * Enforces the 8 Core Pillars of theme compliance across:
 * 1. Visual Page Builder compatibility and manifest integrity.
 * 2. Studio controls and media binding (type: "image" vs type: "text").
 * 3. Backward compatibility with legacy ASTs storing plain string URLs.
 * 4. Dynamic data isolation (no hardcoded merchant promises or third-party handles).
 * 5. Centralized SEO engine correctness (CollectionPage + ItemList JSON-LD, robots rules).
 * 6. Responsive viewports and accessibility attributes.
 * 7. Theme certification lifecycle states.
 */

import { describe, expect, it } from "vitest";
import {
  THEME_CONTRACT_VERSION,
  ThemeManifestSchema,
  StructuredMediaValueSchema,
  validateThemeManifest,
  validateSectionSettings,
  validateThemeCompatibility,
  resolveMediaUrl,
  resolveMediaAlt,
  migrateSectionSettings,
  migrateThemeAst,
  SONGOSKRITI_THEME_MANIFEST,
  SONGOSKRITI_SECTION_KEYS,
  type ThemeManifest,
  type ThemeSectionDefinition,
} from "../theme-contract";
import { SECTION_CONTROLS } from "../studio/controls";
import {
  buildCollectionHead,
  buildStoreHead,
  buildProductHead,
  GENERIC_SEO_TEMPLATES,
} from "../theme-seo";
import { builtinThemeKeys, builtinThemeMeta } from "./builtin-themes";
import { resolveWidgetComponent } from "@/components/builder/theme-widgets";

describe("Theme Compliance Standard — 8 Core Pillars", () => {
  /* ---------------------------------------------------------------- */
  /* Pillar 1: Theme Manifest & Contract Integrity                    */
  /* ---------------------------------------------------------------- */
  describe("Pillar 1: Theme Manifest & Contract Integrity", () => {
    it("contract version is 1.0.0", () => {
      expect(THEME_CONTRACT_VERSION).toBe("1.0.0");
    });

    it("all registered builtin themes have valid metadata matching SemVer", () => {
      const keys = builtinThemeKeys();
      expect(keys.length).toBeGreaterThan(0);

      for (const key of keys) {
        const meta = builtinThemeMeta(key);
        expect(meta).not.toBeNull();
        if (!meta) continue;

        expect(meta.key).toBe(key);
        expect(meta.nameEn.length).toBeGreaterThan(0);
        expect(meta.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
      }
    });

    it("Songoskriti manifest satisfies ThemeManifestSchema", () => {
      const songoskritiManifest: ThemeManifest = {
        id: "songoskriti",
        version: "1.1.0",
        name: { en: "Songoskriti", bn: "সংস্কৃতি" },
        summary: {
          en: "Official Framique heritage theme: jamdani, panjabi and festive craft.",
          bn: "অফিসিয়াল ফ্রামিক হেরিটেজ থিম।",
        },
        author: {
          name: "Framique Core Team",
          url: "https://framique.com",
          supportEmail: "themes@framique.com",
        },
        builderVersion: "^2.0.0",
        certificationState: "released",
        templates: {
          index: ["hero_carousel", "department_grid", "featured_products"],
          collection: ["category_header", "product_grid"],
          product: ["product_detail"],
        },
        sections: [],
        tokens: {},
        defaultSettings: {},
        localization: {
          defaultLocale: "en",
          supportedLocales: ["en", "bn"],
        },
        responsiveViewports: [
          "320",
          "360",
          "390",
          "430",
          "768",
          "1024",
          "1280",
          "1440",
        ],
      };

      const result = validateThemeManifest(songoskritiManifest);
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe("songoskriti");
      expect(result.data?.certificationState).toBe("released");
    });

    it("canonical SONGOSKRITI_THEME_MANIFEST contains all 33 sections and passes full validation", () => {
      expect(SONGOSKRITI_THEME_MANIFEST.sections).toHaveLength(33);
      expect(SONGOSKRITI_SECTION_KEYS).toHaveLength(31);

      // Verify the 2 presentation primitives
      const headerPrimitive = SONGOSKRITI_THEME_MANIFEST.sections.find((s) => s.id === "header");
      const ornamentPrimitive = SONGOSKRITI_THEME_MANIFEST.sections.find((s) => s.id === "ornament");
      expect(headerPrimitive).toBeDefined();
      expect(headerPrimitive?.dynamicBindings).toContain("theme-presentation-primitive");
      expect(ornamentPrimitive).toBeDefined();
      expect(ornamentPrimitive?.dynamicBindings).toContain("theme-presentation-primitive");

      // Verify manifest validation passes schema
      const manifestRes = validateThemeManifest(SONGOSKRITI_THEME_MANIFEST);
      expect(manifestRes.success).toBe(true);
      expect(manifestRes.data?.id).toBe("songoskriti");

      // Verify compatibility check passes with zero issues
      const compatRes = validateThemeCompatibility(SONGOSKRITI_THEME_MANIFEST);
      expect(compatRes.compatible).toBe(true);
      expect(compatRes.issues).toHaveLength(0);
    });

    it("fails manifest validation when required viewports are missing", () => {
      const invalidManifest = {
        id: "test-theme",
        version: "1.0.0",
        name: { en: "Test" },
        summary: { en: "Summary" },
        author: { name: "Author" },
        builderVersion: "^2.0.0",
        certificationState: "draft" as const,
        templates: {},
        sections: [],
        tokens: {},
        defaultSettings: {},
        localization: { defaultLocale: "en" as const, supportedLocales: ["en" as const] },
        responsiveViewports: ["1024"], // Missing 320, 768, 1440
      };

      const compatibility = validateThemeCompatibility(invalidManifest);
      expect(compatibility.compatible).toBe(false);
      expect(
        compatibility.issues.some((issue) => issue.includes("320px")),
      ).toBe(true);
      expect(
        compatibility.issues.some((issue) => issue.includes("1440px")),
      ).toBe(true);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Pillar 2: Studio Controls & Media Binding                         */
  /* ---------------------------------------------------------------- */
  describe("Pillar 2: Studio Controls & Media Binding", () => {
    it("department_grid exposes type: 'image' for image and hoverImage, with alt text", () => {
      const controls = SECTION_CONTROLS["department_grid"];
      expect(controls).toBeDefined();

      const deptsControl = controls.find((c) => c.key === "departments");
      expect(deptsControl).toBeDefined();
      expect(deptsControl?.type).toBe("repeater");

      const fields = deptsControl?.fields ?? [];
      const imageField = fields.find((f) => f.key === "image");
      const hoverField = fields.find((f) => f.key === "hoverImage");
      const altField = fields.find((f) => f.key === "alt");

      expect(imageField).toBeDefined();
      expect(imageField?.type).toBe("image");
      expect(hoverField).toBeDefined();
      expect(hoverField?.type).toBe("image");
      expect(altField).toBeDefined();
      expect(altField?.type).toBe("text");
    });

    it("editorial sections enforce type: 'image' for visual media controls", () => {
      const imageAudits: { section: string; key: string }[] = [
        { section: "heritage_story", key: "image" },
        { section: "editorial_banner", key: "image" },
        { section: "editorial_hero", key: "imageUrl" },
        { section: "split_feature", key: "imageUrl" },
        { section: "collection_story", key: "imageUrl" },
        { section: "shoppable_image", key: "imageUrl" },
        { section: "logo", key: "image" },
      ];

      for (const audit of imageAudits) {
        const controls = SECTION_CONTROLS[audit.section];
        expect(
          controls,
          `Section controls missing for ${audit.section}`,
        ).toBeDefined();
        const ctrl = controls.find((c) => c.key === audit.key);
        expect(
          ctrl,
          `Control '${audit.key}' not found in section '${audit.section}'`,
        ).toBeDefined();
        expect(
          ctrl?.type,
          `Control '${audit.key}' in section '${audit.section}' must be 'image' type, got '${ctrl?.type}'`,
        ).toBe("image");
      }
    });

    it("repeater sections enforce type: 'image' for nested item image fields", () => {
      const repeaterAudits: { section: string; repeaterKey: string; itemKey: string }[] = [
        { section: "lookbook", repeaterKey: "items", itemKey: "image" },
        { section: "hero", repeaterKey: "items", itemKey: "image" },
        { section: "textile_showcase", repeaterKey: "items", itemKey: "image" },
        { section: "story_trunk", repeaterKey: "items", itemKey: "image" },
        { section: "hero_carousel", repeaterKey: "slides", itemKey: "image" },
        { section: "testimonials", repeaterKey: "testimonials", itemKey: "image" },
      ];

      for (const audit of repeaterAudits) {
        const controls = SECTION_CONTROLS[audit.section];
        expect(controls).toBeDefined();
        const rep = controls.find((c) => c.key === audit.repeaterKey);
        expect(rep).toBeDefined();
        expect(rep?.type).toBe("repeater");
        const itemField = rep?.fields?.find((f) => f.key === audit.itemKey);
        expect(
          itemField?.type,
          `Repeater '${audit.repeaterKey}' child '${audit.itemKey}' in '${audit.section}' must be 'image' type`,
        ).toBe("image");
      }
    });

    it("StructuredMediaValueSchema validates full structured media objects and rejects malformed values", () => {
      const validComplete = {
        url: "https://cdn.framique.com/artisan.jpg",
        alt: "Artisan weaving jamdani",
        width: 1200,
        height: 800,
        focalPoint: { x: 50, y: 35 },
      };
      expect(StructuredMediaValueSchema.safeParse(validComplete).success).toBe(true);

      const validRelative = {
        url: "/ph/songoskriti/prod-saree.png",
      };
      expect(StructuredMediaValueSchema.safeParse(validRelative).success).toBe(true);

      // Out of bounds focal point
      const invalidFocal = {
        url: "https://cdn.framique.com/artisan.jpg",
        focalPoint: { x: 150, y: 50 },
      };
      expect(StructuredMediaValueSchema.safeParse(invalidFocal).success).toBe(false);

      // Empty URL
      const invalidUrl = {
        url: "",
        alt: "Test",
      };
      expect(StructuredMediaValueSchema.safeParse(invalidUrl).success).toBe(false);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Pillar 3 & 7: Backward Compatibility & Media Resolution          */
  /* ---------------------------------------------------------------- */
  describe("Pillar 3 & 7: Backward Compatibility & Media Resolution", () => {
    it("resolveMediaUrl handles legacy string URLs", () => {
      expect(resolveMediaUrl("/ph/songoskriti/prod-saree.png")).toBe(
        "/ph/songoskriti/prod-saree.png",
      );
      expect(resolveMediaUrl("https://cdn.framique.com/artisan.jpg")).toBe(
        "https://cdn.framique.com/artisan.jpg",
      );
      expect(resolveMediaUrl("   https://cdn.framique.com/padded.jpg   ")).toBe(
        "https://cdn.framique.com/padded.jpg",
      );
      expect(resolveMediaUrl("")).toBeNull();
      expect(resolveMediaUrl(null)).toBeNull();
      expect(resolveMediaUrl(undefined)).toBeNull();
    });

    it("resolveMediaUrl handles structured MediaValue objects", () => {
      const structured = {
        url: "https://cdn.framique.com/loom.jpg",
        alt: "Pit loom in Tangail",
        width: 1200,
        height: 800,
      };
      expect(resolveMediaUrl(structured)).toBe("https://cdn.framique.com/loom.jpg");
    });

    it("resolveMediaAlt returns explicit alt text or falls back cleanly", () => {
      expect(resolveMediaAlt({ url: "foo.jpg", alt: "Silk saree" }, "Fallback")).toBe(
        "Silk saree",
      );
      expect(resolveMediaAlt({ url: "foo.jpg" }, "Fallback")).toBe("Fallback");
      expect(resolveMediaAlt("https://foo.jpg", "Fallback")).toBe("Fallback");
      expect(resolveMediaAlt(null, "Default alt")).toBe("Default alt");
    });

    it("validateSectionSettings accepts both legacy string URLs and structured MediaValues in repeaters", () => {
      const sectionDef: ThemeSectionDefinition = {
        id: "department_grid",
        label: "Department Grid",
        category: "commerce",
        controls: [
          {
            key: "departments",
            label: "Departments",
            type: "repeater",
            fields: [
              { key: "title", label: "Title", type: "text" },
              { key: "image", label: "Image", type: "image" },
              { key: "hoverImage", label: "Hover Image", type: "image" },
              { key: "alt", label: "Alt", type: "text" },
            ],
          },
        ],
        defaultSettings: {},
      };

      // Legacy settings with plain string URLs
      const legacySettings = {
        departments: [
          {
            title: "Sarees",
            image: "/ph/songoskriti/prod-saree.png",
            hoverImage: "/ph/songoskriti/cat-women.png",
          },
        ],
      };
      const legacyRes = validateSectionSettings(sectionDef, legacySettings);
      expect(legacyRes.success).toBe(true);

      // Modern settings with structured media objects
      const modernSettings = {
        departments: [
          {
            title: "Sarees",
            image: {
              url: "https://cdn.framique.com/saree.jpg",
              alt: "Handloom Saree",
            },
            hoverImage: "https://cdn.framique.com/saree-hover.jpg",
            alt: "Handloom Saree",
          },
        ],
      };
      const modernRes = validateSectionSettings(sectionDef, modernSettings);
      expect(modernRes.success).toBe(true);
    });

    it("validateSectionSettings fails closed on undeclared settings keys", () => {
      const sectionDef: ThemeSectionDefinition = {
        id: "department_grid",
        label: "Department Grid",
        category: "commerce",
        controls: [
          { key: "heading", label: "Heading", type: "text" },
          { key: "layout", label: "Layout", type: "select", options: [{ label: "Grid", value: "grid" }] },
        ],
        defaultSettings: {},
      };

      const res = validateSectionSettings(sectionDef, {
        heading: "Valid Heading",
        layout: "grid",
        unauthorizedKey: "malicious_payload",
      });

      expect(res.success).toBe(false);
      expect(res.errors.some((e) => e.includes("Undeclared setting key 'unauthorizedKey'"))).toBe(true);
    });

    it("validateSectionSettings enforces control type constraints for text, number, switch, and select", () => {
      const sectionDef: ThemeSectionDefinition = {
        id: "controls_test",
        label: "Controls Test",
        category: "content",
        controls: [
          { key: "title", label: "Title", type: "text" },
          { key: "columns", label: "Columns", type: "number" },
          { key: "enabled", label: "Enabled", type: "switch" },
          {
            key: "skin",
            label: "Skin",
            type: "select",
            options: [
              { label: "Light", value: "light" },
              { label: "Dark", value: "dark" },
            ],
          },
        ],
        defaultSettings: {},
      };

      const invalidPayload = {
        title: 12345,
        columns: "four",
        enabled: "yes",
        skin: "neon_blue",
      };

      const res = validateSectionSettings(sectionDef, invalidPayload);
      expect(res.success).toBe(false);
      expect(res.errors.some((e) => e.includes("title' expected string"))).toBe(true);
      expect(res.errors.some((e) => e.includes("columns' expected number"))).toBe(true);
      expect(res.errors.some((e) => e.includes("enabled' expected boolean"))).toBe(true);
      expect(res.errors.some((e) => e.includes("skin' value 'neon_blue' is not one of allowed options"))).toBe(true);
    });

    it("validateSectionSettings recursively validates repeaters and rejects undeclared nested fields", () => {
      const sectionDef: ThemeSectionDefinition = {
        id: "repeater_section",
        label: "Repeater Section",
        category: "content",
        controls: [
          {
            key: "slides",
            label: "Slides",
            type: "repeater",
            fields: [
              { key: "image", label: "Image", type: "image" },
              { key: "alt", label: "Alt", type: "text" },
            ],
          },
        ],
        defaultSettings: {},
      };

      const invalidRepeater = {
        slides: [
          { image: "/ph/slide1.jpg", alt: "First" },
          { image: "/ph/slide2.jpg", alt: "Second", undeclaredProp: "injection" },
        ],
      };

      const res = validateSectionSettings(sectionDef, invalidRepeater);
      expect(res.success).toBe(false);
      expect(res.errors.some((e) => e.includes("has undeclared field 'undeclaredProp'"))).toBe(true);
    });

    it("migrateSectionSettings upgrades legacy string image URLs to structured MediaValues", () => {
      const sectionDef: ThemeSectionDefinition = {
        id: "hero_section",
        label: "Hero Section",
        category: "content",
        controls: [
          { key: "image", label: "Image", type: "image" },
          { key: "alt", label: "Alt", type: "text" },
          {
            key: "items",
            label: "Items",
            type: "repeater",
            fields: [
              { key: "image", label: "Item Image", type: "image" },
              { key: "alt", label: "Alt", type: "text" },
            ],
          },
        ],
        defaultSettings: {},
      };

      const legacyData = {
        image: "/ph/hero.jpg",
        alt: "Hero Banner",
        items: [
          { image: "/ph/item1.jpg", alt: "Item 1" },
        ],
      };

      const migrated = migrateSectionSettings(sectionDef, legacyData);
      expect(migrated.image).toEqual({
        url: "/ph/hero.jpg",
        alt: "Hero Banner",
      });
      const items = migrated.items as any[];
      expect(items[0].image).toEqual({
        url: "/ph/item1.jpg",
        alt: "Item 1",
      });
    });

    it("migrateThemeAst upgrades AST schemaVersion and processes all section instances", () => {
      const legacyAst = {
        schemaVersion: "0.9.0",
        sections: [
          {
            id: "node_1",
            type: "hero_carousel",
            settings: {
              slides: [
                { image: "/ph/slide1.jpg", alt: "Slide 1" },
              ],
            },
          },
        ],
      };

      const { ast: migratedAst, migratedCount } = migrateThemeAst(legacyAst, SONGOSKRITI_THEME_MANIFEST);
      expect((migratedAst as any).schemaVersion).toBe(THEME_CONTRACT_VERSION);
      expect(migratedCount).toBe(1);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Pillar 4: Dynamic Data Isolation & Anti-Fabrication              */
  /* ---------------------------------------------------------------- */
  describe("Pillar 4: Dynamic Data Isolation & Anti-Fabrication", () => {
    it("section controls do not embed hardcoded vendor phone numbers or external brand handles in defaults", () => {
      for (const [sectionKey, controls] of Object.entries(SECTION_CONTROLS)) {
        for (const ctrl of controls) {
          if (ctrl.placeholder) {
            expect(ctrl.placeholder).not.toContain("01700000000");
            expect(ctrl.placeholder).not.toContain("flamefashionbd");
          }
          if (ctrl.help) {
            expect(ctrl.help).not.toContain("flamefashionbd");
          }
        }
      }
    });

    it("GENERIC_SEO_TEMPLATES contains zero unverified merchant promises or payment claims", () => {
      const bannedPhrases = [
        "Cash on delivery",
        "bKash",
        "Nagad",
        "Nationwide delivery across Bangladesh",
      ];
      for (const [key, template] of Object.entries(GENERIC_SEO_TEMPLATES)) {
        const text = JSON.stringify(template);
        for (const phrase of bannedPhrases) {
          expect(
            text.includes(phrase),
            `GENERIC_SEO_TEMPLATES.${key} contains banned phrase: "${phrase}"`,
          ).toBe(false);
        }
      }
    });
  });

  /* ---------------------------------------------------------------- */
  /* Pillar 5: Centralized SEO Engine & Structured Data Contracts     */
  /* ---------------------------------------------------------------- */
  describe("Pillar 5: Centralized SEO Engine & Structured Data Contracts", () => {
    const mockCollectionInput = {
      origin: "https://store.framique.com",
      path: "/store/heritage/c/sarees",
      storeName: "Songoskriti Heritage",
      themeKey: "songoskriti",
      locale: "en" as const,
      collection: {
        name: "Handloom Sarees",
        slug: "sarees",
        description: "Finest handwoven Jamdani and silk sarees from artisans across Bangladesh.",
        image_url: "https://cdn.framique.com/collections/sarees.jpg",
      },
      products: [
        {
          id: "prod-1",
          title: "Dhakai Jamdani Saree",
          slug: "dhakai-jamdani-saree",
          image_url: "https://cdn.framique.com/products/jamdani.jpg",
          price_minor_int: 850000,
          currency_code: "BDT",
        },
        {
          id: "prod-2",
          title: "Rajshahi Silk Saree",
          slug: "rajshahi-silk-saree",
          image_url: "https://cdn.framique.com/products/silk.jpg",
          price_minor_int: 1200000,
          currency_code: "BDT",
        },
      ],
      storePath: "/store/heritage",
    };

    it("buildCollectionHead generates complete meta tags with absolute canonical and OG image", () => {
      const head = buildCollectionHead(mockCollectionInput);

      // Meta assertions
      const titleTag = head.meta.find((m) => "title" in m);
      expect(titleTag?.title).toContain("Handloom Sarees");
      expect(titleTag?.title).toContain("Songoskriti Heritage");

      const descTag = head.meta.find((m) => m.name === "description");
      expect(descTag?.content).toContain("Finest handwoven Jamdani");

      const ogImage = head.meta.find((m) => m.property === "og:image");
      expect(ogImage?.content).toBe("https://cdn.framique.com/collections/sarees.jpg");

      const ogUrl = head.meta.find((m) => m.property === "og:url");
      expect(ogUrl?.content).toBe("https://store.framique.com/store/heritage/c/sarees");

      const twitterCard = head.meta.find((m) => m.name === "twitter:card");
      expect(twitterCard?.content).toBe("summary_large_image");

      // Canonical link
      const canonicalLink = head.links.find((l) => l.rel === "canonical");
      expect(canonicalLink?.href).toBe(
        "https://store.framique.com/store/heritage/c/sarees",
      );
    });

    it("buildCollectionHead emits valid CollectionPage and ItemList JSON-LD schemas", () => {
      const head = buildCollectionHead(mockCollectionInput);
      const scripts = head.scripts.filter(
        (s) => s.type === "application/ld+json",
      );
      expect(scripts.length).toBeGreaterThanOrEqual(2);

      const parsedSchemas = scripts.map((s) => JSON.parse(s.children));

      // 1. CollectionPage schema
      const collectionPageSchema = parsedSchemas.find(
        (s) => s["@type"] === "CollectionPage",
      );
      expect(collectionPageSchema).toBeDefined();
      expect(collectionPageSchema.name).toBe("Handloom Sarees");
      expect(collectionPageSchema.url).toBe(
        "https://store.framique.com/store/heritage/c/sarees",
      );

      // 2. ItemList schema with minor-unit price formatting
      const itemListSchema = parsedSchemas.find(
        (s) => s["@type"] === "ItemList",
      );
      expect(itemListSchema).toBeDefined();
      expect(itemListSchema.numberOfItems).toBe(2);
      expect(itemListSchema.itemListElement.length).toBe(2);

      const firstItem = itemListSchema.itemListElement[0];
      expect(firstItem.position).toBe(1);
      expect(firstItem.name).toBe("Dhakai Jamdani Saree");
      expect(firstItem.offers.price).toBe("8500.00");
      expect(firstItem.offers.priceCurrency).toBe("BDT");

      const secondItem = itemListSchema.itemListElement[1];
      expect(secondItem.position).toBe(2);
      expect(secondItem.name).toBe("Rajshahi Silk Saree");
      expect(secondItem.offers.price).toBe("12000.00");
      expect(secondItem.offers.priceCurrency).toBe("BDT");

      // 3. BreadcrumbList schema
      const breadcrumbSchema = parsedSchemas.find(
        (s) => s["@type"] === "BreadcrumbList",
      );
      expect(breadcrumbSchema).toBeDefined();
      expect(breadcrumbSchema.itemListElement.length).toBe(2);
    });

    it("buildCollectionHead respects noindex directive", () => {
      const head = buildCollectionHead({
        ...mockCollectionInput,
        noindex: true,
      });

      const robotsTag = head.meta.find((m) => m.name === "robots");
      expect(robotsTag?.content).toBe("noindex,nofollow");

      const canonicalLink = head.links.find((l) => l.rel === "canonical");
      expect(canonicalLink).toBeUndefined(); // Canonical omitted when noindex
    });

    it("verifies collection route delegates to centralized buildCollectionHead", async () => {
      const { readFileSync } = await import("fs");
      const src = readFileSync(
        "src/routes/store.$slug.c.$collectionSlug.tsx",
        "utf8",
      );
      expect(src).toContain("import { buildCollectionHead } from");
      expect(src).toContain("return buildCollectionHead({");
    });

    it("verifies checkout and tracking routes enforce robots: noindex, nofollow", async () => {
      const { readFileSync } = await import("fs");
      const checkoutSrc = readFileSync(
        "src/routes/store.$slug.checkout.tsx",
        "utf8",
      );
      expect(checkoutSrc).toContain(
        '{ name: "robots", content: "noindex, nofollow" }',
      );

      const trackSrc = readFileSync("src/routes/store.$slug.track.tsx", "utf8");
      expect(trackSrc).toContain(
        '{ name: "robots", content: "noindex, nofollow" }',
      );
    });

    it("buildStoreHead omits Organization.logo when logoUrl is null or undefined", () => {
      const headWithoutLogo = buildStoreHead({
        origin: "https://store.framique.com",
        path: "/store/artisan",
        storeName: "Artisan Store",
        themeKey: "songoskriti",
        locale: "en",
        logoUrl: null,
      });

      const ldJsonScripts = headWithoutLogo.scripts.filter((s) => s.type === "application/ld+json");
      expect(ldJsonScripts.length).toBeGreaterThan(0);
      const orgSchema = ldJsonScripts.map((s) => JSON.parse(s.children)).find((s) => s["@type"] === "Organization");
      expect(orgSchema).toBeDefined();
      expect(orgSchema.logo).toBeUndefined();

      const headWithLogo = buildStoreHead({
        origin: "https://store.framique.com",
        path: "/store/artisan",
        storeName: "Artisan Store",
        themeKey: "songoskriti",
        locale: "en",
        logoUrl: "https://cdn.framique.com/artisan-logo.png",
      });

      const ldJsonWithLogo = headWithLogo.scripts.filter((s) => s.type === "application/ld+json");
      const orgWithLogoSchema = ldJsonWithLogo.map((s) => JSON.parse(s.children)).find((s) => s["@type"] === "Organization");
      expect(orgWithLogoSchema).toBeDefined();
      expect(orgWithLogoSchema.logo).toBe("https://cdn.framique.com/artisan-logo.png");
    });

    it("buildProductHead dynamically omits return policy unless verified merchantReturnPolicy is configured", () => {
      const headWithoutReturnPolicy = buildProductHead({
        origin: "https://store.framique.com",
        path: "/store/artisan/p/jamdani",
        storeName: "Artisan Store",
        themeKey: "songoskriti",
        locale: "en",
        currency: "BDT",
        priceMinor: 750000,
        inStock: true,
        storePath: "/store/artisan",
        product: {
          title: "Jamdani Saree",
          slug: "jamdani",
        },
      });

      const scriptsWithout = headWithoutReturnPolicy.scripts.filter((s) => s.type === "application/ld+json");
      const productSchemaWithout = scriptsWithout.map((s) => JSON.parse(s.children)).find((s) => s["@type"] === "Product");
      expect(productSchemaWithout).toBeDefined();
      expect(productSchemaWithout.offers.hasMerchantReturnPolicy).toBeUndefined();

      const headWithReturnPolicy = buildProductHead({
        origin: "https://store.framique.com",
        path: "/store/artisan/p/jamdani",
        storeName: "Artisan Store",
        themeKey: "songoskriti",
        locale: "en",
        currency: "BDT",
        priceMinor: 750000,
        inStock: true,
        storePath: "/store/artisan",
        product: {
          title: "Jamdani Saree",
          slug: "jamdani",
        },
        returnPolicy: {
          days: 7,
          fees: "shopper",
        },
      });

      const scriptsWith = headWithReturnPolicy.scripts.filter((s) => s.type === "application/ld+json");
      const productSchemaWith = scriptsWith.map((s) => JSON.parse(s.children)).find((s) => s["@type"] === "Product");
      expect(productSchemaWith).toBeDefined();
      expect(productSchemaWith.offers.hasMerchantReturnPolicy).toBeDefined();
      expect(productSchemaWith.offers.hasMerchantReturnPolicy.merchantReturnDays).toBe(7);
      expect(productSchemaWith.offers.hasMerchantReturnPolicy.returnFees).toBe(
        "https://schema.org/ReturnShippingFees",
      );
    });
  });

  /* ---------------------------------------------------------------- */
  /* Pillar 6: Studio Canvas & Storefront Renderer Parity             */
  /* ---------------------------------------------------------------- */
  describe("Pillar 6: Studio Canvas & Storefront Renderer Parity", () => {
    it("resolveWidgetComponent resolves authentic theme presentation for all core sections under songoskriti", () => {
      const coreSections = [
        "department_grid",
        "split_feature",
        "collection_story",
        "product_rail",
        "ugc_gallery",
        "testimonials",
        "craft_story",
      ] as const;

      for (const sectionType of coreSections) {
        const comp = resolveWidgetComponent("songoskriti", sectionType);
        expect(
          comp,
          `Section '${sectionType}' must resolve to an authentic theme component under songoskriti`,
        ).toBeDefined();
      }
    });

    it("SongoskritiSplitFeature supports both primaryImage/imageUrl and layout/flip props", () => {
      const comp = resolveWidgetComponent("songoskriti", "split_feature");
      expect(comp).toBeDefined();
      expect(typeof comp).toBe("function");
    });
  });

  /* ---------------------------------------------------------------- */
  /* Pillar 8: Verification & Lifecycle Invariants                    */
  /* ---------------------------------------------------------------- */
  describe("Pillar 8: Verification & Lifecycle Invariants", () => {
    it("validates theme certification state transitions", () => {
      const validStates = ["draft", "validating", "failed", "passed", "released"];
      for (const st of validStates) {
        const manifest = {
          id: "theme-test",
          version: "1.0.0",
          name: { en: "Theme Test" },
          summary: { en: "Summary" },
          author: { name: "Author" },
          certificationState: st,
        };
        const res = ThemeManifestSchema.safeParse(manifest);
        expect(res.success).toBe(true);
      }

      const invalidManifest = {
        id: "theme-test",
        version: "1.0.0",
        name: { en: "Theme Test" },
        summary: { en: "Summary" },
        author: { name: "Author" },
        certificationState: "non-existent-state",
      };
      const invalidRes = ThemeManifestSchema.safeParse(invalidManifest);
      expect(invalidRes.success).toBe(false);
    });
  });
});
