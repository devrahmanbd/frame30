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
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
import { announcementItemsOf } from "@/components/store/AnnouncementBar";

const SONGOSKRITI_SRC = readFileSync(
  join(__dirname, "songoskriti/announcement-presentation.tsx"),
  "utf8",
);
const SOMVABONA_SRC = readFileSync(
  join(__dirname, "somvabona/announcement-presentation.tsx"),
  "utf8",
);

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

describe("theme-owned inner presentation (R2 — beyond the wrapper)", () => {
  function themedHtml(themeKey: string, section: Section): string {
    const Cmp = resolveThemePresentation(themeKey, "announcement_bar")!;
    return renderDirect(Cmp, section);
  }

  it("owns typography/alignment/mobile layout per theme, not the platform default", () => {
    const section = proofSection();
    const songoskriti = themedHtml("songoskriti", section);
    const somvabona = themedHtml("somvabona", section);

    // Heritage bar: centered uppercase serif line, truncated on small screens.
    expect(songoskriti).toContain("font-serif");
    expect(songoskriti).toContain("uppercase");
    expect(songoskriti).toContain("tracking-[0.2em]");
    expect(songoskriti).toContain("text-center");
    expect(songoskriti).toContain("truncate");
    // Everyday strip: left-aligned wrapping sans line with a marker dot.
    expect(somvabona).toContain("font-sans");
    expect(somvabona).toContain("text-left");
    expect(somvabona).toContain("whitespace-normal");
    expect(somvabona).not.toContain("truncate");
    expect(somvabona).toContain("rounded-full");
    expect(somvabona).toContain("border-dashed");
    // Neither inherits the platform default presentation's tone backgrounds
    // (token `bg-*` fills); flex centering itself is a legitimate per-theme
    // layout choice, so only the tone signatures are asserted here.
    for (const html of [songoskriti, somvabona]) {
      expect(html).not.toContain("bg-primary");
      expect(html).not.toContain("bg-muted");
      expect(html).not.toContain("bg-foreground");
    }
  });

  it("reads identical data through the shared platform row reader", () => {
    const section = proofSection();
    expect(announcementItemsOf(section.props as Record<string, unknown>)).toEqual([
      { text: MESSAGE_EN, text_bn: MESSAGE_BN },
      { text: MESSAGE_2_EN, text_bn: "" },
    ]);
    const scalar = scalarSection();
    expect(
      announcementItemsOf(scalar.props as Record<string, unknown>),
    ).toEqual([{ text: MESSAGE_EN, text_bn: MESSAGE_BN }]);
  });
});

describe("dismissal behavior preserved per theme", () => {
  function dismissibleSection(dismissible: boolean): Section {
    const base = newSection("announcement_bar");
    return {
      ...base,
      id: "announcement-proof-dismiss",
      props: {
        ...base.props,
        items: [{ text: MESSAGE_EN, text_bn: MESSAGE_BN }],
        dismissible,
        motion: "static",
      },
    };
  }

  it("renders the same bilingual close affordance when dismissible", () => {
    for (const locale of ["en", "bn"] as const) {
      const expected = locale === "bn" ? "ঘোষণা বন্ধ করুন" : "Dismiss announcement";
      for (const themeKey of ["songoskriti", "somvabona"]) {
        const Cmp = resolveThemePresentation(themeKey, "announcement_bar")!;
        const html = renderDirect(Cmp, dismissibleSection(true), locale);
        expect(html, `${themeKey}/${locale}`).toContain(
          `aria-label="${expected}"`,
        );
        expect(html).toContain(locale === "bn" ? MESSAGE_BN : MESSAGE_EN);
      }
    }
  });

  it("renders no close affordance unless dismissible", () => {
    for (const themeKey of ["songoskriti", "somvabona"]) {
      const Cmp = resolveThemePresentation(themeKey, "announcement_bar")!;
      const html = renderDirect(Cmp, dismissibleSection(false));
      expect(html, themeKey).not.toContain("Dismiss announcement");
      expect(html).toContain(MESSAGE_EN);
    }
  });
});

describe("reduced motion honored per theme", () => {
  it("ships no marquee loop or CSS animation in either presentation", () => {
    const section = proofSection();
    for (const themeKey of ["songoskriti", "somvabona"]) {
      const Cmp = resolveThemePresentation(themeKey, "announcement_bar")!;
      const html = renderDirect(Cmp, section);
      expect(html, themeKey).not.toContain("marquee");
      expect(html).not.toMatch(/animate-/);
    }
    for (const [name, src] of [
      ["songoskriti", SONGOSKRITI_SRC],
      ["somvabona", SOMVABONA_SRC],
    ] as const) {
      expect(src, name).not.toMatch(/animate-/);
      expect(src.toLowerCase(), name).not.toContain("marquee");
    }
  });

  it("both presentations consume the shared reduced-motion-gated state", () => {
    for (const [name, src] of [
      ["songoskriti", SONGOSKRITI_SRC],
      ["somvabona", SOMVABONA_SRC],
    ] as const) {
      expect(src, name).toContain("useAnnouncementState");
      expect(src, name).toContain("motion-safe:");
      // No theme-owned motion probe: reduced-motion gating lives in the
      // platform hook (prefers-reduced-motion), consumed — not reimplemented.
      expect(src, name).not.toContain("matchMedia");
      expect(src, name).not.toContain("prefers-reduced-motion");
    }
  });

  it("multi-message steppers keep every message reachable without motion", () => {
    const section = proofSection();
    for (const themeKey of ["songoskriti", "somvabona"]) {
      const Cmp = resolveThemePresentation(themeKey, "announcement_bar")!;
      const html = renderDirect(Cmp, section);
      expect(html, themeKey).toContain('aria-label="Previous announcement"');
      expect(html, themeKey).toContain('aria-label="Next announcement"');
    }
  });
});
