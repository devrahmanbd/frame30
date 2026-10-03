/**
 * SWITCHER lane — display-currency selector contract.
 *
 * Covers the three lane guarantees without new packages (node env, static
 * markup like the ThemeChrome suites):
 *  1. preference persist — localStorage round-trip, invalid-value + SSR
 *     fallbacks, cross-mount sync event;
 *  2. conversion display — helper parity with the canonical
 *     `convertWithSnapshot` (`fx.server.ts`), half-up rounding, identity and
 *     no-snapshot fallbacks that never print an unsourced number;
 *  3. charge-currency disclosure — the merchant (charge) code is always
 *     visible, in both locales.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LanguageProvider } from "@/lib/i18n";
import { money } from "@/lib/money";
import { formatDisplayMoney } from "@/lib/money-display";
import { convertWithSnapshot } from "@/lib/fx.server";
import {
  CurrencySwitcher,
  convertDisplayMinor,
  DISPLAY_CURRENCY_EVENT,
  DISPLAY_CURRENCY_STORAGE_KEY,
  displayRatePpm,
  readStoredDisplayCurrency,
  writeStoredDisplayCurrency,
} from "./CurrencySwitcher";
import { ThemeChrome } from "./ThemeChrome";

/** Minimal window/localStorage stub for the node test env. */
function stubWindow(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
    dispatchEvent: (event: { type: string }) => {
      listeners.get(event.type)?.forEach((fn) => fn(event));
      return true;
    },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
  };
  return store;
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("display-currency preference persist", () => {
  it("defaults to BDT with no stored preference (or no window)", () => {
    stubWindow();
    expect(readStoredDisplayCurrency()).toBe("BDT");
    delete (globalThis as unknown as { window?: unknown }).window;
    expect(readStoredDisplayCurrency()).toBe("BDT");
    expect(() =>
      writeStoredDisplayCurrency("USD"),
    ).not.toThrow();
  });

  it("round-trips the shopper selection through localStorage", () => {
    const store = stubWindow();
    writeStoredDisplayCurrency("USD");
    expect(store.get(DISPLAY_CURRENCY_STORAGE_KEY)).toBe("USD");
    expect(readStoredDisplayCurrency()).toBe("USD");
    writeStoredDisplayCurrency("BDT");
    expect(readStoredDisplayCurrency()).toBe("BDT");
  });

  it("ignores stored codes the money stack cannot render", () => {
    stubWindow({ [DISPLAY_CURRENCY_STORAGE_KEY]: "EUR" });
    expect(readStoredDisplayCurrency()).toBe("BDT");
  });

  it("notifies other mounts when the preference changes", () => {
    stubWindow();
    const seen: unknown[] = [];
    (
      globalThis as unknown as {
        window: { addEventListener: (t: string, fn: (e: unknown) => void) => void };
      }
    ).window.addEventListener(DISPLAY_CURRENCY_EVENT, (e) => seen.push(e));
    writeStoredDisplayCurrency("USD");
    expect(seen.length).toBe(1);
    expect(
      (seen[0] as { detail?: { currency?: string } }).detail?.currency,
    ).toBe("USD");
  });

  it("renders the persisted preference as the pressed option", () => {
    stubWindow({ [DISPLAY_CURRENCY_STORAGE_KEY]: "USD" });
    const html = renderToStaticMarkup(createElement(CurrencySwitcher));
    expect(html).toContain('aria-pressed="true"');
    // The pressed option is the USD one (symbol + code adjacent).
    const usdPressed = html.indexOf('aria-pressed="true"');
    expect(html.slice(usdPressed, usdPressed + 400)).toContain("USD");
  });
});

