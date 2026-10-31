/**
 * Item 8 / Pass 2 — theme switching preserves settings; disabled owners
 * recover with data preserved.
 *
 * - `checkVersionedCompatibility` gates a switch with an explicit reason
 *   (never a silent foreign render).
 * - `migrateVersionedProps` carries settings forward (validated migration or
 *   pass-through) or returns an explicit incompatibility holding the
 *   preserved props.
 * - `setVersionedPresentationAvailability` models an owning theme
 *   disabled/unavailable: resolution misses, compat reports `unavailable`,
 *   migration preserves props; re-enabling recovers byte-identically.
 * - The Songoskriti dressing and a synthetic foreign dressing prove the
 *   switch end to end: the same authored props render under each owner
 *   with its own markup, and the legacy `headline` key migrates to `title`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import {
  checkVersionedCompatibility,
  clearThemePresentations,
  isVersionedOwnerAvailable,
  migrateVersionedProps,
  registerVersionedPresentation,
  resolveVersionedPresentation,
  setVersionedPresentationAvailability,
} from "./theme-presentations";
import {
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "@/components/builder/widgets";
import { SongoskritiDressedHeroPresentation } from "./themes/songoskriti/dressed-hero-presentation";
import {
  SONGOSKRITI_HERO_DRESSING,
  SONGOSKRITI_REVIEWS_DRESSING,
} from "./themes/songoskriti/dressed-hero-dressings";
import type { VersionedPresentationEntry } from "./theme-presentations";

/**
 * Synthetic foreign-theme dressing (test fixture only — NOT a shipped
 * theme). The live catalogue ships Songoskriti alone; this wildcard
 * dressing keeps the cross-owner switch property provable without a
 * second real theme.
 */
const ForeignDressedHeroPresentation: WidgetComponent = ({ section }) => (
  <section data-dressing="acme-hero">
    {String(section.props.title ?? "")}
  </section>
);

const FOREIGN_HERO_DRESSING: VersionedPresentationEntry = {
  owner: "acme-pack",
  widgetId: "builtin:hero",
  versionRange: "*",
  component: ForeignDressedHeroPresentation,
};

const OWNER_A = "switch-alpha";
const OWNER_B = "switch-beta";

const AlphaHero: WidgetComponent = ({ section }) => (
  <section data-dressing="switch-alpha">
    {String(section.props.title ?? "")}
  </section>
);
const BetaHero: WidgetComponent = ({ section }) => (
  <div data-dressing="switch-beta">{String(section.props.title ?? "")}</div>
);

function heroSection(props: Record<string, unknown> = {}): Section {
  const base = newSection("hero");
  return {
    ...base,
    id: "switch-hero",
    props: { ...base.props, title: "Switch hero", ...props },
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
});

describe("switch compatibility gate", () => {
  it("reports compatible for a dressed, in-range, above-floor widget", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "^1.0.0",
      minBuilderApi: "3.1.0",
      component: AlphaHero,
    });
    expect(
      checkVersionedCompatibility(OWNER_A, "builtin:hero", {
        widgetVersion: "1.4.0",
        builderApi: "3.1.0",
      }),
    ).toEqual({ compatible: true, reason: "compatible" });
  });

  it("reports bad_key for garbage owner/widget ids", () => {
    expect(checkVersionedCompatibility("", "builtin:hero")).toEqual({
      compatible: false,
      reason: "bad_key",
    });
    expect(checkVersionedCompatibility(OWNER_A, "not-namespaced")).toEqual({
      compatible: false,
      reason: "bad_key",
    });
    expect(checkVersionedCompatibility(null, undefined)).toEqual({
      compatible: false,
      reason: "bad_key",
    });
  });

  it("reports unknown when the target dresses nothing", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
    });
    expect(checkVersionedCompatibility(OWNER_B, "builtin:hero")).toEqual({
      compatible: false,
      reason: "unknown",
    });
  });

  it("reports incompatible-version for a stale dressing after update", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "^1.0.0",
      component: AlphaHero,
    });
    expect(
      checkVersionedCompatibility(OWNER_A, "builtin:hero", {
        widgetVersion: "2.0.0",
      }),
    ).toEqual({ compatible: false, reason: "incompatible-version" });
  });

  it("reports incompatible-api below the floor", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      minBuilderApi: "3.1.0",
      component: AlphaHero,
    });
    expect(
      checkVersionedCompatibility(OWNER_A, "builtin:hero", {
        builderApi: "3.0.0",
      }),
    ).toEqual({ compatible: false, reason: "incompatible-api" });
  });

  it("never throws on garbage", () => {
    expect(() =>
      checkVersionedCompatibility(null, null, {
        widgetVersion: 42 as never,
        builderApi: {} as never,
      }),
    ).not.toThrow();
    expect(checkVersionedCompatibility(null, null)).toEqual({
      compatible: false,
      reason: "bad_key",
    });
  });
});

