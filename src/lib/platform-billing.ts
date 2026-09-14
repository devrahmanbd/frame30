/**
 * Platform collection rail — pure domain (no I/O, no DB, no fetch).
 *
 * This is the layer that decides *how a merchant pays us*, which is a different
 * problem from how a shopper pays a merchant:
 *
 *  - The shopper rail (`payments.server.ts`) charges an **order** through the
 *    merchant's own gateway credentials. Money lands in the merchant's account.
 *  - This rail charges a **platform invoice** through the platform's own
 *    gateway account. Money lands with us. A merchant must never be able to
 *    settle our invoice with their own sandbox credentials, which is why the
 *    two rails share no secret, no table and no state machine.
 *
 * Everything here is deterministic so the contract test can assert the ladder,
 * the retry timings and the receipt arithmetic without a database. Amounts are
 * integer minor units end to end; there is no float arithmetic in this file.
 */
import { PAYMENT_METHOD_CATALOG, type PaymentMethodKey, type PaymentMethodSpec } from "./payment-rails";
import { fmtMinor } from "./money";

/** Charge lifecycle as stored in `platform_charges.status`. */
export type ChargeStatus = "created" | "pending" | "paid" | "failed" | "cancelled" | "expired";

export const TERMINAL_CHARGE_STATUSES: readonly ChargeStatus[] = [
  "paid",
  "failed",
  "cancelled",
  "expired",
];

/**
 * Legal transitions. A terminal state has no outgoing edge on purpose: a
 * duplicated provider callback must be a no-op, not a second settlement.
 */
const TRANSITIONS: Record<ChargeStatus, readonly ChargeStatus[]> = {
  created: ["pending", "failed", "cancelled", "expired"],
  pending: ["paid", "failed", "cancelled", "expired"],
  paid: [],
  failed: [],
  cancelled: [],
  expired: [],
};

export function canTransition(from: ChargeStatus, to: ChargeStatus) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function isTerminal(status: ChargeStatus) {
  return TERMINAL_CHARGE_STATUSES.includes(status);
}

/**
 * Rails we accept for our own invoices. Cash on delivery is excluded (there is
 * no courier between us and the merchant) and so is every rail whose settlement
 * we cannot reconcile against a bank statement.
 */
export const PLATFORM_METHOD_KEYS: readonly PaymentMethodKey[] = [
  "bkash",
  "nagad",
  "rocket",
  "card",
  "sslcommerz",
  "bank_transfer",
];

export type PlatformMethod = PaymentMethodSpec & {
  /** What the merchant is told before they are redirected. */
  noteEn: string;
  noteBn: string;
  /** True when settlement is manual and the invoice stays open until we confirm. */
  manualSettlement: boolean;
};

const NOTES: Record<string, { en: string; bn: string }> = {
  bkash: { en: "You will be sent to bKash to approve the payment.", bn: "পেমেন্ট অনুমোদনের জন্য আপনাকে বিকাশে পাঠানো হবে।" },
  nagad: { en: "You will be sent to Nagad to approve the payment.", bn: "পেমেন্ট অনুমোদনের জন্য আপনাকে নগদে পাঠানো হবে।" },
  rocket: { en: "You will be sent to Rocket to approve the payment.", bn: "পেমেন্ট অনুমোদনের জন্য আপনাকে রকেটে পাঠানো হবে।" },
  card: { en: "Card details are entered on the acquirer's page — we never see them.", bn: "কার্ডের তথ্য অ্যাকোয়ারারের পেজে দিতে হবে — আমরা কখনো দেখি না।" },
  sslcommerz: { en: "Pick card, internet banking or any wallet on the SSLCommerz page.", bn: "SSLCommerz পেজে কার্ড, ইন্টারনেট ব্যাংকিং বা যেকোনো ওয়ালেট বেছে নিন।" },
  bank_transfer: { en: "Transfer by BEFTN and send the reference — the invoice clears when we confirm receipt.", bn: "BEFTN-এ পাঠিয়ে রেফারেন্স দিন — আমরা প্রাপ্তি নিশ্চিত করলে ইনভয়েস পরিশোধিত হবে।" },
};

export function platformMethods(allowed?: readonly string[] | null): PlatformMethod[] {
  const filter = allowed && allowed.length ? new Set(allowed) : null;
  return PLATFORM_METHOD_KEYS.filter((key) => !filter || filter.has(key)).map((key) => {
    const spec = PAYMENT_METHOD_CATALOG[key];
    const note = NOTES[key] ?? { en: "", bn: "" };
    return {
      ...spec,
      noteEn: note.en,
      noteBn: note.bn,
      manualSettlement: key === "bank_transfer",
    };
  });
}

export function isPlatformMethod(value: string): value is PaymentMethodKey {
  return (PLATFORM_METHOD_KEYS as readonly string[]).includes(value);
}

// --------------------------------------------------------------- retry ladder
/**
 * Retry spacing after a declined attempt, in minutes from the failure. A wallet
 * decline is usually "insufficient balance", so the first retry is immediate;
 * after that we back off so a merchant tapping the button cannot generate a
 * provider-side velocity block on our own gateway account.
 */
