/**
 * Pure commerce back-office logic — no I/O, no Supabase, no React.
 *
 * Everything here is deterministic so it can be unit tested and reused by both
 * the server layer and the admin UI without the two drifting apart.
 */

/* ----------------------------- barcodes / SKUs ---------------------------- */

/** GS1 mod-10 check digit for an EAN-13 body (12 digits) or UPC-A body (11). */
export function checkDigit(body: string): number {
  const digits = body.replace(/\D/g, "");
  let sum = 0;
  // Weights alternate 3/1 from the right-hand side of the body.
  for (let i = digits.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += Number(digits[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

/** Builds a valid EAN-13 from any numeric seed, padding or trimming as needed. */
export function ean13(seed: string | number, prefix = "200"): string {
  const digits = String(seed).replace(/\D/g, "");
  const body = (prefix.replace(/\D/g, "") + digits).slice(0, 12).padEnd(12, "0");
  return body + String(checkDigit(body));
}

export function isValidEan13(code: string): boolean {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 13) return false;
  return checkDigit(digits.slice(0, 12)) === Number(digits[12]);
}

/** Turns free text into a stable SKU prefix: `Blue Cotton Tee` -> `BLU-COT`. */
export function skuPrefix(...parts: (string | null | undefined)[]): string {
  const words = parts
    .filter(Boolean)
    .join(" ")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.slice(0, 3));
  return words.length ? words.join("-") : "SKU";
}

/* ------------------------------- pre-orders ------------------------------- */

export type BackorderPolicy = "deny" | "allow" | "preorder";

export type AvailabilityView = {
  allowed: boolean;
  label: string;
  tone: "ok" | "warn" | "blocked";
  /** True when the shopper is buying something that does not physically exist yet. */
  deferred: boolean;
};

/**
 * Shopper-facing wording for a stock decision. Deliberately honest: we never
 * say "in stock" for a backorder, because that is the promise customers hold
 * us to.
 */
export function availabilityView(input: {
  stock: number;
  quantity?: number;
  policy: BackorderPolicy;
  limit?: number;
  releaseAt?: string | null;
}): AvailabilityView {
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
  const stock = Math.floor(input.stock);
  if (stock >= quantity) {
    return {
      allowed: true,
      label: stock <= 5 ? `Only ${stock} left` : "In stock",
      tone: stock <= 5 ? "warn" : "ok",
      deferred: false,
    };
  }
  if (input.policy === "deny") {
    return { allowed: false, label: "Out of stock", tone: "blocked", deferred: false };
  }
  const shortfall = quantity - Math.max(stock, 0);
  const limit = Math.max(0, Math.floor(input.limit ?? 0));
  if (limit > 0 && shortfall > limit) {
    return { allowed: false, label: "Limit reached", tone: "blocked", deferred: false };
  }
  if (input.policy === "preorder") {
    const when = input.releaseAt ? new Date(input.releaseAt) : null;
    const date =
      when && !Number.isNaN(when.getTime())
        ? when.toLocaleDateString(undefined, { day: "numeric", month: "short" })
        : null;
    return {
      allowed: true,
      label: date ? `Pre-order — ships ${date}` : "Pre-order",
      tone: "warn",
      deferred: true,
    };
  }
  return { allowed: true, label: "Backorder — ships when restocked", tone: "warn", deferred: true };
}

/* ------------------------------ B2B pricing ------------------------------- */

export type PriceBreak = { minQuantity: number; priceMinor: number };

/**
 * Mirrors `public.price_for_customer`: the largest matching quantity break
 * wins, then a list-level percentage, then the catalogue price.
 */
export function resolvePrice(input: {
  baseMinor: number;
  quantity: number;
  kind?: "fixed" | "percent_off";
  adjustmentBp?: number;
  breaks?: PriceBreak[];
}): number {
  const qty = Math.max(1, Math.floor(input.quantity));
  const match = (input.breaks ?? [])
    .filter((b) => b.minQuantity <= qty)
    .sort((a, b) => b.minQuantity - a.minQuantity)[0];
  if (match) return Math.max(0, Math.floor(match.priceMinor));
  if (input.kind === "percent_off") {
    const bp = Math.min(10000, Math.max(0, Math.floor(input.adjustmentBp ?? 0)));
    return Math.max(0, input.baseMinor - Math.floor((input.baseMinor * bp) / 10000));
  }
  return Math.max(0, input.baseMinor);
}

/** Net terms due date, e.g. Net 30 from the invoice date. */
export function netTermsDueAt(issuedAt: Date, netDays: number): Date {
  const due = new Date(issuedAt.getTime());
  due.setDate(due.getDate() + Math.max(0, Math.floor(netDays)));
  return due;
}

/* ------------------------------ draft orders ------------------------------ */

export type DraftLine = { quantity: number; unitPriceMinor: number };

export function draftTotals(
  lines: DraftLine[],
  extras: { discountMinor?: number; shippingMinor?: number; vatMinor?: number } = {},
) {
  const subtotal = lines.reduce(
    (sum, l) => sum + Math.max(0, Math.floor(l.quantity)) * Math.max(0, Math.floor(l.unitPriceMinor)),
    0,
  );
  const discount = Math.min(Math.max(0, Math.floor(extras.discountMinor ?? 0)), subtotal);
  const shipping = Math.max(0, Math.floor(extras.shippingMinor ?? 0));
  const vat = Math.max(0, Math.floor(extras.vatMinor ?? 0));
  return { subtotal, discount, shipping, vat, total: subtotal - discount + shipping + vat };
}

/** A draft can only be shared once it has lines and a way to reach the buyer. */
export function canSendDraft(input: {
  lineCount: number;
  customerEmail: string;
  status: string;
}): { ok: boolean; reason?: string } {
  if (input.status !== "draft") return { ok: false, reason: "Already sent" };
  if (input.lineCount === 0) return { ok: false, reason: "Add at least one item" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.customerEmail.trim())) {
    return { ok: false, reason: "A valid customer email is required" };
  }
  return { ok: true };
}

/* -------------------------------- order tags ------------------------------ */

/** Tags are lower-cased, de-duplicated, capped, and safe for a URL filter. */
export function normaliseTags(input: string | string[], max = 20): string[] {
  const raw = Array.isArray(input) ? input : input.split(",");
  const seen = new Set<string>();
  for (const item of raw) {
    const tag = item
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9 _-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 32);
    if (tag) seen.add(tag);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/* ------------------------------- bulk editor ------------------------------ */

export type BulkRow = {
  variant_id: string;
  price_minor_int?: number;
  compare_at_minor_int?: number;
  stock_quantity?: number;
  sku?: string;
  barcode?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Splits a proposed batch into rows worth sending and rows we can explain
 * locally, so the operator sees mistakes before anything touches the database.
 */
export function validateBulkRows(rows: BulkRow[], max = 500) {
  const valid: BulkRow[] = [];
  const invalid: { row: BulkRow; reason: string }[] = [];
  for (const row of rows.slice(0, max)) {
    if (!UUID.test(row.variant_id ?? "")) {
      invalid.push({ row, reason: "Unknown product variant" });
      continue;
    }
    const numbers = [row.price_minor_int, row.compare_at_minor_int, row.stock_quantity];
    if (numbers.some((n) => n !== undefined && (!Number.isFinite(n) || n < 0))) {
      invalid.push({ row, reason: "Values cannot be negative" });
      continue;
    }
    if (numbers.every((n) => n === undefined) && !row.sku && !row.barcode) {
      invalid.push({ row, reason: "Nothing to change" });
      continue;
    }
    valid.push(row);
  }
  const overflow = rows.length > max ? rows.length - max : 0;
  return { valid, invalid, overflow };
}

/** Applies a percentage or absolute adjustment to a price, never below zero. */
export function adjustPrice(
  baseMinor: number,
  op: { mode: "percent" | "amount" | "set"; value: number },
): number {
  if (op.mode === "set") return Math.max(0, Math.round(op.value));
  if (op.mode === "amount") return Math.max(0, Math.round(baseMinor + op.value));
  return Math.max(0, Math.round(baseMinor + (baseMinor * op.value) / 100));
}

/* ------------------------------ subscriptions ----------------------------- */

export type IntervalUnit = "day" | "week" | "month" | "year";

/** Deterministic key so a retried worker can never charge a cycle twice. */
export function chargeKey(subscriptionId: string, cycle: number): string {
  return `sub:${subscriptionId}:cycle:${cycle}`;
}

export function nextPeriodEnd(from: Date, unit: IntervalUnit, count: number): Date {
  const n = Math.max(1, Math.floor(count));
  const d = new Date(from.getTime());
  if (unit === "day") d.setDate(d.getDate() + n);
  else if (unit === "week") d.setDate(d.getDate() + n * 7);
  else if (unit === "year") d.setFullYear(d.getFullYear() + n);
  else d.setMonth(d.getMonth() + n);
  return d;
}

/** Dunning: retry after 1, 2 then 3 days, then stop and mark past due. */
export function dunningPlan(failureCount: number): { retryInDays: number | null; pastDue: boolean } {
  const n = Math.max(0, Math.floor(failureCount));
  if (n >= 3) return { retryInDays: null, pastDue: true };
  return { retryInDays: n + 1, pastDue: false };
}

export function subscriptionStatusLabel(status: string): { label: string; tone: string } {
  switch (status) {
    case "trialing":
      return { label: "Trial", tone: "text-primary" };
    case "active":
      return { label: "Active", tone: "text-primary" };
    case "past_due":
      return { label: "Past due", tone: "text-destructive" };
    case "paused":
      return { label: "Paused", tone: "text-muted-foreground" };
    default:
      return { label: "Cancelled", tone: "text-muted-foreground" };
  }
}

/* -------------------------------- purchasing ------------------------------ */

export function receivingProgress(items: { ordered: number; received: number }[]) {
  const ordered = items.reduce((s, i) => s + Math.max(0, i.ordered), 0);
  const received = items.reduce((s, i) => s + Math.max(0, Math.min(i.received, i.ordered)), 0);
  return {
    ordered,
    received,
    outstanding: ordered - received,
    percent: ordered === 0 ? 0 : Math.round((received / ordered) * 100),
    complete: ordered > 0 && received >= ordered,
  };
}
