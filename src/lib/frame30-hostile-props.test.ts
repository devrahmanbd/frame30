/**
 * Frame30 security matrix (part 2) — hostile props at every boundary.
 *
 * Pins the documented input-handling contracts where merchant/frame bytes
 * cross a trust boundary. Every case asserts fail-closed behavior (strip,
 * reject, or cap — never execute, never throw, never silently widen):
 * - Value layer (`src/lib/widget-props.ts: validateProps`): unknown keys
 *   stripped, markup neutralised, oversize truncated with an error code,
 *   unsafe URLs refused, `bp` layers validated with the same schema.
 * - Instance boundary (`src/components/marketplace/WidgetSandbox.tsx:
 *   validateInstanceProps`): schema path re-validates + strips hostile
 *   keys; legacy path deep-cleans (pollution keys dropped, markup gone,
 *   depth/width capped, unserializable fail-closed to `{}`); settings and
 *   instance props never merge (separate channels).
 * - Theme bridge (`src/components/theme-runtime/capabilities.ts` +
 *   `bridge-v2.ts`): forbidden keys (price/tenant/payment) rejected before
 *   shape checks, oversize capped at 64 KiB, malformed (wrong version,
 *   circular, primitives) never coerced, preview envelopes gated on
 *   identity/shape/size/forbidden keys with `theme.*` refusals.
 * - Registration (`src/lib/unified-widget-registry.ts: sanitizeDef`):
 *   privilege-shaped extra keys never stored.
 * - Frame document (`FRAME_HTML`): props serialized fail-closed with `<`
 *   escaped so JSON can never break out of its script element.
 */
import { describe, expect, it } from "vitest";
import { validateProps, type PropField } from "./widget-props";
import {
  answerWidgetCall,
  FRAME_HTML,
  handleSandboxMessage,
  validateInstanceProps,
} from "../components/marketplace/WidgetSandbox";
import { createFloodGuard } from "./bridge-flood-guard";
import {
  authorizeThemeCall,
  answerThemeCall,
  buildThemePreviewEnvelope,
  handleThemeMessage,
  createThemeGuard,
  parseThemePreviewEnvelope,
  THEME_BRIDGE_VERSION,
  THEME_MAX_MESSAGE_BYTES,
} from "../components/theme-runtime/bridge-v2";
import {
  buildThemeGrants,
  findForbiddenFields,
  sanitizeThemeParams,
} from "../components/theme-runtime/capabilities";
import {
  authorizeWidgetCall,
  MAX_WIDGET_MESSAGE_BYTES,
} from "./marketplace-scopes";
import { createWidgetRegistry } from "./unified-widget-registry";

const textField = (key = "title", extra: Partial<PropField> = {}): PropField => ({
  key,
  label: key,
  kind: "text",
  ...extra,
});

const richField = (key = "body"): PropField => ({
  key,
  label: key,
  kind: "richtext",
});

const linkField = (key = "href"): PropField => ({
  key,
  label: key,
  kind: "link",
});

/* ==================== value layer: validateProps */

