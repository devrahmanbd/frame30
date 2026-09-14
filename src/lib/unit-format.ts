/**
 * Phase 3.2 — one place that turns a number + unit into display text.
 *
 * Digits and currency display come from the theme (`ThemeSurface`), so a
 * widget never decides numeral system on its own, and never does arithmetic
 * on money: `bdt` values are integer minor units the server produced.
 */
import { toDigits, type DigitSystem, type Locale } from "./bitext";
import { formatDisplayMoney, formatDisplayNumber } from "./money-display";

export type UnitKind = "bdt" | "mah" | "gb" | "ml" | "g" | "months" | "percent" | "count";

export const UNIT_KINDS: UnitKind[] = ["bdt", "mah", "gb", "ml", "g", "months", "percent", "count"];

export type UnitFormatOptions = {
  digits?: DigitSystem;
  locale?: Locale;
  currency?: string;
  currencyDisplay?: "symbol" | "code";
};

const SUFFIX: Record<Exclude<UnitKind, "bdt" | "count">, { en: string; bn: string }> = {
  mah: { en: " mAh", bn: " mAh" },
  gb: { en: " GB", bn: " জিবি" },
  ml: { en: " ml", bn: " মিলি" },
  g: { en: " g", bn: " গ্রাম" },
  months: { en: " months", bn: " মাস" },
  percent: { en: "%", bn: "%" },
};

/** Formats a stored numeric prop for display under the active theme tokens. */
export function formatUnit(
  value: number | string | null | undefined,
  unit: UnitKind,
  options: UnitFormatOptions = {},
): string {
  const locale: Locale = options.locale ?? "en";
  const digits: DigitSystem = options.digits ?? (locale === "bn" ? "bengali" : "latin");

  if (unit === "bdt") {
    return formatDisplayMoney(value, {
      digits,
      locale,
      compact: true,
      ...(options.currency ? { currency: options.currency } : {}),
      ...(options.currencyDisplay ? { currencyDisplay: options.currencyDisplay } : {}),
    });
  }

  const raw = typeof value === "string" ? Number(value) : (value ?? 0);
  const n = Number.isFinite(raw) ? raw : 0;
  const text = formatDisplayNumber(n, { digits, locale });
  if (unit === "count") return text;
  const suffix = SUFFIX[unit];
  return `${text}${locale === "bn" ? suffix.bn : suffix.en}`;
}

/** Bare digit conversion for strings a widget already assembled. */
export function formatDigits(text: string, digits: DigitSystem): string {
  return toDigits(text, digits);
}

/** Short label shown next to a `unit` field in the inspector. */
export function unitLabel(unit: UnitKind, locale: Locale): string {
  if (unit === "bdt") return locale === "bn" ? "৳" : "BDT";
  if (unit === "count") return locale === "bn" ? "সংখ্যা" : "count";
  const suffix = SUFFIX[unit];
  return (locale === "bn" ? suffix.bn : suffix.en).trim();
}
