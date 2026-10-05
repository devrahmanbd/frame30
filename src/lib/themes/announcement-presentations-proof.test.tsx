/**
 * PROOF lane TEST 3 — same announcement data → two theme presentations.
 *
 * The shared `AnnouncementBar` surface owns the message contract; each
 * theme owns chrome around it through the per-widget presentation
 * registry. This suite feeds ONE section object to both registered
 * `announcement_bar` presentations and asserts different markup out with
 * identical data, labels and links in — directly through
 * `resolveThemePresentation` and through the `SectionRenderer` engine
 * lookup path. Neither render mutates the shared section.
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
import { SongoskritiAnnouncementPresentation } from "./songoskriti/announcement-presentation";
import { SomvabonaAnnouncementPresentation } from "./somvabona/announcement-presentation";

const MESSAGE_EN = "Free delivery over BDT 2,000";
const MESSAGE_BN = "৳২০০০-এর বেশি কিনলে ফ্রি ডেলিভারি";
const MESSAGE_2_EN = "New drop every Friday";
const LINK_HREF = "/c/new-in";

function proofSection(): Section {
  const base = newSection("announcement_bar");
  return {
    ...base,
    id: "announcement-proof",
    props: {
      ...base.props,
      items: [
        { text: MESSAGE_EN, text_bn: MESSAGE_BN },
        { text: MESSAGE_2_EN, text_bn: "" },
      ],
      href: LINK_HREF,
      dismissible: false,
      motion: "static",
      align: "center",
      size: "md",
      tone: "brand",
    },
  };
}

function scalarSection(): Section {
  const base = newSection("announcement_bar");
  return {
    ...base,
    id: "announcement-proof-scalar",
    props: {
      ...base.props,
      items: [],
      m1: MESSAGE_EN,
      m1_bn: MESSAGE_BN,
      m2: "",
      m3: "",
      href: LINK_HREF,
      dismissible: false,
      motion: "static",
      align: "center",
      size: "md",
      tone: "brand",
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

beforeEach(() => {
  clearThemePresentations();
  registerThemePresentation(
    "songoskriti",
    "announcement_bar",
    SongoskritiAnnouncementPresentation,
  );
  registerThemePresentation(
    "somvabona",
    "announcement_bar",
    SomvabonaAnnouncementPresentation,
  );
});

describe("same announcement data, two theme presentations", () => {
  it("resolves distinct presentations per theme through the registry", () => {
    const songoskriti = resolveThemePresentation("songoskriti", "announcement_bar");
    const somvabona = resolveThemePresentation("somvabona", "announcement_bar");
    expect(songoskriti).toBe(SongoskritiAnnouncementPresentation);
    expect(somvabona).toBe(SomvabonaAnnouncementPresentation);
    expect(songoskriti).not.toBe(somvabona);
  });

  it("renders different markup with identical data, labels and links (direct)", () => {
    const section = proofSection();
    const before = JSON.stringify(section);

    const songoskriti = renderDirect(
      resolveThemePresentation("songoskriti", "announcement_bar")!,
      section,
    );
    const somvabona = renderDirect(
      resolveThemePresentation("somvabona", "announcement_bar")!,
      section,
    );

    // Structurally distinct chrome per theme.
    expect(songoskriti).toContain('data-announcement-presentation="songoskriti"');
    expect(somvabona).toContain('data-announcement-presentation="somvabona"');
    expect(songoskriti).toContain("<div");
    expect(somvabona).toContain("<section");
    expect(songoskriti).not.toBe(somvabona);
    // Identical content: same message, same link, same region label.
    for (const html of [songoskriti, somvabona]) {
      expect(html).toContain(MESSAGE_EN);
      expect(html).toContain(LINK_HREF);
      expect(html).toContain('aria-label="Announcement"');
    }
    // Neither render mutates the shared section object.
    expect(JSON.stringify(section)).toBe(before);
  });

  it("renders identical copy in the bn locale from the same rows", () => {
    const section = proofSection();
    const songoskriti = renderDirect(
      resolveThemePresentation("songoskriti", "announcement_bar")!,
      section,
      "bn",
    );
    const somvabona = renderDirect(
      resolveThemePresentation("somvabona", "announcement_bar")!,
      section,
      "bn",
    );

    expect(songoskriti).not.toBe(somvabona);
    for (const html of [songoskriti, somvabona]) {
      expect(html).toContain(MESSAGE_BN);
      expect(html).toContain('aria-label="ঘোষণা"');
    }
  });

  it("renders identical copy from the scalar m1/m2/m3 fallback", () => {
    const section = scalarSection();
    const songoskriti = renderDirect(
      resolveThemePresentation("songoskriti", "announcement_bar")!,
      section,
    );
    const somvabona = renderDirect(
      resolveThemePresentation("somvabona", "announcement_bar")!,
      section,
    );

    expect(songoskriti).not.toBe(somvabona);
    for (const html of [songoskriti, somvabona]) {
      expect(html).toContain(MESSAGE_EN);
      expect(html).toContain(LINK_HREF);
    }
  });

  it("routes through the SectionRenderer lookup path per themeKey", () => {
    const section = proofSection();
    const before = JSON.stringify(section);

    const songoskriti = renderEngine(section, "songoskriti");
    const somvabona = renderEngine(section, "somvabona");

    expect(songoskriti).toContain(
      'data-announcement-presentation="songoskriti"',
    );
    expect(somvabona).toContain('data-announcement-presentation="somvabona"');
    expect(songoskriti).not.toBe(somvabona);
    expect(songoskriti).toContain(MESSAGE_EN);
    expect(somvabona).toContain(MESSAGE_EN);
    expect(JSON.stringify(section)).toBe(before);
  });
});
