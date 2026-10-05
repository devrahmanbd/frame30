/**
 * Key-driven theme header chrome (theme-remediation Task 3).
 *
 * RED-first contract: header chrome resolves by explicit theme key — never
 * by slug sniffing. This subsumes the interim `theme-header.ts` lookup,
 * which is deleted; `themeChromeFor` is the single key-driven port.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_HEADER_CHROME_KEY,
  HEADER_ANNOUNCEMENT,
  HEADER_FALLBACK_MENU,
  HEADER_LOGO,
  HEADER_MENU_BN,
  headerMenuLabel,
} from "@/lib/header-copy";
import {
  SONGOSKRITI_HEADER_ANNOUNCEMENT,
  SONGOSKRITI_HEADER_LOGO,
  SONGOSKRITI_MEGA_MENU,
  SONGOSKRITI_MENU_BN,
  songoskritiMenuLabel,
} from "@/lib/themes/songoskriti/header-fallback";
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

  it("resolves by key, not by slug or name — lookalikes stay generic", () => {
    // The old slug-sniff dressed any "songoskriti"-slugged store in theme
    // chrome even with a foreign theme installed, and dressed renamed
    // lookalikes via substring. Key-driven resolution ends both: only the
    // exact theme key earns the lockup.
    expect(themeChromeFor("somvabona")).toBeNull();
    expect(themeChromeFor("demo")).toBeNull();
    expect(themeChromeFor("songoskriti-2")).toBeNull();
    expect(themeChromeFor("Songoskriti")).toBeNull();
    expect(themeChromeFor(null)).toBeNull();
    expect(themeChromeFor(undefined)).toBeNull();
  });
});

describe("theme-chrome de-theming (HEADER DE-THEMING lane)", () => {
  const CHROME_SRC = () =>
    readFileSync("src/components/store/theme-chrome.ts", "utf8");

  it("shared chrome imports no theme module", () => {
    // The violation was a shared→theme edge
    // (`@/lib/themes/songoskriti/header-fallback`). Fallback copy now
    // arrives through the neutral `lib/header-copy` module, so no import
    // specifier in this file may point inside a theme dir.
    const src = CHROME_SRC();
    const specifiers = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map(
      (m) => m[1]!,
    );
    expect(
      specifiers.filter((s) => s.includes("themes/")),
      `theme-chrome.ts imports ${specifiers.join(", ")}`,
    ).toEqual([]);
    expect(src).toContain("@/lib/header-copy");
  });

  it("shared chrome names no theme and hardcodes no brand asset", () => {
    // Key-driven wiring is config: the theme key binding arrives as data
    // (`DEFAULT_HEADER_CHROME_KEY`), never as a literal or a branch here.
    // Brand asset paths likewise live only in the neutral copy module.
    const src = CHROME_SRC();
    expect(src).not.toMatch(/songoskriti|somvabona/i);
    expect(src).not.toMatch(/\/ph\//);
    // Key-driven lookup only: no equality branch against a theme string.
    // (The `themeKey == null` null-guard is the null contract, not a
    // theme branch.)
    expect(src).not.toMatch(/===\s*["']/);
    expect(src).not.toMatch(/!\s*==\s*["']/);
  });

  it("neutral fallback copy ships the theme values verbatim", () => {
    // `header-copy.ts` is the `footer-copy.ts` precedent for headers: same
    // values, neutral path. A theme copy change must fail here instead of
    // drifting silently apart.
    expect(HEADER_FALLBACK_MENU).toEqual(SONGOSKRITI_MEGA_MENU);
    expect(HEADER_MENU_BN).toEqual(SONGOSKRITI_MENU_BN);
    expect(HEADER_LOGO).toEqual(SONGOSKRITI_HEADER_LOGO);
    expect(HEADER_ANNOUNCEMENT).toEqual(SONGOSKRITI_HEADER_ANNOUNCEMENT);
    const t = (en: string, bn?: string) => bn ?? en;
    for (const label of ["Women", "Panjabi", "Heritage", "Unmapped Label"]) {
      expect(headerMenuLabel(label, t)).toBe(songoskritiMenuLabel(label, t));
    }
    expect(DEFAULT_HEADER_CHROME_KEY).toBe("songoskriti");
    expect(themeChromeKeys()).toEqual([DEFAULT_HEADER_CHROME_KEY]);
  });
});