export const RETRY_BACKOFF_MINUTES = [0, 5, 30, 180, 720] as const;

/** Attempts after which collection stops being self-serve and support takes it. */
export const MAX_SELF_SERVE_ATTEMPTS = RETRY_BACKOFF_MINUTES.length;

export function nextRetryAt(attempt: number, lastFailedAt: string | Date | null): Date | null {
  if (!lastFailedAt) return null;
  if (attempt >= MAX_SELF_SERVE_ATTEMPTS) return null;
  const minutes = RETRY_BACKOFF_MINUTES[Math.max(0, attempt - 1)] ?? 720;
  const base = new Date(lastFailedAt).getTime();
  if (!Number.isFinite(base)) return null;
  return new Date(base + minutes * 60_000);
}

export type FailureClass = {
  code: string;
  retryable: boolean;
  /** Whether trying a different rail is the useful next step. */
  switchRail: boolean;
  en: string;
  bn: string;
};

const FAILURES: Record<string, Omit<FailureClass, "code">> = {
  insufficient_balance: {
    retryable: true,
    switchRail: false,
    en: "The wallet did not have enough balance. Top up and try again.",
    bn: "ওয়ালেটে পর্যাপ্ত ব্যালেন্স ছিল না। রিচার্জ করে আবার চেষ্টা করুন।",
  },
  provider_declined: {
    retryable: true,
    switchRail: true,
    en: "The provider declined this payment. Try another method.",
    bn: "প্রোভাইডার পেমেন্টটি বাতিল করেছে। অন্য মাধ্যম ব্যবহার করুন।",
  },
  cancelled_by_user: {
    retryable: true,
    switchRail: false,
    en: "You cancelled on the payment page. Nothing was charged.",
    bn: "আপনি পেমেন্ট পেজে বাতিল করেছেন। কোনো টাকা কাটা হয়নি।",
  },
  expired: {
    retryable: true,
    switchRail: false,
    en: "The payment window closed before it was approved. Start again.",
    bn: "অনুমোদনের আগেই পেমেন্টের সময় শেষ হয়েছে। আবার শুরু করুন।",
  },
  superseded: {
    retryable: true,
    switchRail: false,
    en: "Replaced by a newer attempt on a different method.",
    bn: "অন্য মাধ্যমে নতুন চেষ্টা দিয়ে প্রতিস্থাপিত হয়েছে।",
  },
  gateway_unavailable: {
    retryable: true,
    switchRail: true,
    en: "The gateway did not respond. This is on our side — try again shortly.",
    bn: "গেটওয়ে সাড়া দেয়নি। এটি আমাদের দিকের সমস্যা — কিছুক্ষণ পরে চেষ্টা করুন।",
  },
  risk_blocked: {
    retryable: false,
    switchRail: true,
    en: "The acquirer blocked this attempt. Contact support with the invoice number.",
    bn: "অ্যাকোয়ারার এই চেষ্টাটি ব্লক করেছে। ইনভয়েস নম্বর নিয়ে সাপোর্টে যোগাযোগ করুন।",
  },
};

export function classifyFailure(code: string | null | undefined): FailureClass {
  const key = (code ?? "").trim() || "provider_declined";
  const found = FAILURES[key] ?? FAILURES["provider_declined"]!;
  return { code: key, ...found };
}

// ----------------------------------------------------------- collection state
export type CollectionInput = {
  invoiceStatus: string;
  attempts: number;
  liveCharge: boolean;
  pastDueDays: number | null;
  subscriptionStatus: string;
  lastFailureCode: string | null;
  lastFailedAt: string | null;
  now?: number;
};

export type CollectionVerdict = {
  kind: "settled" | "collect" | "resume" | "wait" | "support" | "not_chargeable";
  en: string;
  bn: string;
  retryAt: string | null;
  attemptsLeft: number;
  /** Storefront writes are already limited/paused at this point. */
  serviceLimited: boolean;
};

/**
 * The single place that decides what the merchant may do about an invoice right
 * now. The UI renders this verdict; it never re-derives the rule, so the button
 * a merchant sees and the guard the server applies can never disagree.
 */
