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
import { THEME_SANDBOX } from "./ThemeRuntime";

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