describe("settings migration", () => {
  it("passes settings through when the target defines no migrate hook", () => {
    registerVersionedPresentation({
      owner: OWNER_B,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: BetaHero,
    });
    const prev = { title: "Kept", eyebrow: "Held", extra: 7 };
    const out = migrateVersionedProps(OWNER_B, "builtin:hero", prev);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected migration");
    expect(out.migrated).toBe(false);
    expect(out.props).toEqual(prev);
    expect(out.props).not.toBe(prev);
    // The source object is untouched.
    expect(prev).toEqual({ title: "Kept", eyebrow: "Held", extra: 7 });
  });

  it("runs the target migrate hook to carry legacy keys forward", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
      migrate: (prev) => ({
        ...prev,
        title: prev["headline"] ?? prev["title"],
      }),
    });
    const out = migrateVersionedProps(OWNER_A, "builtin:hero", {
      headline: "Legacy",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected migration");
    expect(out.migrated).toBe(true);
    expect(out.props).toMatchObject({ title: "Legacy" });
  });

  it("a null migrate result is an explicit incompatibility, props preserved", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
      migrate: () => null,
    });
    const prev = { title: "Kept" };
    const out = migrateVersionedProps(OWNER_A, "builtin:hero", prev);
    expect(out).toEqual({
      ok: false,
      reason: "incompatible",
      preservedProps: prev,
    });
  });

  it("a throwing or misshapen migrate hook fails closed with props preserved", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "1.0.0",
      component: AlphaHero,
      migrate: () => {
        throw new Error("boom");
      },
    });
    const prev = { title: "Kept" };
    expect(
      migrateVersionedProps(OWNER_A, "builtin:hero", prev, {
        toVersion: "1.0.0",
      }),
    ).toEqual({
      ok: false,
      reason: "migration-failed",
      preservedProps: prev,
    });

    clearThemePresentations();
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
      migrate: () => 42 as never,
    });
    expect(migrateVersionedProps(OWNER_A, "builtin:hero", prev)).toEqual({
      ok: false,
      reason: "migration-failed",
      preservedProps: prev,
    });
  });

  it("stale targets after an update refuse with the preserved props", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "^1.0.0",
      component: AlphaHero,
      migrate: (prev) => ({ ...prev }),
    });
    const prev = { title: "Kept" };
    expect(
      migrateVersionedProps(OWNER_A, "builtin:hero", prev, {
        toVersion: "2.0.0",
      }),
    ).toEqual({
      ok: false,
      reason: "incompatible-version",
      preservedProps: prev,
    });
  });

  it("never applies another owner's migrate hook", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
      migrate: () => ({ injected: "alpha" }),
    });
    registerVersionedPresentation({
      owner: OWNER_B,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: BetaHero,
    });
    const out = migrateVersionedProps(OWNER_B, "builtin:hero", {
      title: "Kept",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected migration");
    expect(out.props).toEqual({ title: "Kept" });
  });

  it("strips hostile keys from input and migrate output", () => {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
      migrate: (prev) => ({
        ...prev,
        title: "Clean",
        ["__proto__" as string]: { polluted: true },
      }),
    });
    const hostile = JSON.parse(
      '{"title":"Kept","__proto__":{"polluted":true},"constructor":1}',
    );
    const out = migrateVersionedProps(OWNER_A, "builtin:hero", hostile);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected migration");
    expect(out.props).toEqual({ title: "Clean" });
    expect(Object.prototype.hasOwnProperty.call(out.props, "__proto__")).toBe(
      false,
    );
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("never throws on garbage", () => {
    for (const bad of [null, undefined, 42, "props", []]) {
      expect(() =>
        migrateVersionedProps(null, null, bad, { toVersion: 1 as never }),
      ).not.toThrow();
    }
    expect(migrateVersionedProps(null, null, {})).toEqual({
      ok: false,
      reason: "bad_key",
      preservedProps: {},
    });
  });
});