describe("display conversion", () => {
  const bdtUsd = {
    id: "s1",
    base: "BDT" as const,
    quote: "USD" as const,
    ratePpm: 8300,
    source: "manual",
    effectiveAt: "2026-01-01T00:00:00Z",
  };
  const usdBdt = {
    id: "s2",
    base: "USD" as const,
    quote: "BDT" as const,
    ratePpm: 120_500_000,
    source: "manual",
    effectiveAt: "2026-01-01T00:00:00Z",
  };

  it("matches convertWithSnapshot in both snapshot directions", () => {
    const bdt = convertDisplayMinor(100000, "BDT", "USD", { BDT_USD: 8300 });
    expect(bdt).toEqual({ minor: 830, currency: "USD", converted: true });
    expect(convertWithSnapshot(money(100000, "BDT"), bdtUsd).minor).toBe(
      bdt.minor,
    );

    const usd = convertDisplayMinor(1000, "USD", "BDT", {
      USD_BDT: 120_500_000,
    });
    expect(usd.currency).toBe("BDT");
    expect(usd.converted).toBe(true);
    expect(convertWithSnapshot(money(1000, "USD"), usdBdt).minor).toBe(
      usd.minor,
    );
  });

  it("rounds half-up on the minor unit like the fx boundary", () => {
    // 10 minor BDT @ 8300ppm = 0.083 -> 0; 60_241 minor @ 8300ppm = 500.0003 -> 500.
    expect(
      convertDisplayMinor(10, "BDT", "USD", { BDT_USD: 8300 }).minor,
    ).toBe(convertWithSnapshot(money(10, "BDT"), bdtUsd).minor);
    expect(
      convertDisplayMinor(60241, "BDT", "USD", { BDT_USD: 8300 }).minor,
    ).toBe(convertWithSnapshot(money(60241, "BDT"), bdtUsd).minor);
  });

  it("returns the merchant amount unconverted without a snapshot", () => {
    expect(convertDisplayMinor(100000, "BDT", "USD")).toEqual({
      minor: 100000,
      currency: "BDT",
      converted: false,
    });
    // Wrong-direction snapshot only: still no number is invented.
    expect(
      convertDisplayMinor(100000, "BDT", "USD", { USD_BDT: 120_500_000 }),
    ).toEqual({ minor: 100000, currency: "BDT", converted: false });
  });

  it("is identity when merchant and display match, and safe on bad input", () => {
    expect(convertDisplayMinor(500, "BDT", "BDT")).toEqual({
      minor: 500,
      currency: "BDT",
      converted: false,
    });
    expect(convertDisplayMinor(null, "BDT", "USD")).toEqual({
      minor: 0,
      currency: "BDT",
      converted: false,
    });
    // Unknown merchant code falls back to BDT rather than throwing in render.
    expect(convertDisplayMinor(500, "EUR", "USD").currency).toBe("BDT");
  });

  it("resolves directional snapshot ppm only", () => {
    expect(displayRatePpm("BDT", "BDT", { BDT_USD: 8300 })).toBeNull();
    expect(displayRatePpm("BDT", "USD", { BDT_USD: 8300 })).toBe(8300);
    expect(displayRatePpm("BDT", "USD", { USD_BDT: 1 })).toBeNull();
    expect(displayRatePpm("USD", "BDT", { USD_BDT: 0 })).toBeNull();
  });

  it("renders the converted preview through formatDisplayMoney", () => {
    stubWindow({ [DISPLAY_CURRENCY_STORAGE_KEY]: "USD" });
    const html = renderToStaticMarkup(
      createElement(CurrencySwitcher, {
        merchantCurrency: "BDT",
        ratesPpm: { BDT_USD: 8300 },
        amountMinor: 100000,
      }),
    );
    expect(html).toContain(
      formatDisplayMoney(830, { currency: "USD" }),
    );
  });

  it("renders the merchant amount when no snapshot covers the pair", () => {
    stubWindow({ [DISPLAY_CURRENCY_STORAGE_KEY]: "USD" });
    const html = renderToStaticMarkup(
      createElement(CurrencySwitcher, {
        merchantCurrency: "BDT",
        amountMinor: 100000,
      }),
    );
    expect(html).toContain(
      formatDisplayMoney(100000, { currency: "BDT" }),
    );
  });
});

describe("charge-currency disclosure", () => {
  it("always names the charge currency in English", () => {
    stubWindow();
    const html = renderToStaticMarkup(createElement(CurrencySwitcher));
    expect(html).toContain("BDT");
    expect(html).toMatch(/charg\w* in BDT/i);
  });

  it("names a USD charge currency when the merchant settles in USD", () => {
    stubWindow();
    const html = renderToStaticMarkup(
      createElement(CurrencySwitcher, { merchantCurrency: "USD" }),
    );
    expect(html).toMatch(/charg\w* in USD/i);
  });

  it("discloses the charge currency in বাংলা", () => {
    stubWindow();
    const html = renderToStaticMarkup(
      createElement(LanguageProvider, {
        initialLang: "bn",
        children: createElement(CurrencySwitcher),
      }),
    );
    expect(html).toContain("চার্জ");
    expect(html).toContain("BDT");
  });
});

describe("switcher chrome", () => {
  it("offers exactly BDT/USD as 44px targets in a labelled group", () => {
    stubWindow();
    const html = renderToStaticMarkup(createElement(CurrencySwitcher));
    expect(html).toContain('role="group"');
    expect(html).toContain("Display currency");
    expect(html).toContain("BDT");
    expect(html).toContain("USD");
    expect(html).not.toContain("EUR");
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("min-w-[44px]");
  });
});

describe("ThemeChrome mount wiring", () => {
  it("renders the switcher adjacent to the header chrome", () => {
    stubWindow();
    const html = renderToStaticMarkup(
      createElement(ThemeChrome, {
        template: "index",
        ast: null,
        tokens: null,
        chrome: createElement("div", { id: "test-header" }),
        fallback: createElement("div", { id: "test-fallback" }),
      }),
    );
    expect(html).toContain('id="test-header"');
    expect(html).toContain("Display currency");
    expect(html).toMatch(/charg\w* in BDT/i);
  });
});
