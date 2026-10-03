/**
 * SWITCHER lane — shopper display-currency selector (display-conversion only).
 *
 * There is NO multi-currency price list: currency is fixed per merchant
 * (`merchants.currency_code`) and checkout always charges the merchant
 * currency. This switcher only re-expresses merchant prices in the shopper's
 * preferred currency for display, using an fx snapshot for the conversion, and
 * says so in the UI microcopy below.
 *
 * Currency set (fixed BDT/USD — verified before offering more):
 *  - `fx_rates` is a generic pair table, but the only sanctioned read in the
 *    codebase is USD<->BDT (`currency-gate.server.ts:106` — base USD, quote
 *    BDT), and `money.ts` admits only BDT|USD as `CurrencyCode`.
 *    `formatDisplayMoney`/`fmtMinor` render only ৳/$ symbols, so offering EUR
 *    would print the wrong symbol while slipping past type safety via the
 *    string fallback. EUR (or any third code) needs the multi-currency
 *    price-list decision plus a `CurrencyCode` extension first.
 *  - The component never inverts a rate: the server must inject the snapshot
 *    ppm for the merchant->display direction (`ratesPpm`). Inverting client-
 *    side would silently pick a rounding direction the ledger never saw. When
 *    no directional rate is available the component falls back to the merchant
 *    amount — it never shows a number it cannot source.
 *
 * Conversion maths mirrors `convertWithSnapshot` (`fx.server.ts`) exactly
 * (integer ppm, half-up on the minor unit) but does NOT import it: that module
 * pulls `cache.server`/`redis.server` (node-only) into the client bundle. A
 * parity test in `CurrencySwitcher.test.tsx` pins the two implementations
 * together. Snapshot ids travel with converted amounts server-side
 * (`fx.server.ts` `Converted`); this display-only path carries no ledger
 * weight, so only the rate value is threaded through.
 *
 * Reduced motion: N/A — no transitions or animations in this component.
 */
import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { isCurrency, money } from "@/lib/money";
import { formatDisplayMoney } from "@/lib/money-display";

/** The only display codes the money stack can honestly render (৳/$). */
export type DisplayCurrency = "BDT" | "USD";

export const DISPLAY_CURRENCIES: readonly DisplayCurrency[] = ["BDT", "USD"];

/** Mirrors `fq_customer_tz` / `framique.lang` shopper-preference conventions. */
export const DISPLAY_CURRENCY_STORAGE_KEY = "fq_display_currency";
export const DISPLAY_CURRENCY_EVENT = "fq_display_currency_change";

/**
 * Directional fx snapshot ppm, keyed merchant->display. Injected by the
 * server from `latestSnapshot` (see `fx.server.ts`); absent pairs mean "no
 * snapshot", never "assume parity".
 */
export type DisplayRateMap = {
  BDT_USD?: number;
  USD_BDT?: number;
};

export function isDisplayCurrency(code: string): code is DisplayCurrency {
  return code === "BDT" || code === "USD";
}

/** Shopper preference read. SSR-safe: no window on the server, default BDT. */
export function readStoredDisplayCurrency(): DisplayCurrency {
  if (typeof window === "undefined" || !window.localStorage) return "BDT";
  try {
    const stored = window.localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY);
    return stored !== null && isDisplayCurrency(stored) ? stored : "BDT";
  } catch {
    return "BDT";
  }
}

/** Shopper preference write + cross-tab/instance sync (mirrors timezone). */
export function writeStoredDisplayCurrency(next: DisplayCurrency): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (!isDisplayCurrency(next)) return;
  try {
    window.localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, next);
    window.dispatchEvent(
      new CustomEvent(DISPLAY_CURRENCY_EVENT, { detail: { currency: next } }),
    );
  } catch {
    /* storage unavailable — preference simply does not persist */
  }
}

