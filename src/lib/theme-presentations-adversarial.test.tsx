/**
 * Item 8 / Pass 3 — adversarial: versioned presentation contract under attack.
 *
 * - Cross-owner substitution: an attacker owner registers the victim's widget
 *   id (even the victim's exact range triple) and never captures the victim's
 *   resolution, compatibility, or migration paths.
 * - Version lies: garbage / missing / padded / suffixed widget versions and
 *   builder APIs fail closed — pinned ranges never render without evidence,
 *   only wildcards match an unknown version, only floor-less dressings match
 *   an unknown runtime.
 * - Stale presentations after update: a widget that moves off the dressed
 *   line misses resolution, reports an explicit incompatibility, and migrates
 *   to a preserved-props refusal — never a silent stale render.
 * - Hostile registration payloads: non-objects, proto-chain tricks, throwing
 *   getters, overlong keys, unparsable ranges, bad floors, non-components,
 *   and mutating migrate hooks are all dropped or contained; registration
 *   never throws and the table stays intact for legitimate owners.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import {
  checkVersionedCompatibility,
  clearThemePresentations,
  hasGenericPresentation,
  isThemeOwnerAvailable,
  isVersionedOwnerAvailable,
  migrateVersionedProps,
  registerGenericPresentation,
  registerVersionedPresentation,
  resolveGenericPresentation,
  resolveVersionedPresentation,
  setThemeOwnerAvailability,
  setVersionedPresentationAvailability,
} from "./theme-presentations";
import {
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "@/components/builder/widgets";

const VICTIM = "adv-victim";
const ATTACKER = "adv-attacker";

const VictimHero: WidgetComponent = ({ section }) => (
  <section data-dressing="victim-hero">
    {String(section.props.title ?? "")}
  </section>
);
const EvilHero: WidgetComponent = ({ section }) => (
  <section data-dressing="evil-hero">
    {String(section.props.title ?? "")}
  </section>
);

function heroSection(): Section {
  const base = newSection("hero");
  return {
    ...base,
    id: "adv-hero",
    props: { ...base.props, title: "Adversarial hero" },
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

function dressVictim() {
  registerVersionedPresentation({
    owner: VICTIM,
    widgetId: "builtin:hero",
    versionRange: "^1.0.0",
    minBuilderApi: "3.1.0",
    component: VictimHero,
    migrate: (prev) => ({ ...prev }),
  });
}

afterEach(() => {
  clearThemePresentations();
  vi.restoreAllMocks();
});

describe("cross-owner substitution attempts", () => {
  it("claiming the victim's widget id under another owner never captures the victim", () => {
    dressVictim();
    registerVersionedPresentation({
      owner: ATTACKER,
      widgetId: "builtin:hero",
      versionRange: "^1.0.0",
      component: EvilHero,
    });
    const opts = { widgetVersion: "1.4.0", builderApi: "3.1.0" };
    expect(resolveVersionedPresentation(VICTIM, "builtin:hero", opts)).toBe(
      VictimHero,
    );
    expect(resolveVersionedPresentation(ATTACKER, "builtin:hero", opts)).toBe(
      EvilHero,
    );
    // Rendered markup proves the victim's brand, not the attacker's.
    const html = renderDirect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", opts)!,
      heroSection(),
    );
    expect(html).toContain('data-dressing="victim-hero"');
    expect(html).not.toContain("evil-hero");
  });

  it("re-registering the victim's exact triple keeps the first component", () => {
    dressVictim();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "^1.0.0",
      component: EvilHero,
    });
    expect(warn).toHaveBeenCalled();
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "1.4.0",
        builderApi: "3.1.0",
      }),
    ).toBe(VictimHero);
  });

  it("a duplicate triple with a different floor is still a duplicate", () => {
    dressVictim();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Same (owner, widget, range); only the floor differs — first wins.
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "^1.0.0",
      minBuilderApi: "9.9.9",
      component: EvilHero,
    });
    expect(warn).toHaveBeenCalled();
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "1.4.0",
        builderApi: "3.1.0",
      }),
    ).toBe(VictimHero);
  });

  it("the attacker's migrate hook never runs for the victim owner", () => {
    dressVictim();
    registerVersionedPresentation({
      owner: ATTACKER,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: EvilHero,
      migrate: () => ({ injected: "evil" }),
    });
    // Target evidence selects the victim's own dressing (pinned ranges
    // refuse without it); the evil hook under the other owner never runs.
    const out = migrateVersionedProps(
      VICTIM,
      "builtin:hero",
      { title: "Kept" },
      { toVersion: "1.4.0", builderApi: "3.1.0" },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected migration");
    expect(out.migrated).toBe(true);
    expect(out.props).toEqual({ title: "Kept" });
  });

  it("compat for the victim never reports the attacker's dressing", () => {
    registerVersionedPresentation({
      owner: ATTACKER,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: EvilHero,
    });
    expect(checkVersionedCompatibility(VICTIM, "builtin:hero")).toEqual({
      compatible: false,
      reason: "unknown",
    });
    expect(
      migrateVersionedProps(VICTIM, "builtin:hero", { title: "K" }),
    ).toEqual({
      ok: false,
      reason: "unknown",
      preservedProps: { title: "K" },
    });
  });

  it("padded owner keys normalize, but case variants stay isolated", () => {
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: VictimHero,
    });
    // Documented hygiene: surrounding whitespace trims to the same owner.
    expect(resolveVersionedPresentation(`  ${VICTIM}  `, "builtin:hero")).toBe(
      VictimHero,
    );
    // Owners are opaque and case-sensitive: no aliasing across case.
    expect(
      resolveVersionedPresentation(VICTIM.toUpperCase(), "builtin:hero"),
    ).toBeUndefined();
  });

  it("disabling the attacker never touches the victim, and vice versa", () => {
    dressVictim();
    registerVersionedPresentation({
      owner: ATTACKER,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: EvilHero,
    });
    setVersionedPresentationAvailability(ATTACKER, false);
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "1.4.0",
        builderApi: "3.1.0",
      }),
    ).toBe(VictimHero);
    expect(
      resolveVersionedPresentation(ATTACKER, "builtin:hero"),
    ).toBeUndefined();
  });
});

describe("version lies", () => {
  function dressPinnedAndWild() {
    const Wild: WidgetComponent = () => null;
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "^1.0.0",
      component: VictimHero,
    });
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: Wild,
    });
    return { Wild };
  }

  it("garbage widget versions match only the wildcard dressing", () => {
    const { Wild } = dressPinnedAndWild();
    for (const lie of [
      "not-a-version",
      "",
      "   ",
      "1.2",
      "v1",
      "1.2.3.4",
      "99999999999.0.0",
      ">=1.0.0",
      "latest",
      "1.2.x",
    ]) {
      expect(
        resolveVersionedPresentation(VICTIM, "builtin:hero", {
          widgetVersion: lie,
        }),
      ).toBe(Wild);
    }
  });

  it("non-string widget versions are treated as absent (wildcard only)", () => {
    const { Wild } = dressPinnedAndWild();
    for (const lie of [42, true, {}, [], null, undefined]) {
      expect(
        resolveVersionedPresentation(VICTIM, "builtin:hero", {
          widgetVersion: lie as never,
        }),
      ).toBe(Wild);
    }
  });

  it("a lone pinned dressing never renders without version evidence", () => {
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "1.2.3",
      component: VictimHero,
    });
    // No version at all, and a garbage version: both miss (no stale render).
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero"),
    ).toBeUndefined();
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "garbage!!",
      }),
    ).toBeUndefined();
  });

  it("padded and prefixed versions normalize to their triple", () => {
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "1.2.3",
      component: VictimHero,
    });
    for (const truth of ["  1.2.3  ", "v1.2.3", "=1.2.3"]) {
      expect(
        resolveVersionedPresentation(VICTIM, "builtin:hero", {
          widgetVersion: truth,
        }),
      ).toBe(VictimHero);
    }
  });

  it("build/prerelease suffixes do not escape the pinned triple", () => {
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "1.2.3",
      component: VictimHero,
    });
    // Suffixes are ignored for precedence (semver): same triple, same hit —
    // and a different triple still misses.
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "1.2.3+evil.build",
      }),
    ).toBe(VictimHero);
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "9.9.9+evil.build",
      }),
    ).toBeUndefined();
  });

  it("builder-API lies fail closed for floored dressings", () => {
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "*",
      minBuilderApi: "3.1.0",
      component: VictimHero,
    });
    for (const lie of ["garbage", "", "3.1", 42, null, undefined]) {
      expect(
        resolveVersionedPresentation(VICTIM, "builtin:hero", {
          builderApi: lie as never,
        }),
      ).toBeUndefined();
      expect(
        checkVersionedCompatibility(VICTIM, "builtin:hero", {
          widgetVersion: undefined,
          builderApi: lie as never,
        }),
      ).toEqual({ compatible: false, reason: "incompatible-api" });
    }
    // At the floor it holds.
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        builderApi: "3.1.0",
      }),
    ).toBe(VictimHero);
  });

  it("an =-prefixed pin normalizes to the bare exact triple (first wins)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const Comparator: WidgetComponent = () => null;
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "=1.2.3",
      component: Comparator,
    });
    // "=1.2.3" collapses to the exact "1.2.3" triple: same key, duplicate,
    // first registration kept — no shadow dressing can ride the same pin.
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "1.2.3",
      component: VictimHero,
    });
    expect(warn).toHaveBeenCalled();
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "1.2.3",
      }),
    ).toBe(Comparator);
  });

  it("bounded comparator sets outrank half-bounded ones; ties keep the first", () => {
    const Half: WidgetComponent = () => null;
    const Bounded: WidgetComponent = () => null;
    const TieA: WidgetComponent = () => null;
    const TieB: WidgetComponent = () => null;
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: ">=1.0.0",
      component: Half,
    });
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: ">=1.0.0 <2.0.0",
      component: Bounded,
    });
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "1.5.0",
      }),
    ).toBe(Bounded);

    clearThemePresentations();
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "^1.0.0",
      component: TieA,
    });
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "~1.2.0",
      component: TieB,
    });
    // Same specificity tier (3): first registration wins, deterministically.
    const first = resolveVersionedPresentation(VICTIM, "builtin:hero", {
      widgetVersion: "1.2.5",
    });
    expect(first).toBe(TieA);
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "1.2.5",
      }),
    ).toBe(first);
  });
});

describe("stale presentations after update", () => {
  it("a major-line update misses, reports, and preserves props", () => {
    dressVictim();
    const prev = { title: "Kept", eyebrow: "Held" };
    const opts = { widgetVersion: "2.0.0", builderApi: "3.1.0" };
    // No silent stale render of the ^1.0.0 dressing.
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        ...opts,
        fallback: EvilHero,
      }),
    ).toBe(EvilHero);
    expect(checkVersionedCompatibility(VICTIM, "builtin:hero", opts)).toEqual({
      compatible: false,
      reason: "incompatible-version",
    });
    expect(
      migrateVersionedProps(VICTIM, "builtin:hero", prev, {
        toVersion: "2.0.0",
        builderApi: "3.1.0",
      }),
    ).toEqual({
      ok: false,
      reason: "incompatible-version",
      preservedProps: prev,
    });
  });

  it("a layered wildcard survives the update while the pin refuses", () => {
    const Wild: WidgetComponent = () => null;
    dressVictim();
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: Wild,
    });
    // Old line: the specific pin wins.
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "1.4.0",
        builderApi: "3.1.0",
      }),
    ).toBe(VictimHero);
    // New line: the pin steps aside, the wildcard carries the render.
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "2.0.0",
        builderApi: "3.1.0",
      }),
    ).toBe(Wild);
  });

  it("an exact pin refuses the very next patch", () => {
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "1.2.3",
      component: VictimHero,
    });
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "1.2.4",
      }),
    ).toBeUndefined();
    expect(
      checkVersionedCompatibility(VICTIM, "builtin:hero", {
        widgetVersion: "1.2.4",
      }),
    ).toEqual({ compatible: false, reason: "incompatible-version" });
  });

  it("migration to a stale line refuses with the authored props intact", () => {
    const prev = { title: "Kept" };
    dressVictim();
    const out = migrateVersionedProps(VICTIM, "builtin:hero", prev, {
      fromVersion: "1.4.0",
      toVersion: "2.0.0",
      builderApi: "3.1.0",
    });
    expect(out).toEqual({
      ok: false,
      reason: "incompatible-version",
      preservedProps: prev,
    });
  });
});

describe("hostile registration payloads", () => {
  it("non-object entries are dropped without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const hostile of [null, undefined, 42, "builtin:hero", [], true]) {
      expect(() =>
        registerVersionedPresentation(hostile as never),
      ).not.toThrow();
    }
    expect(warn).toHaveBeenCalled();
    // The table still accepts legitimate work afterwards.
    dressVictim();
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "1.4.0",
        builderApi: "3.1.0",
      }),
    ).toBe(VictimHero);
  });

  it("throwing getters and frozen entries never break registration", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const throwing = Object.freeze({
      get owner(): string {
        throw new Error("getter boom");
      },
    });
    expect(() =>
      registerVersionedPresentation(throwing as never),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    dressVictim();
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "1.4.0",
        builderApi: "3.1.0",
      }),
    ).toBe(VictimHero);
  });

  it("bad owner keys are dropped: empty, blank, non-string, overlong", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const owner of ["", "   ", 42, null, undefined, {}, []]) {
      registerVersionedPresentation({
        owner: owner as never,
        widgetId: "builtin:hero",
        versionRange: "*",
        component: VictimHero,
      });
    }
    registerVersionedPresentation({
      owner: "v".repeat(129),
      widgetId: "builtin:hero",
      versionRange: "*",
      component: VictimHero,
    });
    expect(warn).toHaveBeenCalled();
    // A 128-char owner is the documented cap and still registers.
    const capped = "c".repeat(128);
    registerVersionedPresentation({
      owner: capped,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: VictimHero,
    });
    expect(resolveVersionedPresentation(capped, "builtin:hero")).toBe(
      VictimHero,
    );
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero"),
    ).toBeUndefined();
  });

  it("non-namespaced widget ids are dropped", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const widgetId of [
      "",
      "   ",
      "not-namespaced",
      "builtin:",
      ":hero",
      "builtin:he ro",
      "1builtin:hero",
      "builtin:hero\ninjected",
      42,
      null,
    ]) {
      registerVersionedPresentation({
        owner: VICTIM,
        widgetId: widgetId as never,
        versionRange: "*",
        component: VictimHero,
      });
    }
    // Overlong ids are dropped too.
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: `builtin:${"h".repeat(250)}`,
      versionRange: "*",
      component: VictimHero,
    });
    expect(warn).toHaveBeenCalled();
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero"),
    ).toBeUndefined();
  });

  it("bad version ranges are dropped: non-string, overlong, unparsable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const versionRange of [
      42,
      null,
      undefined,
      {},
      "garbage range !!!",
      "1.2",
      ">=abc",
      "../../../../etc/passwd",
      ">=1.0.0 <2.0.0 <3.0.0 <4.0.0 <5.0.0",
      "~",
      "^",
    ]) {
      registerVersionedPresentation({
        owner: VICTIM,
        widgetId: "builtin:hero",
        versionRange: versionRange as never,
        component: VictimHero,
      });
    }
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "x".repeat(129),
      component: VictimHero,
    });
    expect(warn).toHaveBeenCalled();
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "1.0.0",
      }),
    ).toBeUndefined();
    // An empty range is documented as "any" (wildcard), not an error.
    clearThemePresentations();
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "",
      component: VictimHero,
    });
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "9.9.9",
      }),
    ).toBe(VictimHero);
  });

  it("bad builder-API floors and bad components/migrate hooks are dropped", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const minBuilderApi of ["garbage", "3.1", 42, {}, ""]) {
      registerVersionedPresentation({
        owner: VICTIM,
        widgetId: "builtin:hero",
        versionRange: "*",
        minBuilderApi: minBuilderApi as never,
        component: VictimHero,
      });
    }
    for (const component of [null, undefined, "hero", {}, 42]) {
      registerVersionedPresentation({
        owner: VICTIM,
        widgetId: "builtin:hero",
        versionRange: "*",
        component: component as never,
      });
    }
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: VictimHero,
      migrate: "carry" as never,
    });
    expect(warn).toHaveBeenCalled();
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero"),
    ).toBeUndefined();
  });

  it("a mutating migrate hook cannot reach the caller's props object", () => {
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: VictimHero,
      migrate: (prev) => {
        (prev as Record<string, unknown>)["title"] = "MUTATED";
        (prev as Record<string, unknown>)["injected"] = true;
        return { ...prev };
      },
    });
    const prev = { title: "Original" };
    const out = migrateVersionedProps(VICTIM, "builtin:hero", prev);
    expect(out.ok).toBe(true);
    // The caller's object is untouched: the hook only saw a clone.
    expect(prev).toEqual({ title: "Original" });
  });

  it("proto-polluting props in and out are stripped", () => {
    registerVersionedPresentation({
      owner: VICTIM,
      widgetId: "builtin:hero",
      versionRange: "*",
      component: VictimHero,
      migrate: (prev) => ({
        ...prev,
        title: "Clean",
        ["__proto__" as string]: { polluted: true },
      }),
    });
    const hostile = JSON.parse(
      '{"title":"Kept","__proto__":{"polluted":true},"constructor":1,"prototype":2}',
    );
    const out = migrateVersionedProps(VICTIM, "builtin:hero", hostile);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected migration");
    expect(out.props).toEqual({ title: "Clean" });
    expect(Object.prototype.hasOwnProperty.call(out.props, "__proto__")).toBe(
      false,
    );
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});

describe("resolution entry points never throw, never cross owners", () => {
  it("garbage opts shapes fall back instead of throwing", () => {
    dressVictim();
    const fallback: WidgetComponent = () => null;
    for (const opts of [null, undefined, 42, "opts", true]) {
      expect(() =>
        resolveVersionedPresentation(VICTIM, "builtin:hero", opts as never),
      ).not.toThrow();
      expect(() =>
        checkVersionedCompatibility(VICTIM, "builtin:hero", opts as never),
      ).not.toThrow();
    }
    // Without version evidence the pinned dressing misses to the fallback.
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        fallback,
      }),
    ).toBe(fallback);
  });

  it("availability gates reject garbage without throwing or flipping state", () => {
    dressVictim();
    expect(() => setVersionedPresentationAvailability("", true)).not.toThrow();
    expect(() =>
      setVersionedPresentationAvailability(VICTIM, "yes" as never),
    ).not.toThrow();
    expect(() =>
      setVersionedPresentationAvailability(null, undefined),
    ).not.toThrow();
    expect(isVersionedOwnerAvailable(VICTIM)).toBe(true);
    expect(isVersionedOwnerAvailable("")).toBe(false);
    expect(isVersionedOwnerAvailable(null)).toBe(false);
    expect(
      resolveVersionedPresentation(VICTIM, "builtin:hero", {
        widgetVersion: "1.4.0",
        builderApi: "3.1.0",
      }),
    ).toBe(VictimHero);
  });

  it("migration entry points fail closed on garbage", () => {
    dressVictim();
    // Array props carry no settings; without target evidence the pinned
    // dressing refuses with the (cleaned) props preserved.
    expect(migrateVersionedProps(VICTIM, "builtin:hero", [1, 2, 3])).toEqual({
      ok: false,
      reason: "incompatible-version",
      preservedProps: {},
    });
    expect(migrateVersionedProps("", "", {})).toEqual({
      ok: false,
      reason: "bad_key",
      preservedProps: {},
    });
  });
});

/**
 * Universal generic-presentation registry (dress/body model) — the edges
 * sibling maps already pin, now for the generic lane: hostile ids and
 * non-components are dropped with a warning, first registration wins even
 * across case/padding variants, the id length cap matches the versioned
 * widget gate, `clearThemePresentations` resets the map, and owner
 * availability never gates the universal body (R1 review finding 2).
 */
