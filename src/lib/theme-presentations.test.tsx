/**
 * REGISTRY CORE — per-widget theme presentation registry contracts.
 *
 * - register/resolve/override/fallback/duplicate/no-throw at the unit
 *   level (types only ever reference WidgetComponent/SectionType — the
 *   source scan below pins zero theme imports and zero theme branches);
 * - the SAME section object renders through two registered presentations
 *   with different markup and identical data, via the SectionRenderer
 *   lookup path (engine wiring) as well as direct resolution.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { newSection, type Section } from "@/lib/builder-ast";
import {
  clearThemePresentations,
  registerThemePresentation,
  resolveThemePresentation,
} from "./theme-presentations";
import { resolveWidgetComponent } from "@/components/builder/theme-widgets";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import {
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "@/components/builder/widgets";

const THEME_A = "registry-alpha";
const THEME_B = "registry-beta";

const AlphaHeading: WidgetComponent = ({ section }) => (
  <p data-presentation="alpha">{String(section.props.text ?? "")}</p>
);
const BetaHeading: WidgetComponent = ({ section }) => (
  <article data-presentation="beta">
    <span>{String(section.props.text ?? "")}</span>
  </article>
);
function proofSection(): Section {
  const base = newSection("heading");
  return {
    ...base,
    id: "registry-proof-heading",
    props: { ...base.props, text: "Registry proof heading" },
  };
}

function ctxFor(section: Section): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, "en"),
    Heading: "h2",
    primary: false,
    editing: false,
    locale: "en",
    storeSlug: "test",
    renderChildren: () => null,
    link: (href: string) => href,
  };
}

function renderDirect(Cmp: WidgetComponent, section: Section): string {
  return renderToStaticMarkup(
    createElement(Cmp as (p: WidgetCtx) => React.ReactElement, ctxFor(section)),
  );
}

function renderEngine(section: Section, themeKey: string | null): string {
  return renderToStaticMarkup(
    <SectionRenderer section={section} themeKey={themeKey} locale="en" />,
  );
}

afterEach(() => {
  clearThemePresentations();
  vi.restoreAllMocks();
});

describe("register/resolve", () => {
  it("resolves a registered theme × widget pair", () => {
    registerThemePresentation(THEME_A, "heading", AlphaHeading);
    expect(resolveThemePresentation(THEME_A, "heading")).toBe(AlphaHeading);
  });

  it("isolates overrides per theme: same widget, different presentations", () => {
    registerThemePresentation(THEME_A, "heading", AlphaHeading);
    registerThemePresentation(THEME_B, "heading", BetaHeading);
    expect(resolveThemePresentation(THEME_A, "heading")).toBe(AlphaHeading);
    expect(resolveThemePresentation(THEME_B, "heading")).toBe(BetaHeading);
  });

  it("falls back to the caller-supplied resolution when unregistered", () => {
    const existing = resolveWidgetComponent(THEME_A, "heading");
    expect(resolveThemePresentation(THEME_A, "heading", existing)).toBe(
      existing,
    );
    // Zero behavior change: passthrough is identical, not a copy.
    expect(
      resolveThemePresentation("no-such-registry-theme", "heading", existing),
    ).toBe(existing);
  });

  it("returns undefined without a fallback instead of throwing", () => {
    expect(resolveThemePresentation("no-such-registry-theme", "heading")).toBe(
      undefined,
    );
    expect(resolveThemePresentation(null, "heading")).toBe(undefined);
    expect(resolveThemePresentation(undefined, "heading")).toBe(undefined);
  });

  it("never throws on unknown/null themes or invalid registration", () => {
    expect(() =>
      resolveThemePresentation("no-such-registry-theme", "heading"),
    ).not.toThrow();
    expect(() => resolveThemePresentation(null, "heading")).not.toThrow();
    expect(() =>
      registerThemePresentation("", "heading", AlphaHeading),
    ).not.toThrow();
    expect(() =>
      registerThemePresentation(THEME_A, "heading", null as never),
    ).not.toThrow();
    // Invalid registrations are dropped, never stored.
    expect(resolveThemePresentation(THEME_A, "heading")).toBe(undefined);
  });

  it("warns on duplicates and keeps the first registration", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerThemePresentation(THEME_A, "heading", AlphaHeading);
    registerThemePresentation(THEME_A, "heading", BetaHeading);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(resolveThemePresentation(THEME_A, "heading")).toBe(AlphaHeading);
  });
});

describe("same section, two presentations", () => {
  it("renders different markup with identical data (direct resolution)", () => {
    registerThemePresentation(THEME_A, "heading", AlphaHeading);
    registerThemePresentation(THEME_B, "heading", BetaHeading);
    const section = proofSection();
    const before = JSON.stringify(section);

    const alpha = renderDirect(
      resolveThemePresentation(THEME_A, "heading")!,
      section,
    );
    const beta = renderDirect(
      resolveThemePresentation(THEME_B, "heading")!,
      section,
    );

    expect(alpha).toContain('data-presentation="alpha"');
    expect(beta).toContain('data-presentation="beta"');
    expect(alpha).not.toBe(beta);
    // Identical data: both carry the section's authored text.
    expect(alpha).toContain("Registry proof heading");
    expect(beta).toContain("Registry proof heading");
    // Neither render mutates the shared section object.
    expect(JSON.stringify(section)).toBe(before);
  });

  it("routes through the SectionRenderer lookup path per themeKey", () => {
    registerThemePresentation(THEME_A, "heading", AlphaHeading);
    registerThemePresentation(THEME_B, "heading", BetaHeading);
    const section = proofSection();
    const before = JSON.stringify(section);

    const alpha = renderEngine(section, THEME_A);
    const beta = renderEngine(section, THEME_B);

    expect(alpha).toContain('data-presentation="alpha"');
    expect(beta).toContain('data-presentation="beta"');
    expect(alpha).not.toBe(beta);
    expect(alpha).toContain("Registry proof heading");
    expect(beta).toContain("Registry proof heading");
    expect(JSON.stringify(section)).toBe(before);
  });

  it("leaves unregistered pairs on the existing resolution (engine)", () => {
    registerThemePresentation(THEME_A, "heading", AlphaHeading);
    const section = proofSection();

    const other = renderEngine(section, "no-such-registry-theme");
    expect(other).not.toContain("data-presentation=");
    expect(other).toContain("Registry proof heading");

    const legacy = renderEngine(proofSection(), null);
    expect(legacy).not.toContain("data-presentation=");
    expect(legacy).toContain("Registry proof heading");
  });
});

describe("shared-code theme independence", () => {
  it("names no theme and branches on no theme", () => {
    const src = readFileSync(
      "src/lib/theme-presentations.ts",
      "utf8",
    );
    expect(src).not.toMatch(/songoskriti|somvabona/i);
    expect(src).not.toMatch(/theme-widgets/);
    expect(src).not.toMatch(/from\s+["'][^"']*songoskriti[^"']*["']/i);
    // No theme-identity branching: the key is only ever an opaque Map
    // key (the typeof input-validation guard excepted — it names no theme).
    const withoutTypeGuards = src.replace(
      /typeof\s+themeKey\s*!==?\s*"string"/g,
      "",
    );
    expect(withoutTypeGuards).not.toMatch(/themeKey\s*(===|!==|==|!=)/);
    expect(src).not.toMatch(/switch\s*\([^)]*theme/);

    const renderer = readFileSync(
      "src/components/builder/SectionRenderer.tsx",
      "utf8",
    );
    expect(renderer).not.toMatch(/songoskriti|somvabona/i);
    expect(renderer).not.toMatch(/themeKey\s*(===|!==|==|!=)/);
  });
});
