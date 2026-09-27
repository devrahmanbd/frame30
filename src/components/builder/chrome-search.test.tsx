/**
 * Search lane — command-palette contracts for `search_command`.
 *
 * Owns ONLY the search widget: trigger affordance, combobox/listbox roles,
 * keyboard handling, 44px targets, responsive widths, bilingual bn/en copy,
 * reduced-motion guards and token-only styling.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import { WIDGET_BY_KEY } from "@/lib/studio/catalog";
import {
  WIDGET_COMPONENTS,
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "./widgets";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => ({ location: { pathname: "/" } }),
}));

const SRC = readFileSync("src/components/builder/chrome.tsx", "utf8");

function ctxFor(section: Section, locale: "en" | "bn" = "en"): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "demo",
    data: undefined,
    renderChildren: () => null,
    link: (href: string) => href,
  };
}

function render(section: Section, locale: "en" | "bn" = "en") {
  const Cmp = WIDGET_COMPONENTS.search_command as WidgetComponent;
  return renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxFor(section, locale),
    ),
  );
}

describe("search_command catalog", () => {
  it("keeps placeholder/buttonLabel/limit defaults", () => {
    expect(WIDGET_BY_KEY.search_command.defaults).toMatchObject({
      placeholder: "Search products",
      buttonLabel: "Search",
      limit: 6,
    });
  });

  it("adds no new configurable props beyond the closed set", () => {
    expect(Object.keys(WIDGET_BY_KEY.search_command.defaults).sort()).toEqual([
      "buttonLabel",
      "limit",
      "placeholder",
    ]);
  });
});

describe("search_command trigger (SSR)", () => {
  it("renders a 44px full-width trigger with dialog affordance", () => {
    const html = render(newSection("search_command"));
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("w-full");
    expect(html).toContain("sm:w-72");
    expect(html).toContain("Search products");
  });

  it("keeps bilingual placeholder copy", () => {
    const en = render(newSection("search_command"), "en");
    const bn = render(
      {
        ...newSection("search_command"),
        props: {
          placeholder: "Search products",
          placeholder_bn: "পণ্য খুঁজুন",
        },
      },
      "bn",
    );
    expect(en).toContain("Search products");
    expect(bn).toContain("পণ্য খুঁজুন");
  });

  it("shows visible focus states on the trigger", () => {
    const html = render(newSection("search_command"));
    expect(html).toContain("focus-visible:ring-2");
  });
});

describe("search_command source contracts", () => {
  it("uses combobox/listbox/option roles with active-descendant wiring", () => {
    expect(SRC).toContain('role="combobox"');
    expect(SRC).toContain('role="listbox"');
    expect(SRC).toContain('role="option"');
    expect(SRC).toContain("aria-activedescendant");
    expect(SRC).toContain("aria-controls");
    expect(SRC).toContain("aria-expanded");
    expect(SRC).toContain('aria-autocomplete="list"');
    expect(SRC).toContain('role="search"');
  });

  it("handles Escape plus arrow-key navigation", () => {
    expect(SRC).toContain("ArrowDown");
    expect(SRC).toContain("ArrowUp");
    expect(SRC).toContain("Escape");
    expect(SRC).toContain("stopPropagation");
  });

  it("keeps 44px targets on trigger, input, clear and options", () => {
    const hits = (SRC.match(/min-h-11|size-11/g) ?? []).length;
    expect(hits).toBeGreaterThanOrEqual(4);
  });

  it("respects reduced motion and keeps transitions token-gated", () => {
    expect(SRC).toContain("motion-safe:transition-colors");
    expect(SRC).toContain("motion-reduce:animate-none");
  });

  it("carries bilingual bn/en copy inline (no new catalog props)", () => {
    for (const copy of [
      "পণ্য খুঁজুন",
      "খুঁজুন",
      "খোঁজা হচ্ছে",
      "সার্চ মুছুন",
      "সাজেশন",
      "সব ফল দেখুন",
    ]) {
      expect(SRC, copy).toContain(copy);
    }
  });

  it("stays responsive: full-width mobile, constrained desktop", () => {
    expect(SRC).toContain("w-full");
    expect(SRC).toContain("sm:w-72");
    expect(SRC).toContain("max-h-[min(50vh,20rem)]");
  });

  it("hardcodes no raw colour values and imports no theme module", () => {
    expect(SRC.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    const imports = [...SRC.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
    expect(
      imports.filter((s) =>
        /theme|preset|bazaar|atelier|circuit|rupaboti/i.test(s),
      ),
    ).toEqual([]);
  });
});