describe("hostile props — value layer (validateProps)", () => {
  it("strips unknown and pollution-shaped keys (never stored, never merged)", () => {
    const raw = JSON.parse(
      '{"title":"hi","admin":true,"__proto__":{"polluted":"yes"},"constructor":{"x":1}}',
    ) as Record<string, unknown>;
    const out = validateProps({ fields: [textField()] }, raw);
    expect(out.clean).toEqual({ title: "hi" });
    expect("admin" in out.clean).toBe(false);
    expect("polluted" in ({} as Record<string, unknown>)).toBe(false);
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it("neutralises scripts in plain text (no markup survives)", () => {
    const out = validateProps(
      { fields: [textField()] },
      { title: '<script>alert(1)</script><img src=x onerror=alert(2)>hi' },
    );
    expect(out.clean.title).not.toContain("<");
    expect(out.clean.title).not.toContain(">");
    expect(String(out.clean.title)).toContain("hi");
  });

  it("richtext keeps benign markup but kills handlers and js: targets", () => {
    const out = validateProps(
      { fields: [richField()] },
      {
        body: '<b>bold</b><a href="javascript:alert(1)">x</a><span onclick="alert(2)">y</span><script>alert(3)</script>',
      },
    );
    const body = String(out.clean.body);
    expect(body).toContain("<b>");
    expect(body).not.toContain("javascript:");
    expect(body).not.toContain("onclick");
    expect(body).not.toContain("<script>");
  });

  it("oversize text errors AND truncates (merchant copy survives, capped)", () => {
    const big = "x".repeat(9000);
    const out = validateProps({ fields: [textField()] }, { title: big });
    expect(out.ok).toBe(false);
    expect(out.errors).toContain("title.too_long");
    expect(String(out.clean.title).length).toBeLessThanOrEqual(8192);
  });

  it("unsafe link targets are refused with not_a_url", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<h1>x</h1>",
      "vbscript:msgbox(1)",
    ]) {
      const out = validateProps({ fields: [linkField()] }, { href: bad });
      expect(out.ok).toBe(false);
      expect(out.errors).toContain("href.not_a_url");
    }
    const ok = validateProps({ fields: [linkField()] }, { href: "/products/x" });
    expect(ok.ok).toBe(true);
  });

  it("non-JSON input (circular, functions) never throws", () => {
    const circular: Record<string, unknown> = { title: "ok" };
    circular.self = circular;
    circular.fn = () => 1;
    let out;
    expect(() => {
      out = validateProps({ fields: [textField()] }, circular);
    }).not.toThrow();
    expect((out as { clean: unknown }).clean).toMatchObject({ title: "ok" });
    expect(() => validateProps({ fields: [textField()] }, 42)).not.toThrow();
    expect(() => validateProps({ fields: [textField()] }, null)).not.toThrow();
    expect(() => validateProps({ fields: [textField()] }, "str")).not.toThrow();
  });

  it("bp override layers validate with the same schema (scripts die there too)", () => {
    const out = validateProps({ fields: [textField()] }, {
      title: "ok",
      bp: { mobile: { title: "<script>alert(1)</script>m" } },
    });
    const bp = (out.clean.bp as Record<string, Record<string, unknown>>)
      .mobile;
    expect(String(bp.title)).not.toContain("<");
    const badBp = validateProps({ fields: [textField()] }, { bp: 42 });
    expect(badBp.errors).toContain("bp.type");
  });

  it("repeater rows are capped (bomb truncated, error recorded)", () => {
    const schema = {
      fields: [
        {
          key: "items",
          label: "items",
          kind: "repeater",
          fields: [textField("name")],
        } as PropField,
      ],
    };
    const rows = Array.from({ length: 200 }, (_, i) => ({ name: `n${i}` }));
    const out = validateProps(schema, { items: rows });
    expect(out.errors).toContain("items.too_many");
    expect((out.clean.items as unknown[]).length).toBeLessThanOrEqual(50);
  });
});

/* ==================== instance boundary: validateInstanceProps */

