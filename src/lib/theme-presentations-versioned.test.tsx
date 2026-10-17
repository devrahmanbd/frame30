/**
 * Item 8 / Pass 1 — versioned namespaced presentation contract.
 *
 * Themes dress built-in AND compatible third-party widgets through a
 * registration keyed by (owner, widget id, version range) with a builder-API
 * compatibility floor. Resolution is deterministic per the rules documented
 * on `resolveVersionedPresentation` (owner-scoped, version-gated, floor-gated,
 * specificity-ordered, first-wins ties) and never throws.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import {
  clearThemePresentations,
  registerVersionedPresentation,
  resolveVersionedPresentation,
} from "./theme-presentations";
import {
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "@/components/builder/widgets";

const OWNER_A = "versioned-alpha";
const OWNER_B = "versioned-beta";

const AlphaHero: WidgetComponent = ({ section }) => (
  <section data-dressing="alpha-hero">
    {String(section.props.title ?? "")}
  </section>
);
const BetaHero: WidgetComponent = ({ section }) => (
  <div data-dressing="beta-hero">
    <span>{String(section.props.title ?? "")}</span>
  </div>
);
const AlphaReviews: WidgetComponent = ({ section }) => (
  <aside data-dressing="alpha-reviews">
    {String(section.props.title ?? "")}
  </aside>
);

function heroSection(): Section {
  const base = newSection("hero");
  return {
    ...base,
    id: "versioned-hero",
    props: { ...base.props, title: "Versioned hero" },
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

afterEach(() => {
  clearThemePresentations();
  vi.restoreAllMocks();
});

describe("versioned registration key", () => {
  it("keys by (owner, widget id, range): same widget, two owners, isolated", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
    });
    registerVersionedPresentation({
      owner: OWNER_B,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: BetaHero,
    });
    expect(resolveVersionedPresentation(OWNER_A, "builtin:hero")).toBe(
      AlphaHero,
    );
    expect(resolveVersionedPresentation(OWNER_B, "builtin:hero")).toBe(
      BetaHero,
    );
  });

  it("dresses built-in AND third-party widget ids", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
    });
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "plugin:acme/reviews",
      versionRange: "^1.0.0",
      component: AlphaReviews,
    });
    expect(resolveVersionedPresentation(OWNER_A, "builtin:hero")).toBe(
      AlphaHero,
    );
    expect(
      resolveVersionedPresentation(OWNER_A, "plugin:acme/reviews", {
        widgetVersion: "1.2.0",
      }),
    ).toBe(AlphaReviews);
  });

  it("is first-wins on the exact (owner, widget, range) triple", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
    });
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: BetaHero,
    });
    expect(warn).toHaveBeenCalled();
    expect(resolveVersionedPresentation(OWNER_A, "builtin:hero")).toBe(
      AlphaHero,
    );
  });

  it("clears with the shared test reset", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
    });
    clearThemePresentations();
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero"),
    ).toBeUndefined();
  });
});

describe("version gating", () => {
  it("matches exact, caret, tilde and comparator ranges", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "1.2.3",
      component: AlphaHero,
    });
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        widgetVersion: "1.2.3",
      }),
    ).toBe(AlphaHero);
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        widgetVersion: "1.2.4",
      }),
    ).toBeUndefined();
  });

  it("caret spans the compatible major line, tilde the minor line", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "^1.2.0",
      component: AlphaHero,
    });
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        widgetVersion: "1.9.0",
      }),
    ).toBe(AlphaHero);
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        widgetVersion: "2.0.0",
      }),
    ).toBeUndefined();

    clearThemePresentations();
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "~1.2.0",
      component: AlphaHero,
    });
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        widgetVersion: "1.2.9",
      }),
    ).toBe(AlphaHero);
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        widgetVersion: "1.3.0",
      }),
    ).toBeUndefined();
  });

  it("comparator sets bound both sides", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "plugin:acme/reviews",
      versionRange: ">=1.0.0 <2.0.0",
      component: AlphaReviews,
    });
    expect(
      resolveVersionedPresentation(OWNER_A, "plugin:acme/reviews", {
        widgetVersion: "1.99.9",
      }),
    ).toBe(AlphaReviews);
    expect(
      resolveVersionedPresentation(OWNER_A, "plugin:acme/reviews", {
        widgetVersion: "2.0.0",
      }),
    ).toBeUndefined();
    expect(
      resolveVersionedPresentation(OWNER_A, "plugin:acme/reviews", {
        widgetVersion: "0.9.9",
      }),
    ).toBeUndefined();
  });

  it("an unknown widget version matches only a wildcard dressing", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "^1.0.0",
      component: AlphaHero,
    });
    // No version evidence: a pinned range must NOT render (stale-version risk).
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero"),
    ).toBeUndefined();

    clearThemePresentations();
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
    });
    expect(resolveVersionedPresentation(OWNER_A, "builtin:hero")).toBe(
      AlphaHero,
    );
  });
});

describe("deterministic resolution order", () => {
  it("prefers the most specific range; ties keep the first registration", () => {
    const Wild: WidgetComponent = () => null;
    const Ranged: WidgetComponent = () => null;
    const Exact: WidgetComponent = () => null;
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: Wild,
    });
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "^1.0.0",
      component: Ranged,
    });
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "1.2.3",
      component: Exact,
    });
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        widgetVersion: "1.2.3",
      }),
    ).toBe(Exact);
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        widgetVersion: "1.4.0",
      }),
    ).toBe(Ranged);
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        widgetVersion: "2.0.0",
      }),
    ).toBe(Wild);
  });

  it("is stable across repeated lookups", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "1.2.3",
      component: AlphaHero,
    });
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: BetaHero,
    });
    const first = resolveVersionedPresentation(OWNER_A, "builtin:hero", {
      widgetVersion: "1.2.3",
    });
    const second = resolveVersionedPresentation(OWNER_A, "builtin:hero", {
      widgetVersion: "1.2.3",
    });
    expect(first).toBe(AlphaHero);
    expect(second).toBe(first);
  });
});

describe("builder-API compatibility floor", () => {
  it("holds the floor: below-floor runtimes miss, at/above hit", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      minBuilderApi: "3.1.0",
      component: AlphaHero,
    });
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        builderApi: "3.0.9",
      }),
    ).toBeUndefined();
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        builderApi: "3.1.0",
      }),
    ).toBe(AlphaHero);
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        builderApi: "3.2.0",
      }),
    ).toBe(AlphaHero);
  });

  it("entries without a floor match any runtime", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
    });
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        builderApi: "1.0.0",
      }),
    ).toBe(AlphaHero);
    expect(resolveVersionedPresentation(OWNER_A, "builtin:hero")).toBe(
      AlphaHero,
    );
  });
});

describe("never-throw, never cross-owner", () => {
  it("falls back instead of leaking another owner's dressing", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
    });
    expect(
      resolveVersionedPresentation(OWNER_B, "builtin:hero", {
        fallback: BetaHero,
      }),
    ).toBe(BetaHero);
    expect(
      resolveVersionedPresentation(OWNER_B, "builtin:hero"),
    ).toBeUndefined();
    expect(
      resolveVersionedPresentation("no-such-owner", "builtin:hero", {
        fallback: BetaHero,
      }),
    ).toBe(BetaHero);
  });

  it("never throws on garbage input", () => {
    for (const bad of ["", "   ", null, undefined, 42, {}]) {
      let out: unknown = "unset";
      expect(() => {
        out = resolveVersionedPresentation(bad as never, "builtin:hero");
      }).not.toThrow();
      expect(out).toBeUndefined();
    }
    expect(() =>
      resolveVersionedPresentation(OWNER_A, null as never),
    ).not.toThrow();
    expect(() => registerVersionedPresentation(null as never)).not.toThrow();
    expect(() =>
      registerVersionedPresentation({
        owner: "",
        widgetId: "builtin:hero",
        versionRange: "*",
        component: AlphaHero,
      }),
    ).not.toThrow();
  });
});

describe("same section, two dressings", () => {
  it("renders different markup with identical data", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
    });
    registerVersionedPresentation({
      owner: OWNER_B,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: BetaHero,
    });
    const section = heroSection();
    const before = JSON.stringify(section);
    const alpha = renderDirect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero")!,
      section,
    );
    const beta = renderDirect(
      resolveVersionedPresentation(OWNER_B, "builtin:hero")!,
      section,
    );
    expect(alpha).toContain('data-dressing="alpha-hero"');
    expect(beta).toContain('data-dressing="beta-hero"');
    expect(alpha).not.toBe(beta);
    expect(alpha).toContain("Versioned hero");
    expect(beta).toContain("Versioned hero");
    expect(JSON.stringify(section)).toBe(before);
  });
});
