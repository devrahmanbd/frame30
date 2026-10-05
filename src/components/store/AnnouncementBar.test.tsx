/**
 * T3.2 — standalone announcement surface.
 *
 * Proves the surface renders correctly with zero header dependency: every
 * case here renders `AnnouncementBar` (or the `announcement_bar` widget
 * branch, which adapts to it) without mounting `StoreHeader`.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  newSection,
  type PropValue,
  type Section,
} from "@/lib/builder-ast";
import type { Locale } from "@/lib/bitext";
import {
  AnnouncementBar,
  announcementAlignOf,
  announcementItemsOf,
  announcementMotionOf,
  announcementSizeOf,
  announcementToneOf,
  headerChromeAnnouncementItems,
  readDismissedIds,
  resolveAnnouncementItems,
  useAnnouncementState,
} from "./AnnouncementBar";
import { CHROME_WIDGETS } from "@/components/builder/chrome";
import {
  widgetReader,
  type WidgetCtx,
} from "@/components/builder/widgets";

const SURFACE_SRC = readFileSync(join(__dirname, "AnnouncementBar.tsx"), "utf8");

function surfaceHtml(
  props: React.ComponentProps<typeof AnnouncementBar>,
): string {
  return renderToStaticMarkup(createElement(AnnouncementBar, props));
}

function widgetHtml(
  props: Record<string, unknown>,
  locale: Locale = "en",
): string {
  const Cmp = CHROME_WIDGETS["announcement_bar"];
  const base = newSection("announcement_bar");
  const section: Section = {
    ...base,
    props: { ...base.props, ...(props as Record<string, PropValue>) },
  };
  const ctx: WidgetCtx = {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "test",
    link: (href: string) => href,
    data: undefined,
    renderChildren: () => null,
  };
  return renderToStaticMarkup(
    createElement(Cmp as (p: WidgetCtx) => React.ReactElement, ctx),
  );
}

describe("announcement surface — zero header dependency", () => {
  it("imports neither StoreHeader nor theme chrome nor theme modules", () => {
    expect(SURFACE_SRC).not.toMatch(/^import .*StoreHeader/m);
    expect(SURFACE_SRC).not.toMatch(/from ["'].*StoreHeader["']/);
    expect(SURFACE_SRC).not.toMatch(/from ["'].*theme-chrome["']/);
    expect(SURFACE_SRC).not.toContain("@/lib/themes/");
    expect(SURFACE_SRC).not.toMatch(/from ["']@\/components\/builder\//);
  });

  it("renders a single message with no header in the tree", () => {
    const html = surfaceHtml({
      items: [{ text: "Free delivery over BDT 2,000" }],
    });
    expect(html).toContain("Free delivery over BDT 2,000");
    expect(html).toContain('aria-label="Announcement"');
    expect(html).toContain('aria-live="polite"');
  });

  it("renders nothing when every row is blank", () => {
    expect(surfaceHtml({ items: [] })).toBe("");
    expect(
      surfaceHtml({ items: [{ text: "  " }, { text: "", text_bn: "" }] }),
    ).toBe("");
  });
});

describe("announcement surface — single / multi", () => {
  it("a single message shows no prev/next steppers", () => {
    const html = surfaceHtml({ items: [{ text: "One" }] });
    expect(html).toContain("One");
    expect(html).not.toContain("Previous announcement");
    expect(html).not.toContain("Next announcement");
  });

  it("multiple messages show the first plus manual steppers (no motion needed)", () => {
    const html = surfaceHtml({
      items: [{ text: "First" }, { text: "Second" }],
      rotateMs: 0,
      motion: "static",
    });
    expect(html).toContain("First");
    expect(html).not.toContain(">Second<");
    expect(html).toContain('aria-label="Previous announcement"');
    expect(html).toContain('aria-label="Next announcement"');
  });
});

describe("announcement surface — link / action", () => {
  it("wraps the message in a link when an href is present", () => {
    const html = surfaceHtml({
      items: [{ text: "Sale", href: "/sale" }],
    });
    expect(html).toContain('<a href="/sale"');
    expect(html).toContain(">Sale<");
  });

  it("falls back to the global href when the item has none", () => {
    const html = surfaceHtml({
      items: [{ text: "Sale" }],
      href: "/promo",
    });
    expect(html).toContain('<a href="/promo"');
  });

  it("renders plain text with no link configured", () => {
    const html = surfaceHtml({ items: [{ text: "No link" }] });
    expect(html).toContain("No link");
    expect(html).not.toContain("<a ");
  });

  it("rebases links through the link prop", () => {
    const html = surfaceHtml({
      items: [{ text: "Sale", href: "/sale" }],
      link: (href) => `/store/demo${href}`,
    });
    expect(html).toContain('<a href="/store/demo/sale"');
  });
});

describe("announcement surface — dismissal persisted", () => {
  it("a dismissed id hides its message (persisted-state injection)", () => {
    const html = surfaceHtml({
      items: [{ text: "Gone" }],
      dismissible: true,
      initialDismissedIds: ["Gone"],
    });
    expect(html).toBe("");
  });

  it("dismissing one of many keeps the other visible", () => {
    const html = surfaceHtml({
      items: [{ text: "Keep" }, { text: "Drop" }],
      rotateMs: 0,
      initialDismissedIds: ["Drop"],
    });
    expect(html).toContain("Keep");
    expect(html).not.toContain(">Drop<");
  });

  it("no close button unless dismissible", () => {
    expect(
      surfaceHtml({ items: [{ text: "X" }] }),
    ).not.toContain("Dismiss announcement");
    expect(
      surfaceHtml({ items: [{ text: "X" }], dismissible: true }),
    ).toContain('aria-label="Dismiss announcement"');
  });

  it("readDismissedIds merges injected ids without storage", () => {
    expect(readDismissedIds("fq-test-missing", ["a"])).toEqual(["a"]);
    expect(readDismissedIds("fq-test-missing")).toEqual([]);
  });
});

describe("announcement surface — locale incl. bn", () => {
  const items = [
    { text: "Sale!", text_bn: "ছাড়!" },
    { text: "New in", text_bn: "নতুন এসেছে" },
  ];

  it("bn renders the _bn twins", () => {
    const html = surfaceHtml({ items, locale: "bn", dismissible: true });
    expect(html).toContain("ছাড়!");
    expect(html).not.toContain(">Sale!<");
    expect(html).toContain('aria-label="ঘোষণা"');
    expect(html).toContain('aria-label="ঘোষণা বন্ধ করুন"');
  });

  it("bn falls back to English when twins are missing", () => {
    const html = surfaceHtml({
      items: [{ text: "English only" }],
      locale: "bn",
    });
    expect(html).toContain("English only");
  });

  it("en never renders the bn twin", () => {
    const html = surfaceHtml({ items, locale: "en" });
    expect(html).toContain("Sale!");
    expect(html).not.toContain("ছাড়!");
  });

  it("resolveAnnouncementItems drops blanks, keeps bn-only rows in bn", () => {
    expect(resolveAnnouncementItems([{ text: " " }], "en")).toEqual([]);
    expect(
      resolveAnnouncementItems([{ text: "", text_bn: "শুধু বাংলা" }], "bn"),
    ).toEqual([{ id: "শুধু বাংলা", text: "শুধু বাংলা", href: "" }]);
    expect(
      resolveAnnouncementItems([{ text: "", text_bn: "শুধু বাংলা" }], "en"),
    ).toEqual([]);
  });
});

describe("announcement surface — theme presentation, no marquee forcing", () => {
  it("defaults to the brand tone bar, centered", () => {
    const html = surfaceHtml({ items: [{ text: "T" }] });
    expect(html).toContain("bg-primary");
    expect(html).toContain("justify-center");
  });

  it("theme controls color, alignment, height/typography", () => {
    const html = surfaceHtml({
      items: [{ text: "T" }],
      tone: "muted",
      align: "left",
      size: "sm",
    });
    expect(html).toContain("bg-muted");
    expect(html).not.toContain("bg-primary");
    expect(html).toContain("justify-start");
    expect(html).toContain("text-[11px]");
  });

  it("integrated variant drops the bar background for header embedding", () => {
    const html = surfaceHtml({
      items: [{ text: "T" }],
      variant: "integrated",
    });
    expect(html).not.toContain("bg-primary");
    expect(html).not.toContain("bg-muted");
    expect(html).toContain("text-current");
  });

  it("never ships a marquee loop; motion is instant swap only", () => {
    const html = surfaceHtml({
      items: [{ text: "A" }, { text: "B" }],
      rotateMs: 6000,
    });
    expect(html).not.toContain("marquee");
    expect(SURFACE_SRC).not.toMatch(/animate-/);
  });

  it("reduced-motion forces static rotation", () => {
    expect(SURFACE_SRC).toContain("prefers-reduced-motion");
    expect(SURFACE_SRC).toContain("usePrefersReducedMotion");
    expect(SURFACE_SRC).toContain("motion-safe:");
  });

  it("lenient theme-prop readers degrade unknown strings to default", () => {
    expect(announcementMotionOf("marquee")).toBeUndefined();
    expect(announcementMotionOf("rotating")).toBe("rotating");
    expect(announcementAlignOf("justify")).toBeUndefined();
    expect(announcementSizeOf("lg")).toBeUndefined();
    expect(announcementToneOf("#ff0000")).toBeUndefined();
  });
});

describe("announcement surface — header-chrome data shape adapter", () => {
  it("maps center/center_bn to items; null/empty to none", () => {
    expect(
      headerChromeAnnouncementItems({
        left: "EASY 7-DAY EXCHANGE",
        center: "Free delivery over BDT 5000",
        center_bn: "৫০০০ টাকার উপরে ফ্রি ডেলিভারি",
      }),
    ).toEqual([
      {
        text: "Free delivery over BDT 5000",
        text_bn: "৫০০০ টাকার উপরে ফ্রি ডেলিভারি",
      },
    ]);
    expect(headerChromeAnnouncementItems(null)).toEqual([]);
    expect(
      headerChromeAnnouncementItems({ center: "", center_bn: "" }),
    ).toEqual([]);
  });

  it("adapted chrome copy renders localized through the surface", () => {
    const chrome = {
      left: "EASY 7-DAY EXCHANGE",
      center: "Free delivery across Bangladesh on orders over BDT 5000",
      center_bn: "৫০০০ টাকার উপরে অর্ডারে সারা দেশে ফ্রি ডেলিভারি",
    };
    const en = surfaceHtml({
      items: headerChromeAnnouncementItems(chrome),
      locale: "en",
    });
    expect(en).toContain(chrome.center);
    const bn = surfaceHtml({
      items: headerChromeAnnouncementItems(chrome),
      locale: "bn",
    });
    expect(bn).toContain(chrome.center_bn);
    expect(bn).not.toContain(chrome.center);
  });
});

describe("announcement_bar widget branch — uses the standalone surface", () => {
  it("renders repeater rows without StoreHeader", () => {
    const html = widgetHtml({
      items: [
        { text: "Sale!", text_bn: "ছাড়!" },
        { text: "New in", text_bn: "নতুন এসেছে" },
      ],
      dismissible: true,
      rotateMs: 6000,
    });
    expect(html).toContain("Sale!");
    expect(html).toContain('aria-label="Dismiss announcement"');
    expect(html).toContain('aria-label="Announcement"');
  });

  it("bn renders the row twins through the branch", () => {
    const html = widgetHtml(
      {
        items: [
          { text: "Sale!", text_bn: "ছাড়!" },
          { text: "New in", text_bn: "নতুন এসেছে" },
        ],
      },
      "bn",
    );
    expect(html).toContain("ছাড়!");
    expect(html).not.toContain(">Sale!<");
  });

  it("scalar m1/m2/m3 (+ twins) remain the fallback", () => {
    const html = widgetHtml(
      { m1: "Hello", m1_bn: "হ্যালো", m2: "", m3: "" },
      "bn",
    );
    expect(html).toContain("হ্যালো");
    const en = widgetHtml({ m1: "Hello", m2: "World" });
    expect(en).toContain("Hello");
  });

  it("renders nothing when empty, with or without header", () => {
    expect(widgetHtml({ m1: "", m2: "", m3: "" })).toBe("");
    // Explicitly emptied repeater + emptied scalar fallback: the catalog
    // default m1 is overridden here, so no fallback copy remains.
    expect(widgetHtml({ items: [], m1: "", m2: "", m3: "" })).toBe("");
  });

  it("honors authored theme presentation keys when present", () => {
    const html = widgetHtml({ m1: "T", tone: "muted", align: "left" });
    expect(html).toContain("bg-muted");
    expect(html).toContain("justify-start");
  });
});

describe("announcement platform data contract (R2 — shared by every theme)", () => {
  it("announcementItemsOf is repeater-first with scalar m1/m2/m3 fallback", () => {
    expect(
      announcementItemsOf({
        items: [{ text: "Row", text_bn: "সারি" }],
        m1: "Scalar",
      }),
    ).toEqual([{ text: "Row", text_bn: "সারি" }]);
    expect(
      announcementItemsOf({ items: [], m1: "Hello", m1_bn: "হ্যালো", m2: "", m3: "" }),
    ).toEqual([{ text: "Hello", text_bn: "হ্যালো" }]);
    expect(announcementItemsOf({ items: [], m1: "", m2: "", m3: "" })).toEqual(
      [],
    );
  });

  it("announcementItemsOf never mutates its input", () => {
    const props = { items: [{ text: "A" }], m1: "B" };
    const before = JSON.stringify(props);
    announcementItemsOf(props);
    expect(JSON.stringify(props)).toBe(before);
  });
});

describe("announcement headless state (R2 — theme presentations consume this)", () => {
  function stateHtml(
    props: React.ComponentProps<typeof AnnouncementBar>,
  ): string {
    function Probe(p: React.ComponentProps<typeof AnnouncementBar>) {
      const state = useAnnouncementState(p);
      if (!state.active) return null;
      return createElement(
        "p",
        {
          "data-region": state.labels.region,
          "data-dismiss": state.labels.dismiss,
          "data-count": state.visible.length,
        },
        `${state.active.text}|${state.linkHref}`,
      );
    }
    return renderToStaticMarkup(createElement(Probe, props));
  }

  it("exposes the same resolved copy, labels and links as the default presentation", () => {
    const html = stateHtml({
      items: [{ text: "Sale", href: "/sale" }],
      link: (href) => `/store/demo${href}`,
    });
    expect(html).toContain("Sale|/store/demo/sale");
    expect(html).toContain('data-region="Announcement"');
    expect(html).toContain('data-dismiss="Dismiss announcement"');
    expect(html).toContain('data-count="1"');
  });

  it("resolves bn twins with bilingual labels through the hook", () => {
    const html = stateHtml({
      items: [{ text: "Sale!", text_bn: "ছাড়!" }],
      locale: "bn",
    });
    expect(html).toContain("ছাড়!");
    expect(html).toContain('data-region="ঘোষণা"');
    expect(html).toContain('data-dismiss="ঘোষণা বন্ধ করুন"');
  });

  it("honors persisted dismissal injection through the hook", () => {
    expect(
      stateHtml({
        items: [{ text: "Gone" }],
        initialDismissedIds: ["Gone"],
      }),
    ).toBe("");
    const html = stateHtml({
      items: [{ text: "Keep" }, { text: "Drop" }],
      initialDismissedIds: ["Drop"],
    });
    expect(html).toContain("Keep");
    expect(html).not.toContain("Drop");
  });
});
