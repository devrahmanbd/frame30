/**
 * Theme widget preview bridge — TDD: the editor preview path for
 * uploaded-theme widgets carries the INTENDED component id + validated
 * instance data in a versioned envelope, and hostile payloads fail closed
 * with `theme.*` errors (never a throw, never silent truncation).
 *
 * Pure module, runs under node (same posture as `bridge-v2.test.ts`).
 */
import { describe, expect, it } from "vitest";
import {
  buildThemePreviewEnvelope,
  parseThemePreviewEnvelope,
  THEME_BRIDGE_VERSION,
  THEME_PREVIEW_MESSAGE,
} from "./bridge-v2";

const WIDGET = "theme:aurora-lookbook/hero";

describe("theme preview envelope — intended component + validated data", () => {
  it("builds a versioned envelope carrying the exact component id and props", () => {
    const props = { headline: "Hello", accent: "#ff0000" };
    const built = buildThemePreviewEnvelope({
      widgetId: WIDGET,
      component: "HeroCanvas",
      props,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.envelope.v).toBe(THEME_BRIDGE_VERSION);
    expect(built.envelope.type).toBe(THEME_PREVIEW_MESSAGE);
    expect(built.envelope.widgetId).toBe(WIDGET);
    expect(built.envelope.component).toBe("HeroCanvas");
    expect(built.envelope.props).toEqual(props);
    expect(built.envelope.props).not.toBe(props);
  });

  it("round-trips through the parser with identical payload", () => {
    const built = buildThemePreviewEnvelope({
      widgetId: WIDGET,
      component: "HeroCanvas",
      props: { headline: "Hello" },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const parsed = parseThemePreviewEnvelope(built.envelope);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.widgetId).toBe(WIDGET);
    expect(parsed.component).toBe("HeroCanvas");
    expect(parsed.props).toEqual({ headline: "Hello" });
  });

  it("rejects non-theme lanes and malformed theme ids", () => {
    for (const foreign of [
      "builtin:hero",
      "plugin:acme/reviews",
      "studio:app-block",
      "theme:UPPERCASE/hero",
      "theme:a/b/c",
      "theme:/hero",
      "",
    ]) {
      expect(
        buildThemePreviewEnvelope({
          widgetId: foreign,
          component: "HeroCanvas",
          props: {},
        }).ok,
      ).toBe(false);
    }
    // Shape-valid ids build: ownership is enforced upstream (the route
    // adapts only the ACTIVE theme's manifest; resolvePresentation maps
    // foreign themes to recoverable-fallback) — pinned in
    // `dev-theme-lifecycle.test.ts`, never by shape confusion here.
    expect(
      buildThemePreviewEnvelope({
        widgetId: "theme:other-theme/hero",
        component: "HeroCanvas",
        props: {},
      }).ok,
    ).toBe(true);
  });

  it("binds the envelope to its owner (no cross-theme reuse)", () => {
    const ok = buildThemePreviewEnvelope({
      widgetId: WIDGET,
      component: "HeroCanvas",
      props: {},
    });
    expect(ok.ok).toBe(true);
    const cross = buildThemePreviewEnvelope({
      widgetId: "theme:midnight-bazaar/banner",
      component: "HeroCanvas",
      props: {},
    });
    expect(cross.ok).toBe(true);
    if (!ok.ok || !cross.ok) return;
    // Same component name, different owners: widget ids stay distinct so a
    // payload can never render under the wrong theme.
    expect(ok.envelope.widgetId).not.toBe(cross.envelope.widgetId);
  });

  it("rejects hostile component ids", () => {
    for (const component of [
      "",
      "../escape",
      "Hero Canvas",
      "HeroCanvas;alert(1)",
      "<script>",
      "a".repeat(200),
      42,
      null,
    ]) {
      expect(
        buildThemePreviewEnvelope({ widgetId: WIDGET, component, props: {} })
          .ok,
      ).toBe(false);
    }
  });

  it("rejects non-record, unserializable and oversize props", () => {
    for (const props of [null, "headline", 42, ["headline"]]) {
      expect(
        buildThemePreviewEnvelope({ widgetId: WIDGET, component: "C", props })
          .ok,
      ).toBe(false);
    }
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(
      buildThemePreviewEnvelope({
        widgetId: WIDGET,
        component: "C",
        props: cyclic,
      }),
    ).toMatchObject({ ok: false });
    const big = buildThemePreviewEnvelope({
      widgetId: WIDGET,
      component: "C",
      props: { headline: "x".repeat(70 * 1024) },
    });
    expect(big.ok).toBe(false);
    if (big.ok) return;
    expect(big.error).toBe("theme.oversize");
  });

  it("rejects forbidden (price/tenant/payment) fields even in preview data", () => {
    for (const props of [
      { price: "9.99" },
      { nested: { tenantId: "t1" } },
      { rows: [{ paymentStatus: "paid" }] },
    ]) {
      const built = buildThemePreviewEnvelope({
        widgetId: WIDGET,
        component: "C",
        props,
      });
      expect(built.ok).toBe(false);
      if (built.ok) continue;
      expect(built.error).toBe("theme.forbidden_field");
    }
  });

  it("parser rejects wrong versions, wrong types and foreign ids", () => {
    expect(
      parseThemePreviewEnvelope({
        v: 1,
        type: THEME_PREVIEW_MESSAGE,
        widgetId: WIDGET,
        component: "C",
        props: {},
      }).ok,
    ).toBe(false);
    expect(
      parseThemePreviewEnvelope({
        v: 2,
        type: "fq:other",
        widgetId: WIDGET,
        component: "C",
        props: {},
      }).ok,
    ).toBe(false);
    expect(
      parseThemePreviewEnvelope({
        v: 2,
        type: THEME_PREVIEW_MESSAGE,
        widgetId: "plugin:acme/x",
        component: "C",
        props: {},
      }).ok,
    ).toBe(false);
    expect(parseThemePreviewEnvelope(null).ok).toBe(false);
    expect(parseThemePreviewEnvelope("preview").ok).toBe(false);
  });

  it("never throws on pathological input", () => {
    const cyclic: Record<string, unknown> = { v: 2 };
    cyclic.self = cyclic;
    expect(() => buildThemePreviewEnvelope(cyclic)).not.toThrow();
    expect(() => parseThemePreviewEnvelope(cyclic)).not.toThrow();
    expect(() => buildThemePreviewEnvelope(undefined)).not.toThrow();
  });
});