describe("universal generic-presentation registry contract", () => {
  const GENERIC_ID = "theme:adv-generic/divider";
  const GenericDivider: WidgetComponent = () => <div data-generic="adv" />;
  const OtherDivider: WidgetComponent = () => <div data-generic="other" />;

  it("drops invalid ids and non-components without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const hostile of [
      "",
      "   ",
      "no-namespace",
      ":missing-namespace",
      "theme:",
      "theme:has space",
      42,
      null,
      undefined,
    ]) {
      expect(() =>
        registerGenericPresentation(hostile as never, GenericDivider),
      ).not.toThrow();
    }
    expect(() =>
      registerGenericPresentation(GENERIC_ID, null as never),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(resolveGenericPresentation(GENERIC_ID)).toBeUndefined();
    // The map still accepts legitimate work afterwards.
    registerGenericPresentation(GENERIC_ID, GenericDivider);
    expect(resolveGenericPresentation(GENERIC_ID)).toBe(GenericDivider);
  });

  it("keeps the first registration across case/padding variants", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerGenericPresentation("  Theme:Adv-Generic/Divider ", GenericDivider);
    registerGenericPresentation(GENERIC_ID, OtherDivider);
    expect(warn).toHaveBeenCalled();
    expect(resolveGenericPresentation(GENERIC_ID)).toBe(GenericDivider);
    expect(hasGenericPresentation("  THEME:ADV-GENERIC/DIVIDER  ")).toBe(true);
  });

  it("refuses ids over the length cap, keeps ids at it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const atCap = `theme:${"a".repeat(250)}`;
    const overCap = `theme:${"a".repeat(251)}`;
    registerGenericPresentation(atCap, GenericDivider);
    registerGenericPresentation(overCap, OtherDivider);
    expect(warn).toHaveBeenCalled();
    expect(resolveGenericPresentation(atCap)).toBe(GenericDivider);
    expect(hasGenericPresentation(overCap)).toBe(false);
  });

  it("resolution entry points never throw on garbage", () => {
    registerGenericPresentation(GENERIC_ID, GenericDivider);
    for (const hostile of [
      null,
      undefined,
      42,
      "",
      "   ",
      "no-namespace",
      {},
    ]) {
      expect(resolveGenericPresentation(hostile as never)).toBeUndefined();
      expect(hasGenericPresentation(hostile as never)).toBe(false);
    }
  });

  it("clearThemePresentations resets generic claims", () => {
    registerGenericPresentation(GENERIC_ID, GenericDivider);
    expect(hasGenericPresentation(GENERIC_ID)).toBe(true);
    clearThemePresentations();
    expect(resolveGenericPresentation(GENERIC_ID)).toBeUndefined();
    expect(hasGenericPresentation(GENERIC_ID)).toBe(false);
  });

  it("resolves independently of owner availability", () => {
    const ownerId = "theme:songoskriti/adv-divider";
    registerGenericPresentation(ownerId, GenericDivider);
    setThemeOwnerAvailability("songoskriti", false);
    expect(isThemeOwnerAvailable("songoskriti")).toBe(false);
    expect(resolveGenericPresentation(ownerId)).toBe(GenericDivider);
    expect(hasGenericPresentation(ownerId)).toBe(true);
    setThemeOwnerAvailability("songoskriti", true);
    expect(isThemeOwnerAvailable("songoskriti")).toBe(true);
  });
});
