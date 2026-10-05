/**
 * PROOF lane TEST 4 — same footer data → two theme presentations via the
 * registry.
 *
 * `FooterData` is the merchant-owned payload (one object renders under
 * every theme); each theme owns presentation over it, claimed through
 * `registerThemePresentation`. This suite feeds ONE `FooterData` object to
 * both proof presentations and asserts different markup out with identical
 * columns, labels and hrefs in — at the pure-markup level, through direct
 * registry resolution of the registered `footer_sitemap` widgets from ONE
 * shared section, and through the `SectionRenderer` engine lookup path.
 * Neither render mutates the shared data.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import {
  clearThemePresentations,
  registerThemePresentation,
  resolveThemePresentation,
} from "@/lib/theme-presentations";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import {
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "@/components/builder/widgets";
import type { FooterData } from "@/components/store/StoreFooterMenus";
import {
  SongoskritiFooterProof,
  SongoskritiFooterProofPresentation,
} from "./songoskriti/footer-proof-presentation";
import {
  SomvabonaFooterProof,
  SomvabonaFooterProofPresentation,
} from "./somvabona/footer-proof-presentation";

const LABEL = "Footer menu";

function proofFooterData(): FooterData {
  return {
    columns: [
      {
        id: "shop",
        label: "Shop",
        href: "#",
        titleAttr: "",
        newTab: false,
        links: [
          {
            id: "shop-0",
            label: "New in",
            href: "/c/new-in",
            titleAttr: "",
            newTab: false,
          },
          {
            id: "shop-1",
            label: "Best sellers",
            href: "/c/best-sellers",
            titleAttr: "Top picks",
            newTab: true,
          },
        ],
      },
      {
        id: "help",
        label: "Help",
        href: "/pages/help",
        titleAttr: "",
        newTab: false,
        links: [
          {
            id: "help-0",
            label: "Contact",
            href: "/pages/contact",
            titleAttr: "",
            newTab: false,
          },
        ],
      },
    ],
    isEmpty: false,
    mobileAccordion: { expandedId: null },
  };
}

function proofSection(): Section {
  const base = newSection("footer_sitemap");
  return {
    ...base,
    id: "footer-proof",
    props: {
      ...base.props,
      items: [
        {
          title: "Shop",
          links: "New in|/c/new-in\nBest sellers|/c/best-sellers",
        },
        { title: "Help", links: "Contact|/pages/contact" },
      ],
      pages: "",
    },
  };
}

function ctxFor(section: Section, locale: "en" | "bn" = "en"): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "test",
    renderChildren: () => null,
    link: (href: string) => href,
  };
}

function renderDirect(
  Cmp: WidgetComponent,
  section: Section,
  locale: "en" | "bn" = "en",
): string {
  return renderToStaticMarkup(
    createElement(Cmp as (p: WidgetCtx) => React.ReactElement, ctxFor(section, locale)),
  );
}

function renderEngine(section: Section, themeKey: string | null): string {
  return renderToStaticMarkup(
    <SectionRenderer section={section} themeKey={themeKey} locale="en" />,
  );
}

/** Every authored label + href must survive in the rendered markup. */
function expectPureContent(html: string) {
  for (const label of ["Shop", "Help", "New in", "Best sellers", "Contact"]) {
    expect(html).toContain(label);
  }
  for (const href of ["/c/new-in", "/c/best-sellers", "/pages/contact"]) {
    expect(html).toContain(`href="${href}"`);
  }
  expect(html).toContain(`aria-label="${LABEL}"`);
  // Shared affordance rules: heading-only "#" columns are headings, real
  // hrefs are links, new-tab links open externally.
  expect(html).toContain("<p");
  expect(html).toContain('href="/pages/help"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('title="Top picks"');
}

/**
 * Section-derived content: the minimal adapters emit heading-only columns
 * (`href="#"` → `<p>`) with plain rebased link hrefs.
 */
function expectSectionContent(html: string) {
  for (const label of ["Shop", "Help", "New in", "Best sellers", "Contact"]) {
    expect(html).toContain(label);
  }
  for (const href of ["/c/new-in", "/c/best-sellers", "/pages/contact"]) {
    expect(html).toContain(`href="${href}"`);
  }
  expect(html).toContain('aria-label="Footer menu"');
  expect(html).toContain("<p");
}

beforeEach(() => {
  clearThemePresentations();
  registerThemePresentation(
    "songoskriti",
    "footer_sitemap",
    SongoskritiFooterProofPresentation,
  );
  registerThemePresentation(
    "somvabona",
    "footer_sitemap",
    SomvabonaFooterProofPresentation,
  );
});

describe("same footer data, two theme presentations", () => {
  it("resolves distinct presentations per theme through the registry", () => {
    const songoskriti = resolveThemePresentation("songoskriti", "footer_sitemap");
    const somvabona = resolveThemePresentation("somvabona", "footer_sitemap");
    expect(songoskriti).toBe(SongoskritiFooterProofPresentation);
    expect(somvabona).toBe(SomvabonaFooterProofPresentation);
    expect(songoskriti).not.toBe(somvabona);
  });

  it("renders different markup with identical data (pure FooterData in)", () => {
    const data = proofFooterData();
    const before = JSON.stringify(data);

    const songoskriti = renderToStaticMarkup(
      <SongoskritiFooterProof data={data} label={LABEL} />,
    );
    const somvabona = renderToStaticMarkup(
      <SomvabonaFooterProof data={data} label={LABEL} />,
    );

    // Structurally distinct presentations per theme.
    expect(songoskriti).toContain('data-footer-presentation="songoskriti-proof"');
    expect(somvabona).toContain('data-footer-presentation="somvabona-proof"');
    expect(songoskriti).toContain("grid");
    expect(somvabona).not.toContain("grid max-w-6xl gap-12");
    expect(songoskriti).not.toBe(somvabona);
    // Identical content: same columns, labels, hrefs, affordances.
    expectPureContent(songoskriti);
    expectPureContent(somvabona);
    // Neither render mutates the shared data object.
    expect(JSON.stringify(data)).toBe(before);
  });

  it("renders different markup from ONE shared section (registry widgets)", () => {
    const section = proofSection();
    const before = JSON.stringify(section);

    const songoskriti = renderDirect(
      resolveThemePresentation("songoskriti", "footer_sitemap")!,
      section,
    );
    const somvabona = renderDirect(
      resolveThemePresentation("somvabona", "footer_sitemap")!,
      section,
    );

    expect(songoskriti).toContain('data-footer-presentation="songoskriti-proof"');
    expect(somvabona).toContain('data-footer-presentation="somvabona-proof"');
    expect(songoskriti).not.toBe(somvabona);
    // Both adapters derive the same merchant data: identical labels/hrefs.
    expectSectionContent(songoskriti);
    expectSectionContent(somvabona);
    expect(JSON.stringify(section)).toBe(before);
  });

  it("routes through the SectionRenderer lookup path per themeKey", () => {
    const section = proofSection();
    const before = JSON.stringify(section);

    const songoskriti = renderEngine(section, "songoskriti");
    const somvabona = renderEngine(section, "somvabona");

    expect(songoskriti).toContain('data-footer-presentation="songoskriti-proof"');
    expect(somvabona).toContain('data-footer-presentation="somvabona-proof"');
    expect(songoskriti).not.toBe(somvabona);
    expectSectionContent(songoskriti);
    expectSectionContent(somvabona);
    expect(JSON.stringify(section)).toBe(before);
  });
});

describe("R3 canonical footer presentation path", () => {
  it("keeps the canonical presentation when a duplicate claims the same pair", () => {
    // Consolidation guard: the untracked sibling draft
    // (`songoskriti/footer-presentation.tsx`) claims the same
    // `songoskriti × footer_sitemap` pair as the canonical proof module.
    // Registration is first-wins, so even if that draft is ever imported,
    // the canonical presentation keeps the pair on both themes.
    const Duplicate: WidgetComponent = () => null;
    registerThemePresentation("songoskriti", "footer_sitemap", Duplicate);
    registerThemePresentation("somvabona", "footer_sitemap", Duplicate);
    expect(resolveThemePresentation("songoskriti", "footer_sitemap")).toBe(
      SongoskritiFooterProofPresentation,
    );
    expect(resolveThemePresentation("somvabona", "footer_sitemap")).toBe(
      SomvabonaFooterProofPresentation,
    );
  });

  it("lays out identical data with different structures per theme", () => {
    const data = proofFooterData();

    const songoskriti = renderToStaticMarkup(
      <SongoskritiFooterProof data={data} label={LABEL} />,
    );
    const somvabona = renderToStaticMarkup(
      <SomvabonaFooterProof data={data} label={LABEL} />,
    );

    // Heritage grid: one <section> per column inside the grid wrapper.
    expect(songoskriti).toContain('data-footer-presentation="songoskriti-proof"');
    expect(songoskriti.match(/<section/g) ?? []).toHaveLength(
      data.columns.length,
    );
    expect(songoskriti).toContain("grid");
    // Everyday stack: columns are list rows inside stacked <ul> groups,
    // never grid sections.
    expect(somvabona).toContain('data-footer-presentation="somvabona-proof"');
    expect(somvabona).toContain("<ul");
    expect(somvabona).not.toContain("<section");
    expect(somvabona).not.toContain("grid max-w-6xl gap-12");
    // Markers never leak across themes.
    expect(songoskriti).not.toContain("somvabona-proof");
    expect(somvabona).not.toContain("songoskriti-proof");
  });

  it("propagates one global section edit to every theme template", () => {
    // A global footer edit (one block update → every template): the same
    // edited section re-renders under both themes with the new content.
    const section = proofSection();
    const edited: Section = {
      ...section,
      props: {
        ...section.props,
        items: [
          { title: "Sale", links: "Clearance|/c/clearance" },
          { title: "Help", links: "Contact|/pages/contact" },
        ],
        pages: "about, stores",
      },
    };

    const songoskriti = renderDirect(
      resolveThemePresentation("songoskriti", "footer_sitemap")!,
      edited,
    );
    const somvabona = renderDirect(
      resolveThemePresentation("somvabona", "footer_sitemap")!,
      edited,
    );

    // The global update lands everywhere: new column, new link, and the
    // appended Pages column from the picked slugs.
    for (const html of [songoskriti, somvabona]) {
      expect(html).toContain("Sale");
      expect(html).toContain('href="/c/clearance"');
      expect(html).toContain("Pages");
      expect(html).toContain('href="/pages/about"');
      expect(html).toContain('href="/pages/stores"');
      // Retired content is gone from every template.
      expect(html).not.toContain("Best sellers");
    }
    // Still exactly one path per theme: structures stay distinct.
    expect(songoskriti).toContain('data-footer-presentation="songoskriti-proof"');
    expect(somvabona).toContain('data-footer-presentation="somvabona-proof"');
    expect(songoskriti).not.toBe(somvabona);
  });

  it("defaults the mobile accordion to collapsed and renders every column", () => {
    // Accordion state lives in data so every presentation agrees; no footer
    // renderer consumes `expandedId` yet, so collapsed renders the full
    // column set and a set id changes nothing (reserved, no divergence).
    const data = proofFooterData();
    expect(data.mobileAccordion).toEqual({ expandedId: null });

    const collapsedSongoskriti = renderToStaticMarkup(
      <SongoskritiFooterProof data={data} label={LABEL} />,
    );
    const collapsedSomvabona = renderToStaticMarkup(
      <SomvabonaFooterProof data={data} label={LABEL} />,
    );
    expectPureContent(collapsedSongoskriti);
    expectPureContent(collapsedSomvabona);

    const expanded: typeof data = {
      ...data,
      mobileAccordion: { expandedId: "shop" },
    };
    expect(
      renderToStaticMarkup(
        <SongoskritiFooterProof data={expanded} label={LABEL} />,
      ),
    ).toBe(collapsedSongoskriti);
    expect(
      renderToStaticMarkup(
        <SomvabonaFooterProof data={expanded} label={LABEL} />,
      ),
    ).toBe(collapsedSomvabona);
  });
});
