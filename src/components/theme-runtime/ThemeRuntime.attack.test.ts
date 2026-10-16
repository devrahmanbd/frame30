/**
 * ThemeRuntime ATTACK suite — hostile-frame containment, verified under node.
 *
 * Threat model: the theme bundle is attacker-controlled. It runs in a
 * null-origin document (`sandbox="allow-scripts"`, no `allow-same-origin`)
 * and reaches the host ONLY through versioned v2 postMessage envelopes.
 * Every attack below must end in: rejection without host damage, no throw,
 * no navigation, no cross-install data.
 *
 * Browser-truthful limits (see docs/theme-runtime/limits.md): these tests
 * pin the host-side contract (tokens, CSP string, bridge verdicts, source
 * invariants). They cannot execute a real null-origin frame under node —
 * the frame-CPU census showed same-thread vs isolated behavior is
 * browser-mode dependent — so DOM-escape assertions are static source
 * invariants plus bridge behavior, stated as such.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { answerThemeCall, handleThemeMessage } from "./bridge-v2";
import type { ThemeAnswer } from "./bridge-v2";
import { createThemeGuard } from "./bridge-v2";
import { buildThemeGrants } from "./capabilities";
import {
  buildThemeFrameUrl,
  clampThemeHeight,
  THEME_MAX_HEIGHT,
  THEME_MIN_HEIGHT,
  THEME_SANDBOX,
  themeFrameCSP,
} from "./ThemeRuntime";

const DIR = dirname(fileURLToPath(import.meta.url));
const src = (f: string) => readFileSync(join(DIR, f), "utf8");

const FULL = buildThemeGrants({
  storefrontRead: true,
  variantSelect: true,
  cartAdd: true,
  navigate: true,
  navigateAllowlist: ["https://shop.example.com"],
});
const base = {
  granted: FULL.granted,
  navigateAllowlist: FULL.navigateAllowlist,
};

describe("attack: parent-DOM inspect/modify blocked", () => {
  it("sandbox tokens give the frame no DOM path to the parent", () => {
    // Null origin (no allow-same-origin) is what severs parent-DOM reach:
    // same-origin DOM access requires the origin to match.
    expect(THEME_SANDBOX).not.toContain("allow-same-origin");
    // No quoted allow-same-origin token anywhere in the component source
    // (prose mentions in backticks document the ABSENCE — match only real
    // attribute/code strings, single- or double-quoted).
    const tsx = src("ThemeRuntime.tsx");
    expect(tsx).not.toMatch(/["']allow-same-origin["']/);
  });

  it("theme code is never inlined into the host document", () => {
    // Inline code (srcDoc/dangerouslySetInnerHTML of theme code) would run
    // WITH host privileges. The only code path is the src= URL.
    const tsx = src("ThemeRuntime.tsx");
    expect(tsx).not.toMatch(/srcDoc\s*=/);
    expect(tsx).not.toContain("dangerouslySetInnerHTML");
    expect(tsx).toContain("src={url}");
  });
});

describe("attack: forged tenant / price / payment-status", () => {
  it("rejects all three forgery classes at the bridge", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const forgeries: unknown[] = [
      {
        v: 2,
        id: "a1",
        method: "cart.add",
        params: { variantId: "v", quantity: 1, price: 1 },
      },
      {
        v: 2,
        id: "a2",
        method: "storefront.read",
        params: { tenantId: "tenant-b" },
      },
      {
        v: 2,
        id: "a3",
        method: "variant.select",
        params: { variantId: "v", paymentStatus: "paid" },
      },
      {
        v: 2,
        id: "a4",
        method: "cart.add",
        params: { variantId: "v", quantity: 1, tenant_id: "t", total: 0 },
      },
    ];
    for (const f of forgeries) {
      const out = await answerThemeCall(f, { ...base, onCall });
      expect(out).toEqual({ error: "theme.forbidden_field" });
    }
    expect(onCall).not.toHaveBeenCalled();
  });

  it("flags the server-revalidation contract in the bridge source", () => {
    // Client-side rejection is the tripwire; enforcement lives server-side.
    // Pin that the contract is documented where the rejection happens.
    const bridge = src("bridge-v2.ts");
    expect(bridge).toContain("SERVER CONTRACT");
    expect(bridge).toMatch(/revalidat/i);
    expect(bridge).toMatch(/webhook/i);
  });
});

describe("attack: malformed / flood / unauthorized burst", () => {
  it("host stays interactive with zero throws and zero onCall leaks", async () => {
    const onCall = vi.fn(async (method: string) => ({ method }));
    const guard = createThemeGuard();
    const burst: unknown[] = [];
    for (let i = 0; i < 40; i++)
      burst.push({
        v: 2,
        id: `m-${i}`,
        method: "cart.add",
        params: { variantId: "v", quantity: 1, price: i },
      });
    for (let i = 0; i < 40; i++)
      burst.push({ v: 1, id: `v1-${i}`, method: "shop.info" });
    for (let i = 0; i < 40; i++) burst.push({ garbage: i });
    for (let i = 0; i < 40; i++)
      burst.push({
        v: 2,
        id: `u-${i}`,
        method: "cart.add",
        params: { variantId: "v", quantity: 1 },
      });
    const outs: ThemeAnswer[] = [];
    for (const msg of burst) {
      outs.push(
        await handleThemeMessage(msg, {
          granted: buildThemeGrants().granted,
          onCall,
          guard,
          now: 0,
        }),
      );
    }
    // Every single hostile message settles as an error answer — none throws,
    // none reaches onCall (0 legitimate admissions under an empty grant set,
    // flood gate aside).
    expect(outs.every((o) => "error" in o)).toBe(true);
    expect(onCall).not.toHaveBeenCalled();
    // Host still interactive on a fresh identity with real grants.
    const legit = await handleThemeMessage(
      { v: 2, id: "ok", method: "storefront.read" },
      { ...base, onCall, guard: createThemeGuard(), timeoutMs: 500 },
    );
    expect(legit).toEqual({ result: { method: "storefront.read" } });
    expect(onCall).toHaveBeenCalledTimes(1);
  });

  it("burst traffic triggers no navigation (host performs none)", () => {
    // The host never navigates on behalf of bridge traffic: `navigate` only
    // resolves through the merchant's own handler, and the component source
    // contains no programmatic navigation primitives for the frame to tickle.
    const tsx = src("ThemeRuntime.tsx");
    expect(tsx).not.toMatch(/window\.open/);
    expect(tsx).not.toMatch(/location\.(assign|replace|href)/);
    const bridge = src("bridge-v2.ts");
    expect(bridge).not.toMatch(/window\.open/);
    expect(bridge).not.toMatch(/location\.(assign|replace)/);
  });
});

describe("attack: cross-tenant data request denied", () => {
  it("denies tenant-scoped reads even with storefront grant", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const out = await answerThemeCall(
      {
        v: 2,
        id: "x",
        method: "storefront.read",
        params: { tenantId: "other-shop" },
      },
      { ...base, onCall },
    );
    expect(out).toEqual({ error: "theme.forbidden_field" });
    expect(onCall).not.toHaveBeenCalled();
  });
});

describe("attack: cookies / storage / parent-origin unreachable", () => {
  it("null-origin assertions: no same-origin token, no credentialed surface", () => {
    // Without allow-same-origin the frame's origin is opaque ("null"): no
    // document.cookie, no localStorage/sessionStorage sharing, no parent DOM.
    // Pin the host side: it must never hand the frame a capability that
    // restores any of those (no tokens, no cookie values, no storage keys).
    const tsx = src("ThemeRuntime.tsx");
    const bridge = src("bridge-v2.ts");
    const caps = src("capabilities.ts");
    for (const [name, text] of [
      ["ThemeRuntime", tsx],
      ["bridge-v2", bridge],
      ["capabilities", caps],
    ] as const) {
      expect(text, name).not.toContain("document.cookie");
      expect(text, name).not.toContain("localStorage");
      expect(text, name).not.toContain("sessionStorage");
    }
  });

  it("caller identity is the owned window, never an origin string", () => {
    // Null-origin posts make origin checks meaningless; the component matches
    // event.source to the frame window (HtmlSandbox pattern).
    const tsx = src("ThemeRuntime.tsx");
    expect(tsx).toContain("isOwnerFrame(event.source");
    expect(tsx).toContain("contentWindow");
  });

  it("frame CSP denies the frame its own exfiltration network", () => {
    // connect-src 'none' + frame-src 'none' + form-action 'none': even a
    // compromised bundle cannot beacon out or frame-bust via markup.
    const tsx = src("ThemeRuntime.tsx");
    expect(tsx).toContain("connect-src 'none'");
    expect(tsx).toContain("frame-src 'none'");
    expect(tsx).toContain("form-action 'none'");
  });
});

describe("attack: sandbox escape (top-navigation, popups, forms)", () => {
  it("sandbox tokens are exactly allow-scripts — nothing else", () => {
    expect(THEME_SANDBOX).toBe("allow-scripts");
    const tsx = src("ThemeRuntime.tsx");
    // Match real attribute/code strings only (prose documents the ABSENCE
    // in backticks — same quoted-token pattern as the DOM-reach test above).
    expect(tsx).not.toMatch(/["']allow-top-navigation/);
    expect(tsx).not.toMatch(/["']allow-popups/);
    expect(tsx).not.toMatch(/["']allow-forms/);
    expect(tsx).not.toMatch(/["']allow-same-origin["']/);
  });

  it("height handshake cannot take the page (runaway clamped, garbage floored)", () => {
    expect(clampThemeHeight(1e12)).toBe(THEME_MAX_HEIGHT);
    // Non-finite input collapses to the minimum (fail closed), never the max.
    expect(clampThemeHeight(Number.POSITIVE_INFINITY)).toBe(THEME_MIN_HEIGHT);
    expect(clampThemeHeight(NaN)).toBe(THEME_MIN_HEIGHT);
    expect(clampThemeHeight("tall")).toBe(THEME_MIN_HEIGHT);
    expect(clampThemeHeight(undefined)).toBe(THEME_MIN_HEIGHT);
  });
});

describe("attack: credentialed fetch / worker / blob imports denied by frame CSP", () => {
  const ORIGIN = "https://themes.example-cdn.com";

  it("pins the full CSP contract on an approved origin", () => {
    const csp = themeFrameCSP(ORIGIN);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    // Script/style/img/font admit EXACTLY the asset origin: no third-party
    // hosts, no inline scripts, no blob:/data: execution paths.
    expect(csp).toContain(`script-src ${ORIGIN}`);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toContain("blob:");
    expect(csp).not.toContain("data:text/html");
    expect(csp).not.toMatch(/https?:\/\/(?!themes\.example-cdn\.com)/);
  });

  it("unapproved origins fail closed to bare default-src none", () => {
    // The asset origin is platform configuration (any https host, plus http
    // loopback for local dev); everything else — plain http, garbage, the
    // opaque "null" origin — fails closed. An attacker cannot steer this:
    // the value never comes from bridge params.
    for (const origin of [
      "http://themes.example-cdn.com",
      "http://evil.example.com",
      "",
      "null",
      "javascript:alert(1)",
    ]) {
      expect(themeFrameCSP(origin), origin).toBe("default-src 'none'");
    }
    expect(themeFrameCSP("http://localhost:3000")).toContain(
      "connect-src 'none'",
    );
  });
});

describe("attack: immutable frame URL cannot be steered", () => {
  const ORIGIN = "https://themes.example-cdn.com";

  it("rejects mutable tags, traversal, and non-https origins", () => {
    expect(
      buildThemeFrameUrl(ORIGIN, { name: "aurora", version: "1.0.0" }),
    ).toBe(`${ORIGIN}/t/aurora/1.0.0/index.html`);
    for (const theme of [
      { name: "aurora", version: "latest" },
      { name: "aurora", version: "1.0" },
      { name: "../evil", version: "1.0.0" },
      { name: "aurora", version: "1.0.0/../../x" },
      { name: "", version: "1.0.0" },
    ] as const) {
      expect(buildThemeFrameUrl(ORIGIN, theme)).toBeNull();
    }
    // Non-https origins never address a frame; any https host is admissible
    // configuration (same contract as themeFrameCSP — the value is platform
    // config, never attacker input from the bridge).
    expect(
      buildThemeFrameUrl("http://evil.example.com", {
        name: "aurora",
        version: "1.0.0",
      }),
    ).toBeNull();
  });
});

describe("attack: recorded traffic replayed while suspended stays dead", () => {
  it("a hostile burst under suspension settles refused, 0 onCall", async () => {
    const onCall = vi.fn(async (method: string) => ({ method }));
    const guard = createThemeGuard();
    const burst: unknown[] = [];
    for (let i = 0; i < 20; i++)
      burst.push({
        v: 2,
        id: `r-${i}`,
        method: "cart.add",
        params: { variantId: "v", quantity: 1 },
        ts: Date.now(),
      });
    for (let i = 0; i < 20; i++)
      burst.push({ v: 1, id: `v1-${i}`, method: "shop.info" });
    const outs: ThemeAnswer[] = [];
    for (const msg of burst) {
      outs.push(
        await handleThemeMessage(msg, {
          granted: FULL.granted,
          navigateAllowlist: FULL.navigateAllowlist,
          onCall,
          guard,
          now: Date.now(),
          suspended: true,
        }),
      );
    }
    // Layered gates, both explicit: the flood guard admits the first 30
    // (each refused as suspended by the authorizer), the 10 over budget are
    // rate-limited. Nothing reaches onCall either way — the frame is dead
    // with explicit per-call state, never a silent stale render.
    expect(
      outs
        .slice(0, 30)
        .every((o) => "error" in o && o.error === "theme.suspended"),
    ).toBe(true);
    expect(
      outs
        .slice(30)
        .every((o) => "error" in o && o.error === "theme.rate_limited"),
    ).toBe(true);
    expect(onCall).not.toHaveBeenCalled();
  });
});