describe("hostile props — instance boundary (validateInstanceProps)", () => {
  it("legacy path: pollution keys dropped at every level", () => {
    const raw = JSON.parse(
      '{"title":"ok","__proto__":{"p1":1},"nested":{"constructor":{"p2":2},"prototype":{"p3":3},"keep":"yes"}}',
    );
    const clean = validateInstanceProps(raw, null);
    expect(clean).toMatchObject({ title: "ok" });
    expect(JSON.stringify(clean)).not.toContain("p1");
    expect(JSON.stringify(clean)).not.toContain("p2");
    expect(JSON.stringify(clean)).not.toContain("p3");
    expect((clean.nested as Record<string, unknown>).keep).toBe("yes");
    expect(({} as { p1?: unknown }).p1).toBeUndefined();
  });

  it("legacy path: scripts stripped, text capped, depth capped", () => {
    const clean = validateInstanceProps(
      {
        title: '<script>alert(1)</script>hello<img src=x onerror=y>',
        deep: { a: { b: { c: { d: { e: "too-deep" } } } } },
      },
      null,
    );
    expect(String(clean.title)).not.toContain("<");
    expect(String(clean.title)).toContain("hello");
    expect(JSON.stringify(clean)).not.toContain("too-deep");
  });

  it("legacy path: key allow-list + width cap (junk keys and floods dropped)", () => {
    const raw: Record<string, unknown> = {};
    for (let i = 0; i < 80; i++) raw[`k${i}`] = i;
    raw["not a key!"] = 1;
    raw["123abc"] = 2;
    const clean = validateInstanceProps(raw, null);
    expect(Object.keys(clean).length).toBeLessThanOrEqual(50);
    expect("not a key!" in clean).toBe(false);
    expect("123abc" in clean).toBe(false);
  });

  it("legacy path: unserializable top levels fail closed to {}", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(validateInstanceProps(circular, null)).toEqual({});
    expect(validateInstanceProps([1, 2, 3], null)).toEqual({});
    expect(validateInstanceProps("str", null)).toEqual({});
    expect(validateInstanceProps(undefined, null)).toEqual({});
    // Functions/symbols/undefined members are dropped by JSON semantics.
    expect(
      validateInstanceProps({ a: 1, fn: () => 1, u: undefined }, null),
    ).toEqual({ a: 1 });
  });

  it("schema path: only schema keys survive (settings never merge in)", () => {
    const schema = { fields: [textField("title")] };
    const installSettings = {
      admin: true,
      secret: "shh",
      title: "instance title",
    };
    const clean = validateInstanceProps(installSettings, schema);
    expect(clean.title).toBe("instance title");
    expect("admin" in clean).toBe(false);
    expect("secret" in clean).toBe(false);
  });

  it("schema path: hostile keys stripped without touching validated markup", () => {
    const schema = { fields: [richField("body")] };
    const raw = JSON.parse(
      '{"body":"<b>ok</b>","__proto__":{"p":1}}',
    ) as Record<string, unknown>;
    const clean = validateInstanceProps(raw, schema);
    expect(String(clean.body)).toContain("<b>");
    expect(JSON.stringify(clean)).not.toContain('"p"');
    expect(({} as { p?: unknown }).p).toBeUndefined();
  });

  it("returns a fresh object every call (instances never share references)", () => {
    const raw = { title: "x", nested: { a: 1 } };
    const a = validateInstanceProps(raw, null);
    const b = validateInstanceProps(raw, null);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
    (a.nested as Record<string, unknown>).a = 999;
    expect((b.nested as Record<string, unknown>).a).toBe(1);
  });

  it("never throws on hostile input shapes", () => {
    for (const bad of [null, 42, true, BigInt(7) as unknown, Symbol("s") as unknown]) {
      expect(() => validateInstanceProps(bad, null)).not.toThrow();
    }
  });
});

/* ==================== theme bridge: forbidden fields + sanitizer */

