/**
 * Phase 1.2 — the one display helper for money.
 *
 * Widgets never do money arithmetic: the server ships integer minor units and
 * this module turns them into a string. Division, rounding and currency
 * conversion all live server-side (`src/lib/money.ts`), and a registry test
 * fails the build if a widget file starts dividing by 100 again.
 */
import { fmtMinor, isCurrency } from "./money";
import { toDigits, type DigitSystem, type Locale } from "./bitext";

export type MoneyDisplayOptions = {
  locale?: Locale;
  /** Numeral system; comes from the theme token `--fq-digits`. */
  digits?: DigitSystem;
  currency?: string;
  /** Drop the fraction part when the amount is whole (৳ 1,200 not ৳ 1,200.00). */
  compact?: boolean;
  /** Theme-level choice: the ৳ symbol or the ISO code. */
  currencyDisplay?: "symbol" | "code";
};

/**
 * Formats a server-provided integer amount for display. Never accepts a float
 * major-unit amount — that is the bug this function exists to prevent.
 */
export function formatDisplayMoney(
  amountMinor: number | string | null | undefined,
  options: MoneyDisplayOptions = {},
): string {
  const currency = options.currency && isCurrency(options.currency) ? options.currency : "BDT";
  const raw = typeof amountMinor === "string" ? Number(amountMinor) : (amountMinor ?? 0);
  const minor = Number.isFinite(raw) ? Math.trunc(raw) : 0;
  let out = fmtMinor(minor, currency);
  if (options.compact && minor % 100 === 0) out = out.replace(/\.00\b/, "");
  if (options.currencyDisplay === "code") {
    // Symbol swap only — never touches the digits the server sent.
    out = out.replace(/^[^\d\-]*\s?/, `${currency} `);
  }
  return toDigits(out, options.digits ?? (options.locale === "bn" ? "bengali" : "latin"));
}

/** Quantities, ratings, counts — same digit rules, no currency symbol. */
export function formatDisplayNumber(
  value: number | null | undefined,
  options: { digits?: DigitSystem; locale?: Locale } = {},
): string {
  const n = Number.isFinite(value ?? NaN) ? (value as number) : 0;
  return toDigits(
    n.toLocaleString("en-BD"),
    options.digits ?? (options.locale === "bn" ? "bengali" : "latin"),
  );
}
