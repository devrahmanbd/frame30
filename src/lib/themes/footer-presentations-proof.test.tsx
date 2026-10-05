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