/** React binding for the persisted preference; stays in sync across mounts. */
export function useDisplayCurrency(): [
  DisplayCurrency,
  (next: DisplayCurrency) => void,
] {
  const [code, setCode] = useState<DisplayCurrency>(() =>
    readStoredDisplayCurrency(),
  );

  useEffect(() => {
    const sync = () => setCode(readStoredDisplayCurrency());
    window.addEventListener(DISPLAY_CURRENCY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DISPLAY_CURRENCY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const select = useCallback((next: DisplayCurrency) => {
    if (!isDisplayCurrency(next)) return;
    writeStoredDisplayCurrency(next);
    setCode(next);
  }, []);

  return [code, select];
}

/** Directional snapshot ppm for merchant->display, or null (no conversion). */
export function displayRatePpm(
  merchant: DisplayCurrency,
  display: DisplayCurrency,
  rates?: DisplayRateMap,
): number | null {
  if (merchant === display) return null;
  const key = `${merchant}_${display}` as keyof DisplayRateMap;
  const ppm = rates?.[key];
  return typeof ppm === "number" && Number.isFinite(ppm) && ppm > 0
    ? ppm
    : null;
}

export type ConvertedDisplay = {
  minor: number;
  currency: DisplayCurrency;
  /** False when nothing was converted (same currency or no snapshot). */
  converted: boolean;
};

/**
 * Display-only conversion of a merchant-currency minor amount. Same half-up
 * integer-ppm maths as `convertWithSnapshot` (`fx.server.ts`); unknown inputs
 * fall back to the merchant amount so the UI can never print an unsourced
 * number. Checkout still charges `merchant` — see the disclosure microcopy.
 */
export function convertDisplayMinor(
  amountMinor: number | string | null | undefined,
  merchant: string,
  display: string,
  rates?: DisplayRateMap,
): ConvertedDisplay {
  const from: DisplayCurrency =
    isCurrency(merchant) && isDisplayCurrency(merchant) ? merchant : "BDT";
  const to: DisplayCurrency = isDisplayCurrency(display) ? display : "BDT";
  const raw =
    typeof amountMinor === "string" ? Number(amountMinor) : (amountMinor ?? 0);
  // The money constructor is the integer gate: non-integers throw here,
  // never downstream in formatting.
  const base = money(
    Number.isFinite(raw) ? Math.trunc(raw) : 0,
    from,
  );
  if (from === to) return { minor: base.minor, currency: from, converted: false };
  const ppm = displayRatePpm(from, to, rates);
  if (ppm === null)
    return { minor: base.minor, currency: from, converted: false };
  return {
    minor: Math.floor((base.minor * ppm) / 1_000_000 + 0.5),
    currency: to,
    converted: true,
  };
}

const SYMBOL: Record<DisplayCurrency, string> = { BDT: "৳", USD: "$" };

export function CurrencySwitcher({
  /** Charge currency. Checkout always settles in this code. Defaults to BDT. */
  merchantCurrency = "BDT",
  /** Server-injected directional snapshot ppm (`latestSnapshot`). */
  ratesPpm,
  /**
   * Optional merchant-currency minor amount to preview in the display
   * currency. The header mount omits it (selector + disclosure only); price
   * surfaces can adopt it once the server threads snapshots through.
   */
  amountMinor = null,
  className = "",
}: {
  merchantCurrency?: string;
  ratesPpm?: DisplayRateMap;
  amountMinor?: number | string | null;
  className?: string;
}) {
  const { t } = useLang();
  const [display, select] = useDisplayCurrency();
  const merchant: DisplayCurrency =
    isCurrency(merchantCurrency) && isDisplayCurrency(merchantCurrency)
      ? merchantCurrency
      : "BDT";

  const preview =
    amountMinor === null || amountMinor === undefined
      ? null
      : convertDisplayMinor(amountMinor, merchant, display, ratesPpm);

  return (
    <div className={`inline-flex flex-col items-end gap-1 ${className}`}>
      <div
        role="group"
        aria-label={t("Display currency", "প্রদর্শন মুদ্রা")}
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 p-1"
      >
        {DISPLAY_CURRENCIES.map((code) => {
          const active = display === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => select(code)}
              aria-pressed={active}
              aria-label={t(
                code === "BDT"
                  ? "Show prices in Bangladeshi Taka"
                  : "Show prices in US Dollars",
                code === "BDT"
                  ? "দাম বাংলাদেশি টাকায় দেখুন"
                  : "দাম মার্কিন ডলারে দেখুন",
              )}
              title={t(
                code === "BDT" ? "BDT (display only)" : "USD (display only)",
                code === "BDT"
                  ? "টাকা (শুধু প্রদর্শন)"
                  : "ডলার (শুধু প্রদর্শন)",
              )}
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                active
                  ? "bg-foreground/10 text-foreground"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              <span aria-hidden>{SYMBOL[code]}</span>
              <span>{code}</span>
            </button>
          );
        })}
      </div>
      {/* Charge-currency disclosure: display conversion only — the shopper is
          always charged in the merchant currency (no multi-currency price
          list exists). */}
      <p className="max-w-60 text-right text-[11px] leading-snug text-muted-foreground">
        {t(
          `For reference only — you’ll be charged in ${merchant}.`,
          `শুধু ধারণার জন্য — আপনার কাছ থেকে ${merchant}-তে চার্জ করা হবে।`,
        )}
      </p>
      {preview !== null && (
        <p
          aria-live="polite"
          className="text-right text-xs font-medium text-foreground"
        >
          {formatDisplayMoney(preview.minor, { currency: preview.currency })}
        </p>
      )}
    </div>
  );
}
