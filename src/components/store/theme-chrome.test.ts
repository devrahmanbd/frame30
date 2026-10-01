/**
 * Key-driven theme header chrome (theme-remediation Task 3).
 *
 * RED-first contract: header chrome resolves by explicit theme key — never
 * by slug sniffing. This subsumes the interim `theme-header.ts` lookup,
 * which is deleted; `themeChromeFor` is the single key-driven port.
 */
import { describe, expect, it } from "vitest";
import { themeChromeFor, themeChromeKeys } from "./theme-chrome";

describe("themeChromeFor", () => {
  it("registers the songoskriti theme entry", () => {
    expect(themeChromeKeys()).toContain("songoskriti");
  });

  it("returns the theme-owned logo + announcement for the songoskriti key", () => {
    const chrome = themeChromeFor("songoskriti");
    expect(chrome).not.toBeNull();
    expect(chrome!.logo).toEqual({
      src: "/ph/songoskriti/logo-lockup.svg",
      alt: "Songoskriti",
    });
    expect(chrome!.announcement).toEqual({
      left: "EASY 7-DAY EXCHANGE",
      center: "Free delivery across Bangladesh on orders over BDT 5000",
      center_bn: "৫০০০ টাকার উপরে অর্ডারে সারা দেশে ফ্রি ডেলিভারি",
    });
    expect(chrome!.fallbackMenu.length).toBeGreaterThan(0);
  });

  it("registers the oceanblue theme entry with no topbar band", () => {
    expect(themeChromeKeys()).toContain("oceanblue");
    const chrome = themeChromeFor("oceanblue");
    expect(chrome).not.toBeNull();
    expect(chrome!.announcement.variant).toBe("none");
    // Split copy stays in config (type-required) but renders no band.
    expect(chrome!.announcement.left.length).toBeGreaterThan(0);
    expect(chrome!.announcement.center.length).toBeGreaterThan(0);
    expect(chrome!.announcement.center_bn.length).toBeGreaterThan(0);
  });

  it("songoskriti keeps the default split strip (no variant override)", () => {
    const chrome = themeChromeFor("songoskriti");
    expect(chrome!.announcement.variant).toBeUndefined();
  });

  it("resolves by key, not by slug or name — lookalikes stay generic", () => {
    // The old slug-sniff dressed any "songoskriti"-slugged store in theme
    // chrome even with a foreign theme installed, and dressed renamed
    // lookalikes via substring. Key-driven resolution ends both: only the
    // exact theme key earns the lockup.
    expect(themeChromeFor("demo")).toBeNull();
    expect(themeChromeFor("songoskriti-2")).toBeNull();
    expect(themeChromeFor("Songoskriti")).toBeNull();
    expect(themeChromeFor(null)).toBeNull();
    expect(themeChromeFor(undefined)).toBeNull();
  });
});