describe("disabled/unavailable owning theme", () => {
  function dressAlpha() {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaHero,
    });
  }

  it("recovers with data preserved while unavailable, byte-identical on return", () => {
    dressAlpha();
    const prev = { title: "Kept" };
    expect(isVersionedOwnerAvailable(OWNER_A)).toBe(true);

    setVersionedPresentationAvailability(OWNER_A, false);
    expect(isVersionedOwnerAvailable(OWNER_A)).toBe(false);
    // Resolution misses (caller keeps the recoverable placeholder).
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        fallback: BetaHero,
      }),
    ).toBe(BetaHero);
    // Compat is explicit, migration preserves.
    expect(checkVersionedCompatibility(OWNER_A, "builtin:hero")).toEqual({
      compatible: false,
      reason: "unavailable",
    });
    expect(migrateVersionedProps(OWNER_A, "builtin:hero", prev)).toEqual({
      ok: false,
      reason: "unavailable",
      preservedProps: prev,
    });

    // Re-enabling recovers the exact dressing (no stale state).
    setVersionedPresentationAvailability(OWNER_A, true);
    expect(resolveVersionedPresentation(OWNER_A, "builtin:hero")).toBe(
      AlphaHero,
    );
    expect(checkVersionedCompatibility(OWNER_A, "builtin:hero")).toEqual({
      compatible: true,
      reason: "compatible",
    });
  });

  it("disabling one owner never touches another owner's dressings", () => {
    dressAlpha();
    registerVersionedPresentation({
      owner: OWNER_B,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: BetaHero,
    });
    setVersionedPresentationAvailability(OWNER_A, false);
    expect(resolveVersionedPresentation(OWNER_B, "builtin:hero")).toBe(
      BetaHero,
    );
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero"),
    ).toBeUndefined();
  });

  it("rejects garbage availability updates without throwing", () => {
    dressAlpha();
    expect(() => setVersionedPresentationAvailability("", true)).not.toThrow();
    expect(() =>
      setVersionedPresentationAvailability(OWNER_A, "yes" as never),
    ).not.toThrow();
    expect(() =>
      setVersionedPresentationAvailability(null, undefined),
    ).not.toThrow();
    expect(isVersionedOwnerAvailable(OWNER_A)).toBe(true);
    expect(resolveVersionedPresentation(OWNER_A, "builtin:hero")).toBe(
      AlphaHero,
    );
  });
});

describe("theme-owned switch end to end", () => {
  beforeEach(() => {
    // Module-init registrations are wiped by the shared reset, so the suite
    // re-registers the theme-owned descriptors (first-wins, idempotent).
    registerVersionedPresentation(SONGOSKRITI_HERO_DRESSING);
    registerVersionedPresentation(SONGOSKRITI_REVIEWS_DRESSING);
    registerVersionedPresentation(FOREIGN_HERO_DRESSING);
  });

  it("the same authored props render under each owner with its own markup", () => {
    const section = heroSection({ title: "Heritage", eyebrow: "Drop" });
    const before = JSON.stringify(section);
    const songoskriti = renderDirect(
      resolveVersionedPresentation("songoskriti", "builtin:hero", {
        widgetVersion: "1.2.0",
        builderApi: "3.1.0",
      })!,
      section,
    );
    const foreign = renderDirect(
      resolveVersionedPresentation("acme-pack", "builtin:hero", {
        widgetVersion: "9.9.9",
      })!,
      section,
    );
    expect(songoskriti).toContain('data-dressing="songoskriti-hero"');
    expect(foreign).toContain('data-dressing="acme-hero"');
    expect(songoskriti).not.toBe(foreign);
    expect(songoskriti).toContain("Heritage");
    expect(foreign).toContain("Heritage");
    expect(JSON.stringify(section)).toBe(before);
  });

  it("switching owners carries settings via the target migrate hook", () => {
    // Authored under a legacy key; the target migrates headline -> title.
    // Version/API evidence is required: the pinned songoskriti dressing
    // refuses without it (fail closed, never a silent foreign render).
    const carried = migrateVersionedProps(
      "songoskriti",
      "builtin:hero",
      {
        headline: "Legacy title",
        eyebrow: "Drop",
      },
      { toVersion: "1.2.0", builderApi: "3.1.0" },
    );
    expect(carried.ok).toBe(true);
    if (!carried.ok) throw new Error("expected migration");
    expect(carried.migrated).toBe(true);
    expect(carried.props).toMatchObject({
      title: "Legacy title",
      eyebrow: "Drop",
    });

    const section = heroSection(carried.props);
    expect(renderDirect(SongoskritiDressedHeroPresentation, section)).toContain(
      "Legacy title",
    );
    expect(renderDirect(ForeignDressedHeroPresentation, section)).toContain(
      "Legacy title",
    );
  });

  it("foreign owners never resolve the songoskriti dressing", () => {
    expect(
      resolveVersionedPresentation("acme-pack", "plugin:acme/reviews", {
        widgetVersion: "1.2.0",
      }),
    ).toBeUndefined();
    expect(
      checkVersionedCompatibility("acme-pack", "plugin:acme/reviews", {
        widgetVersion: "1.2.0",
      }),
    ).toEqual({ compatible: false, reason: "unknown" });
  });

  it("stale widget lines miss the pinned songoskriti dressing", () => {
    expect(
      resolveVersionedPresentation("songoskriti", "builtin:hero", {
        widgetVersion: "2.0.0",
        builderApi: "3.1.0",
      }),
    ).toBeUndefined();
    expect(
      checkVersionedCompatibility("songoskriti", "builtin:hero", {
        widgetVersion: "2.0.0",
        builderApi: "3.1.0",
      }),
    ).toEqual({ compatible: false, reason: "incompatible-version" });
  });
});
