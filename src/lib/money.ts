/**
 * Money core. Integer minor units only — no float ever enters or leaves.
 *
 * Every amount is a `Money` pair of `{ currency, minor }`. Arithmetic refuses
 * to mix currencies, rate application rounds half-up on the minor unit, and
 * proportional splits use the largest-remainder method so the parts always sum
 * back to the whole (no lost or invented paisa).
 */

export type CurrencyCode = "BDT" | "USD";

export type Money = { currency: CurrencyCode; minor: number };

const MINOR_DIGITS: Record<CurrencyCode, number> = { BDT: 2, USD: 2 };
const SYMBOL: Record<CurrencyCode, string> = { BDT: "৳", USD: "$" };

export class MoneyError extends Error {
  constructor(
    readonly code:
      | "money.not_integer"
      | "money.currency_mismatch"
      | "money.negative"
      | "money.unsupported_currency",
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "MoneyError";
  }
}

export function isCurrency(code: string): code is CurrencyCode {
  return code === "BDT" || code === "USD";
}

/** Constructor — the single door into the money type. */
export function money(minor: number, currency: string = "BDT"): Money {
  if (!isCurrency(currency)) throw new MoneyError("money.unsupported_currency", currency);
  if (!Number.isInteger(minor)) throw new MoneyError("money.not_integer", String(minor));
  if (!Number.isSafeInteger(minor)) throw new MoneyError("money.not_integer", "out of safe range");
  return { currency, minor };
}

/** Reads a bigint-backed column (PostgREST may hand back a string). */
export function fromColumn(value: number | string | null | undefined, currency = "BDT"): Money {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return money(n, currency);
}

export function zero(currency: CurrencyCode = "BDT"): Money {
  return { currency, minor: 0 };
}

function same(a: Money, b: Money) {
  if (a.currency !== b.currency) {
    throw new MoneyError("money.currency_mismatch", `${a.currency} vs ${b.currency}`);
  }
}

export function add(...parts: Money[]): Money {
  if (parts.length === 0) return zero();
  const head = parts[0] as Money;
  return parts.slice(1).reduce((acc, p) => {
    same(acc, p);
    return money(acc.minor + p.minor, acc.currency);
  }, head);
}

export function sub(a: Money, b: Money): Money {
  same(a, b);
  return money(a.minor - b.minor, a.currency);
}

/** Never below zero — used for discount clamping. */
export function clampAtZero(a: Money): Money {
  return a.minor < 0 ? zero(a.currency) : a;
}

export function times(a: Money, quantity: number): Money {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyError("money.not_integer", `quantity ${quantity}`);
  }
  return money(a.minor * quantity, a.currency);
}

export function compare(a: Money, b: Money) {
  same(a, b);
  return a.minor === b.minor ? 0 : a.minor < b.minor ? -1 : 1;
}

/**
 * Half-up rounding is the pinned policy for the whole platform: BD invoices
 * round the paisa up at .5 so the customer-facing total never under-collects
 * VAT. `basisPoints` is an integer (1500 = 15%).
 */
export function applyBasisPoints(a: Money, basisPoints: number): Money {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new MoneyError("money.not_integer", `basisPoints ${basisPoints}`);
  }
  const scaled = a.minor * basisPoints;
  const rounded = Math.floor(scaled / 10000 + 0.5);
  return money(rounded, a.currency);
}

/** Percentage-off helper with the same pinned rounding. */
export function percentOff(a: Money, basisPoints: number): Money {
  return applyBasisPoints(a, basisPoints);
}

/**
 * Largest-remainder allocation. Splits `total` across `weights` so the parts
 * sum to exactly `total.minor`; the remainder paisa go to the largest
 * fractional parts, ties resolved by original order (deterministic).
 */
export function allocate(total: Money, weights: number[]): Money[] {
  if (weights.some((w) => w < 0)) throw new MoneyError("money.negative", "weight");
  const weightSum = weights.reduce((s, w) => s + w, 0);
  if (weightSum === 0) return weights.map(() => zero(total.currency));

  const exact = weights.map((w) => (total.minor * w) / weightSum);
  const floors = exact.map((e) => Math.floor(e));
  let remainder = total.minor - floors.reduce((s, f) => s + f, 0);

  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => (b.frac === a.frac ? a.i - b.i : b.frac - a.frac));

  const out = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] = (out[i] as number) + 1;
    remainder -= 1;
  }
  return out.map((minor) => money(minor, total.currency));
}

/** Splits proportionally to line totals — the refund/VAT allocation entry point. */
export function allocateByLines(total: Money, lineTotals: Money[]): Money[] {
  lineTotals.forEach((l) => same(total, l));
  return allocate(
    total,
    lineTotals.map((l) => l.minor),
  );
}

export function minorDigits(currency: CurrencyCode) {
  return MINOR_DIGITS[currency];
}

/** The single presentation helper. Tabular-nums is applied by the CSS class. */
export function fmtMinor(amountMinor: number | string, currency = "BDT") {
  const code = isCurrency(currency) ? currency : "BDT";
  const digits = MINOR_DIGITS[code];
  const n = typeof amountMinor === "string" ? Number(amountMinor) : amountMinor;
  const major = (Number.isFinite(n) ? n : 0) / 10 ** digits;
  return `${SYMBOL[code]} ${major.toLocaleString("en-BD", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function fmtMoney(m: Money) {
  return fmtMinor(m.minor, m.currency);
}
