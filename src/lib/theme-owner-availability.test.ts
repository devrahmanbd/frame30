/**
 * Frame30 consolidation — Pass 3 (TDD): ONE owner-availability gate honored
 * by ALL THREE presentation maps (core PRESENTATIONS, THEME_OWNED_COMPONENTS,
 * versioned dressings) + core key normalization (trim+lowercase) at register
 * and resolve.
 *
 * - `setThemeOwnerAvailability(owner, available)` flips resolution on every
 *   map (unavailable ⇒ miss/fallback with data preserved, never a foreign
 *   render); flips are reversible and isolated per owner.
 * - `registerThemePresentation` / `resolveThemePresentation` and
 *   `registerThemeOwnedComponent` / `resolveThemeOwnedComponent` normalize
 *   keys (trim+lowercase): case/padding variants address the SAME entry.
 * - Versioned owners stay case-sensitive (pinned by the existing adversarial
 *   suite); the unified gate additionally applies to them case-insensitively.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkVersionedCompatibility,
  clearThemePresentations,
  isThemeOwnerAvailable,
  isVersionedOwnerAvailable,
  migrateVersionedProps,
  registerThemeOwnedComponent,
  registerThemePresentation,
  registerVersionedPresentation,
  resolveThemeOwnedComponent,
  resolveThemePresentation,
  resolveVersionedPresentation,
  setThemeOwnerAvailability,
  setVersionedPresentationAvailability,
} from "./theme-presentations";
import type { WidgetComponent } from "@/components/builder/widgets";

const OWNER_A = "avail-alpha";
const OWNER_B = "avail-beta";

const AlphaHeading: WidgetComponent = () => null;
const BetaHeading: WidgetComponent = () => null;
const AlphaOwned: WidgetComponent = () => null;
const AlphaDressed: WidgetComponent = () => null;
const Fallback: WidgetComponent = () => null;

afterEach(() => {
  clearThemePresentations();
  vi.restoreAllMocks();
});

describe("Pass 3 — unified availability gates the core map", () => {
  it("unavailable owners miss to the fallback (never a foreign render)", () => {
    registerThemePresentation(OWNER_A, "heading", AlphaHeading);
    expect(resolveThemePresentation(OWNER_A, "heading")).toBe(AlphaHeading);
    setThemeOwnerAvailability(OWNER_A, false);
    expect(resolveThemePresentation(OWNER_A, "heading", Fallback)).toBe(
      Fallback,
    );
    expect(resolveThemePresentation(OWNER_A, "heading")).toBeUndefined();
  });

  it("flips are reversible and isolated per owner", () => {
    registerThemePresentation(OWNER_A, "heading", AlphaHeading);
    registerThemePresentation(OWNER_B, "heading", BetaHeading);
    setThemeOwnerAvailability(OWNER_A, false);
    expect(resolveThemePresentation(OWNER_A, "heading")).toBeUndefined();
    expect(resolveThemePresentation(OWNER_B, "heading")).toBe(BetaHeading);
    setThemeOwnerAvailability(OWNER_A, true);
    expect(resolveThemePresentation(OWNER_A, "heading")).toBe(AlphaHeading);
  });

  it("padded owner keys flip the same owner", () => {
    registerThemePresentation(OWNER_A, "heading", AlphaHeading);
    setThemeOwnerAvailability(`  ${OWNER_A}  `, false);
    expect(resolveThemePresentation(OWNER_A, "heading")).toBeUndefined();
    expect(isThemeOwnerAvailable(OWNER_A)).toBe(false);
  });
});

describe("Pass 3 — unified availability gates theme-owned components", () => {
  it("unavailable owners resolve to undefined (recoverable placeholder path)", () => {
    registerThemeOwnedComponent(`theme:${OWNER_A}/widget-a`, AlphaOwned);
    expect(resolveThemeOwnedComponent(`theme:${OWNER_A}/widget-a`)).toBe(
      AlphaOwned,
    );
    setThemeOwnerAvailability(OWNER_A, false);
    expect(
      resolveThemeOwnedComponent(`theme:${OWNER_A}/widget-a`),
    ).toBeUndefined();
    setThemeOwnerAvailability(OWNER_A, true);
    expect(resolveThemeOwnedComponent(`theme:${OWNER_A}/widget-a`)).toBe(
      AlphaOwned,
    );
  });

  it("disabling one owner never touches another", () => {
    registerThemeOwnedComponent(`theme:${OWNER_A}/widget-a`, AlphaOwned);
    registerThemeOwnedComponent(`theme:${OWNER_B}/widget-b`, BetaHeading);
    setThemeOwnerAvailability(OWNER_A, false);
    expect(
      resolveThemeOwnedComponent(`theme:${OWNER_A}/widget-a`),
    ).toBeUndefined();
    expect(resolveThemeOwnedComponent(`theme:${OWNER_B}/widget-b`)).toBe(
      BetaHeading,
    );
  });
});

describe("Pass 3 — unified availability gates versioned dressings", () => {
  function dressAlpha() {
    registerVersionedPresentation({
      owner: OWNER_A,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: AlphaDressed,
    });
  }

  it("unavailable owners miss resolution, compat and migration", () => {
    dressAlpha();
    const opts = { widgetVersion: "1.4.0", builderApi: "3.1.0" };
    expect(resolveVersionedPresentation(OWNER_A, "builtin:hero", opts)).toBe(
      AlphaDressed,
    );
    setThemeOwnerAvailability(OWNER_A, false);
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero", {
        ...opts,
        fallback: Fallback,
      }),
    ).toBe(Fallback);
    expect(checkVersionedCompatibility(OWNER_A, "builtin:hero", opts)).toEqual({
      compatible: false,
      reason: "unavailable",
    });
    expect(
      migrateVersionedProps(OWNER_A, "builtin:hero", { title: "Kept" }, opts),
    ).toMatchObject({ ok: false, reason: "unavailable" });
    setThemeOwnerAvailability(OWNER_A, true);
    expect(resolveVersionedPresentation(OWNER_A, "builtin:hero", opts)).toBe(
      AlphaDressed,
    );
  });

  it("versioned API keeps working independently (either false blocks)", () => {
    dressAlpha();
    setVersionedPresentationAvailability(OWNER_A, false);
    expect(isVersionedOwnerAvailable(OWNER_A)).toBe(false);
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero"),
    ).toBeUndefined();
    // Unified flip back does NOT clear the versioned flag (documented
    // OR-of-unavailable): the versioned API re-enables its own flag.
    setThemeOwnerAvailability(OWNER_A, true);
    expect(
      resolveVersionedPresentation(OWNER_A, "builtin:hero"),
    ).toBeUndefined();
    setVersionedPresentationAvailability(OWNER_A, true);
    expect(resolveVersionedPresentation(OWNER_A, "builtin:hero")).toBe(
      AlphaDressed,
    );
  });

  it("availability gates reject garbage without throwing or flipping state", () => {
    dressAlpha();
    expect(() => setThemeOwnerAvailability("", true)).not.toThrow();
    expect(() =>
      setThemeOwnerAvailability(OWNER_A, "yes" as never),
    ).not.toThrow();
    expect(() => setThemeOwnerAvailability(null, undefined)).not.toThrow();
    expect(isThemeOwnerAvailable(OWNER_A)).toBe(true);
    expect(isThemeOwnerAvailable("")).toBe(false);
    expect(isThemeOwnerAvailable(null)).toBe(false);
    expect(resolveVersionedPresentation(OWNER_A, "builtin:hero")).toBe(
      AlphaDressed,
    );
  });

  it("clearThemePresentations resets the unified gate", () => {
    dressAlpha();
    setThemeOwnerAvailability(OWNER_A, false);
    expect(isThemeOwnerAvailable(OWNER_A)).toBe(false);
    clearThemePresentations();
    expect(isThemeOwnerAvailable(OWNER_A)).toBe(true);
  });
});

describe("Pass 3 — core key normalization (trim+lowercase)", () => {
  it("case/padding variants address the same core presentation", () => {
    registerThemePresentation("  Avail-Alpha  ", "heading", AlphaHeading);
    expect(resolveThemePresentation(OWNER_A, "heading")).toBe(AlphaHeading);
    expect(resolveThemePresentation("  AVAIL-ALPHA  ", "heading")).toBe(
      AlphaHeading,
    );
    expect(resolveThemePresentation(OWNER_A, "  Heading  " as never)).toBe(
      AlphaHeading,
    );
  });

  it("duplicates across case variants warn and keep the first", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerThemePresentation(OWNER_A, "heading", AlphaHeading);
    registerThemePresentation(
      "  AVAIL-ALPHA  ",
      "  HEADING  " as never,
      BetaHeading,
    );
    expect(warn).toHaveBeenCalled();
    expect(resolveThemePresentation(OWNER_A, "heading")).toBe(AlphaHeading);
  });

  it("blank theme keys register nothing and resolve to fallback", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerThemePresentation("   ", "heading", AlphaHeading);
    expect(warn).toHaveBeenCalled();
    expect(resolveThemePresentation("   ", "heading", Fallback)).toBe(Fallback);
    expect(resolveThemePresentation(null, "heading")).toBeUndefined();
    expect(resolveThemePresentation(undefined, "heading")).toBeUndefined();
  });

  it("theme-owned ids normalize case/padding at register and resolve", () => {
    registerThemeOwnedComponent("  THEME:Avail-Alpha/Widget-A  ", AlphaOwned);
    expect(resolveThemeOwnedComponent(`theme:${OWNER_A}/widget-a`)).toBe(
      AlphaOwned,
    );
    expect(resolveThemeOwnedComponent("  THEME:AVAIL-ALPHA/WIDGET-A  ")).toBe(
      AlphaOwned,
    );
  });

  it("theme-owned registration still rejects non-theme ids", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerThemeOwnedComponent("builtin:hero", AlphaOwned);
    expect(warn).toHaveBeenCalled();
    expect(resolveThemeOwnedComponent("builtin:hero")).toBeUndefined();
  });

  it("core resolution never throws on garbage input", () => {
    registerThemePresentation(OWNER_A, "heading", AlphaHeading);
    for (const bad of [42, {}, [], true]) {
      expect(() =>
        resolveThemePresentation(bad as never, "heading"),
      ).not.toThrow();
      expect(resolveThemePresentation(bad as never, "heading")).toBeUndefined();
      expect(() => resolveThemeOwnedComponent(bad as never)).not.toThrow();
    }
    expect(() =>
      registerThemePresentation(OWNER_A, "heading", null as never),
    ).not.toThrow();
  });
});