export function collectionVerdict(input: CollectionInput): CollectionVerdict {
  const now = input.now ?? Date.now();
  const serviceLimited = ["past_due", "paused"].includes(input.subscriptionStatus);
  const attemptsLeft = Math.max(0, MAX_SELF_SERVE_ATTEMPTS - input.attempts);

  if (input.invoiceStatus === "paid") {
    return {
      kind: "settled",
      en: "Paid. The receipt is available below.",
      bn: "পরিশোধিত। রসিদ নিচে দেখা যাবে।",
      retryAt: null,
      attemptsLeft,
      serviceLimited: false,
    };
  }
  if (!["open", "past_due"].includes(input.invoiceStatus)) {
    return {
      kind: "not_chargeable",
      en: "This invoice cannot be paid.",
      bn: "এই ইনভয়েস পরিশোধ করা যাবে না।",
      retryAt: null,
      attemptsLeft: 0,
      serviceLimited,
    };
  }
  if (input.liveCharge) {
    return {
      kind: "resume",
      en: "A payment is already in progress. Resume it or cancel and pick another method.",
      bn: "একটি পেমেন্ট চলমান। সেটি চালিয়ে যান বা বাতিল করে অন্য মাধ্যম বেছে নিন।",
      retryAt: null,
      attemptsLeft,
      serviceLimited,
    };
  }
  if (attemptsLeft === 0) {
    return {
      kind: "support",
      en: "Five attempts failed on this invoice. Our team will contact you — or reach us with the invoice number.",
      bn: "এই ইনভয়েসে পাঁচবার চেষ্টা ব্যর্থ হয়েছে। আমাদের টিম যোগাযোগ করবে — অথবা ইনভয়েস নম্বর নিয়ে আমাদের জানান।",
      retryAt: null,
      attemptsLeft: 0,
      serviceLimited,
    };
  }

  const failure = classifyFailure(input.lastFailureCode);
  if (!failure.retryable && input.attempts > 0) {
    return {
      kind: "support",
      en: failure.en,
      bn: failure.bn,
      retryAt: null,
      attemptsLeft,
      serviceLimited,
    };
  }

  const retry = nextRetryAt(input.attempts, input.lastFailedAt);
  if (retry && retry.getTime() > now) {
    return {
      kind: "wait",
      en: `${failure.en} You can try again after ${retry.toISOString().slice(11, 16)} UTC.`,
      bn: `${failure.bn} ${retry.toISOString().slice(11, 16)} UTC-এর পরে আবার চেষ্টা করতে পারবেন।`,
      retryAt: retry.toISOString(),
      attemptsLeft,
      serviceLimited,
    };
  }

  return {
    kind: "collect",
    en: input.attempts > 0 ? failure.en : "Choose a payment method to settle this invoice.",
    bn: input.attempts > 0 ? failure.bn : "ইনভয়েস পরিশোধ করতে একটি পেমেন্ট মাধ্যম বেছে নিন।",
    retryAt: null,
    attemptsLeft,
    serviceLimited,
  };
}

// ------------------------------------------------------------------- receipts
export type ReceiptInput = {
  receiptNumber: string | null;
  invoiceNumber: string;
  plan: string;
  periodStart: string;
  periodEnd: string;
  subtotalMinorInt: number;
  vatMinorInt: number;
  vatRateBasisPoints: number;
  totalMinorInt: number;
  currencyCode: string;
  method: string;
  providerReference: string | null;
  paidAt: string | null;
  merchantName: string;
};

export type ReceiptLine = { label: string; labelBn: string; value: string };

/**
 * A receipt is a legal artefact in BD (VAT line, rate, period, reference), so
 * it is composed once here and reused by the screen, the PDF/print view and the
 * email template — three renderers of one truth rather than three truths.
 */
export function receiptLines(input: ReceiptInput): ReceiptLine[] {
  const cur = input.currencyCode;
  const restated = input.subtotalMinorInt + input.vatMinorInt;
  const lines: ReceiptLine[] = [
    { label: "Receipt", labelBn: "রসিদ", value: input.receiptNumber ?? "—" },
    { label: "Invoice", labelBn: "ইনভয়েস", value: input.invoiceNumber },
    { label: "Store", labelBn: "স্টোর", value: input.merchantName },
    { label: "Plan", labelBn: "প্ল্যান", value: input.plan },
    {
      label: "Period",
      labelBn: "সময়কাল",
      value: `${input.periodStart.slice(0, 10)} → ${input.periodEnd.slice(0, 10)}`,
    },
    { label: "Subtotal", labelBn: "সাবটোটাল", value: fmtMinor(input.subtotalMinorInt, cur) },
    {
      label: `VAT (${input.vatRateBasisPoints / 100}%)`,
      labelBn: `ভ্যাট (${input.vatRateBasisPoints / 100}%)`,
      value: fmtMinor(input.vatMinorInt, cur),
    },
    { label: "Total paid", labelBn: "মোট পরিশোধিত", value: fmtMinor(input.totalMinorInt, cur) },
    { label: "Method", labelBn: "মাধ্যম", value: methodLabel(input.method) },
    { label: "Reference", labelBn: "রেফারেন্স", value: input.providerReference ?? "—" },
    { label: "Paid at", labelBn: "পরিশোধের সময়", value: input.paidAt?.slice(0, 19).replace("T", " ") ?? "—" },
  ];
  // A receipt whose parts do not add up is worse than no receipt: say so loudly
  // instead of printing a number the merchant's accountant will reject.
  if (restated !== input.totalMinorInt) {
    lines.push({
      label: "Warning",
      labelBn: "সতর্কতা",
      value: "Totals do not reconcile — contact support before filing this receipt.",
    });
  }
  return lines;
}

export function methodLabel(method: string) {
  const spec = PAYMENT_METHOD_CATALOG[method as PaymentMethodKey];
  return spec ? `${spec.label} · ${spec.labelBn}` : method;
}

/** `true` when the receipt is safe to present as final and immutable. */
export function receiptIsFinal(status: ChargeStatus, receiptNumber: string | null) {
  return status === "paid" && !!receiptNumber;
}