describe("hostile props — forbidden-field scan and sanitizer", () => {
  it("detects price/tenant/payment keys incl. normalized variants", () => {
    expect(findForbiddenFields({ price: 1 })).toEqual(["price"]);
    expect(findForbiddenFields({ tenantId: "x" }).length).toBe(1);
    expect(findForbiddenFields({ tenant_id: "x" }).length).toBe(1);
    expect(findForbiddenFields({ "TENANT-ID": "x" }).length).toBe(1);
    expect(findForbiddenFields({ paymentToken: "x" }).length).toBe(1);
    expect(findForbiddenFields({ cardNumber: "x" }).length).toBe(1);
    // Nested and array paths are reported with locations.
    const hits = findForbiddenFields({
      cart: { items: [{ variantId: "v", price: 5 }] },
    });
    expect(hits).toEqual(["cart.items[0].price"]);
    expect(findForbiddenFields({ variantId: "v", quantity: 1 })).toEqual([]);
  });

  it("sanitizer strips forbidden + __proto__ subtrees, keeps the rest", () => {
    const { clean, stripped } = sanitizeThemeParams({
      variantId: "v1",
      quantity: 1,
      price: 5,
      nested: { tenantId: "t", ok: true },
    });
    expect(clean).toEqual({
      variantId: "v1",
      quantity: 1,
      nested: { ok: true },
    });
    expect(stripped.sort()).toEqual(["nested.tenantId", "price"].sort());
  });

  it("sanitizer drops __proto__ keys outright", () => {
    const raw = JSON.parse('{"a":1,"__proto__":{"p":1}}') as Record<string, unknown>;
    const { clean, stripped } = sanitizeThemeParams(raw);
    expect(clean).toEqual({ a: 1 });
    expect(stripped).toContain("__proto__");
    expect(({} as { p?: unknown }).p).toBeUndefined();
  });

  it("scan and sanitizer are cycle-safe and bounded (no DoS via payload)", () => {
    const cyclic: Record<string, unknown> = { ok: true };
    cyclic.self = cyclic;
    expect(() => findForbiddenFields(cyclic)).not.toThrow();
    expect(() => sanitizeThemeParams(cyclic)).not.toThrow();
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < 3000; i++) wide[`k${i}`] = i;
    const hits = findForbiddenFields(wide);
    expect(Array.isArray(hits)).toBe(true);
  });
});

/* ==================== theme bridge: authorization order */

describe("hostile props — theme bridge authorization", () => {
  const full = () =>
    buildThemeGrants({
      storefrontRead: true,
      variantSelect: true,
      cartAdd: true,
      navigate: true,
    });

  it("forgery (price/tenant/payment) rejected before shape checks", () => {
    const v = authorizeThemeCall(
      {
        v: THEME_BRIDGE_VERSION,
        id: "1",
        method: "cart.add",
        params: { variantId: "v1", quantity: 1, price: 5 },
      },
      full(),
    );
    expect(v).toEqual({
      allowed: false,
      reason: "forbidden_field",
      method: "cart.add",
    });
  });

  it("oversize messages refused (64 KiB cap, measured in UTF-8 bytes)", () => {
    expect(THEME_MAX_MESSAGE_BYTES).toBe(64 * 1024);
    expect(MAX_WIDGET_MESSAGE_BYTES).toBe(64 * 1024);
    const big = "x".repeat(70 * 1024);
    const t = authorizeThemeCall(
      {
        v: THEME_BRIDGE_VERSION,
        id: "1",
        method: "storefront.read",
        params: { blob: big },
      },
      full(),
    );
    expect(t.allowed).toBe(false);
    if (!t.allowed) expect(t.reason).toBe("oversize");
    const w = authorizeWidgetCall(
      { v: 1, id: "1", method: "shop.info", params: { blob: big } },
      ["read_shop"],
    );
    expect(w).toEqual({ allowed: false, reason: "oversize" });
  });

  it("malformed envelopes never coerced (wrong version, primitives, circular)", () => {
    const ctx = full();
    // v1 on the theme lane is malformed, never silently admitted.
    expect(
      authorizeThemeCall({ v: 1, id: "1", method: "storefront.read" }, ctx)
        .allowed,
    ).toBe(false);
    for (const bad of [null, undefined, 42, "str", [], { v: 2 }]) {
      const v = authorizeThemeCall(bad, ctx);
      expect(v.allowed).toBe(false);
      if (!v.allowed) expect(v.reason).toBe("malformed");
    }
    const cyclic: Record<string, unknown> = {
      v: THEME_BRIDGE_VERSION,
      id: "1",
      method: "storefront.read",
    };
    cyclic.params = cyclic;
    expect(authorizeThemeCall(cyclic, ctx)).toEqual({
      allowed: false,
      reason: "malformed",
    });
    // Same posture on the widget lane: v2 traffic is malformed there.
    expect(
      authorizeWidgetCall({ v: 2, id: "1", method: "shop.info" }, ["read_shop"])
        .allowed,
    ).toBe(false);
    const wc: Record<string, unknown> = { v: 1, id: "1", method: "shop.info" };
    wc.params = wc;
    expect(authorizeWidgetCall(wc, ["read_shop"]).allowed).toBe(false);
  });

  it("invalid method params refused (quantity bounds, variant identity)", () => {
    const ctx = full();
    for (const qty of [0, 100, 1.5, "2", NaN]) {
      const v = authorizeThemeCall(
        {
          v: THEME_BRIDGE_VERSION,
          id: "1",
          method: "cart.add",
          params: { variantId: "v1", quantity: qty },
        },
        ctx,
      );
      expect(v).toEqual({
        allowed: false,
        reason: "invalid_params",
        method: "cart.add",
      });
    }
    expect(
      authorizeThemeCall(
        { v: THEME_BRIDGE_VERSION, id: "1", method: "variant.select", params: {} },
        ctx,
      ),
    ).toEqual({
      allowed: false,
      reason: "invalid_params",
      method: "variant.select",
    });
  });

  it("navigation refuses script/data targets even when granted", () => {
    const ctx = full();
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,<h1>x</h1>",
      "//evil.test/x",
      "blob:https://x/y",
    ]) {
      const v = authorizeThemeCall(
        { v: THEME_BRIDGE_VERSION, id: "1", method: "navigate", params: { href } },
        ctx,
      );
      expect(v).toEqual({
        allowed: false,
        reason: "navigation_denied",
        method: "navigate",
      });
    }
  });

  it("host answers never reject (errors are values, never throws)", async () => {
    const ctx = {
      granted: [],
      onCall: async () => ({ ok: true }),
    };
    for (const bad of [null, 42, [], "x", { v: 9 }]) {
      await expect(answerThemeCall(bad, ctx)).resolves.toMatchObject({
        error: expect.any(String),
      });
      await expect(
        handleThemeMessage(bad, { ...ctx, guard: createThemeGuard() }),
      ).resolves.toMatchObject({ error: expect.any(String) });
      await expect(
        answerWidgetCall(bad, { granted: [], onCall: async () => ({}) }),
      ).resolves.toMatchObject({ error: expect.any(String) });
      await expect(
        handleSandboxMessage(bad, {
          granted: [],
          onCall: async () => ({}),
          guard: createFloodGuard(),
        }),
      ).resolves.toMatchObject({ error: expect.any(String) });
    }
  });
});

/* ==================== preview envelopes (host -> frame direction) */

describe("hostile props — theme preview envelopes", () => {
  it("forbidden props refuse with theme.forbidden_field", () => {
    for (const props of [
      { title: "ok", price: 5 },
      { nested: { tenantId: "t" } },
      { items: [{ paymentStatus: "paid" }] },
    ]) {
      expect(
        buildThemePreviewEnvelope({
          widgetId: "theme:acme-shop/hero",
          component: "Hero",
          props,
        }),
      ).toEqual({ ok: false, error: "theme.forbidden_field" });
    }
  });

  it("oversize props refuse with theme.oversize", () => {
    expect(
      buildThemePreviewEnvelope({
        widgetId: "theme:acme-shop/hero",
        component: "Hero",
        props: { blob: "x".repeat(70 * 1024) },
      }),
    ).toEqual({ ok: false, error: "theme.oversize" });
  });

  it("identity gates: other lanes' ids and path-shaped components refuse", () => {
    for (const input of [
      { widgetId: "plugin:acme/reviews", component: "Hero", props: {} },
      { widgetId: "builtin:hero", component: "Hero", props: {} },
      { widgetId: "theme:ab/x", component: "Hero", props: {} },
      { widgetId: "theme:../escape/hero", component: "Hero", props: {} },
      { widgetId: "theme:acme-shop/hero", component: "../Evil", props: {} },
      { widgetId: "theme:acme-shop/hero", component: "a/b", props: {} },
      { widgetId: "theme:acme-shop/hero", component: "", props: {} },
      { widgetId: 42, component: "Hero", props: {} },
      null,
      "str",
    ]) {
      expect(buildThemePreviewEnvelope(input)).toEqual({
        ok: false,
        error: "theme.malformed",
      });
    }
  });

  it("non-JSON (circular) props refuse with theme.malformed", () => {
    const props: Record<string, unknown> = { title: "ok" };
    props.self = props;
    expect(
      buildThemePreviewEnvelope({
        widgetId: "theme:acme-shop/hero",
        component: "Hero",
        props,
      }),
    ).toEqual({ ok: false, error: "theme.malformed" });
  });

  it("valid envelope round-trips byte-identical through the parser", () => {
    const built = buildThemePreviewEnvelope({
      widgetId: "theme:acme-shop/hero",
      component: "Hero",
      props: { title: "Hello" },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.envelope.v).toBe(2);
    const parsed = parseThemePreviewEnvelope(built.envelope);
    expect(parsed).toEqual({
      ok: true,
      widgetId: "theme:acme-shop/hero",
      component: "Hero",
      props: { title: "Hello" },
    });
  });

  it("parser mirrors the builder gates (tampered frameside input refused)", () => {
    expect(parseThemePreviewEnvelope(null)).toEqual({
      ok: false,
      error: "theme.malformed",
    });
    expect(
      parseThemePreviewEnvelope({
        v: 1,
        type: "fq:theme-preview",
        widgetId: "theme:acme-shop/hero",
        component: "Hero",
        props: {},
      }),
    ).toEqual({ ok: false, error: "theme.malformed" });
    expect(
      parseThemePreviewEnvelope({
        v: 2,
        type: "fq:theme-preview",
        widgetId: "theme:acme-shop/hero",
        component: "Hero",
        props: { price: 1 },
      }),
    ).toEqual({ ok: false, error: "theme.forbidden_field" });
  });
});

/* ==================== registration privilege drop + frame document */

describe("hostile props — registration and frame document", () => {
  it("registration drops privilege-shaped keys (never stored)", () => {
    const reg = createWidgetRegistry();
    const v = reg.registerWidget({
      id: "plugin:evil/w",
      namespace: "plugin",
      version: "1.0.0",
      label: "Evil",
      category: "plugin",
      slots: [],
      defaults: {},
      propsSchema: { fields: [] },
      renderer: "sandbox",
      scopes: ["write_products"],
      permissions: ["*"],
      capabilities: ["*"],
      entry: "evil.js",
      bundle: "evil-bytes",
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    for (const key of ["scopes", "permissions", "capabilities", "entry", "bundle"]) {
      expect(key in v.def).toBe(false);
    }
    const stored = reg.getWidget("plugin:evil/w")!;
    for (const key of ["scopes", "permissions", "capabilities", "entry", "bundle"]) {
      expect(key in stored).toBe(false);
    }
  });

  it("frame document escapes < so props JSON cannot break out of script", () => {
    const hostile = { title: "</script><script>alert(1)</script>" };
    const clean = FRAME_HTML("void 0", "https://shop.test", "", hostile);
    const plain = FRAME_HTML("void 0", "https://shop.test", "");
    const count = (s: string) => s.split("</script>").length - 1;
    // Exactly the document's own closing tag in both cases — no breakout.
    expect(count(plain)).toBe(1);
    expect(count(clean)).toBe(1);
    expect(clean).toContain("\\u003c/script>");
  });

  it("frame document drops hostile keys via the serializer replacer", () => {
    const raw = JSON.parse('{"title":"ok","__proto__":{"p":1}}') as Record<
      string,
      unknown
    >;
    const html = FRAME_HTML("void 0", "https://shop.test", "", raw);
    expect(html).not.toContain("__proto__");
    expect(html).toContain("ok");
  });

  it("frame document fails closed on unserializable props", () => {
    const props: Record<string, unknown> = {};
    props.self = props;
    const html = FRAME_HTML("void 0", "https://shop.test", "", props);
    expect(html).toContain("window.framique.props={}");
  });
});
