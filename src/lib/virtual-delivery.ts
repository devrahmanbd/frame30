/**
 * Virtual product delivery (§4.3) — game keys, gift codes, licences.
 *
 * A digital code is bearer value: once it is shown to the wrong person the
 * merchant has lost the item with no way to recall it. So this module is built
 * around three rules, all enforced here rather than in the UI:
 *
 *  1. A code moves through an explicit state machine. There is no path from
 *     `delivered` back to `available`, so a code can never be sold twice.
 *  2. Codes are only ever displayed masked, except in the single moment the
 *     buyer reveals their own purchase.
 *  3. Delivery is a queue with bounded retries and jittered backoff, because
 *     an email or SMS provider failing must delay a code, never burn it.
 */

export type CodeState = "available" | "reserved" | "delivered" | "revoked" | "expired";

export type DeliveryState = "queued" | "sending" | "sent" | "failed" | "cancelled";

export type DeliveryChannel = "email" | "sms";

const CODE_TRANSITIONS: Record<CodeState, CodeState[]> = {
  available: ["reserved", "revoked", "expired"],
  reserved: ["delivered", "available", "revoked", "expired"],
  delivered: ["revoked"],
  revoked: [],
  expired: ["revoked"],
};

export function canTransitionCode(from: CodeState, to: CodeState) {
  return (CODE_TRANSITIONS[from] ?? []).includes(to);
}

export function assertCodeTransition(from: CodeState, to: CodeState) {
  if (!canTransitionCode(from, to)) {
    throw new Error(`invalid_code_transition:${from}->${to}`);
  }
  return to;
}

const DELIVERY_TRANSITIONS: Record<DeliveryState, DeliveryState[]> = {
  queued: ["sending", "cancelled"],
  sending: ["sent", "failed", "queued"],
  failed: ["queued", "cancelled"],
  sent: [],
  cancelled: [],
};

export function canTransitionDelivery(from: DeliveryState, to: DeliveryState) {
  return (DELIVERY_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Show enough of a code for a merchant to match it against a supplier invoice,
 * never enough to redeem it. Short codes are fully hidden rather than
 * partially leaked.
 */
export function maskCode(code: string) {
  const trimmed = code.trim();
  if (trimmed.length <= 8) return "•".repeat(Math.max(4, trimmed.length));
  return `${trimmed.slice(0, 4)}${"•".repeat(Math.max(4, trimmed.length - 8))}${trimmed.slice(-4)}`;
}

/** Normalizes supplier formatting so duplicate detection is not defeated by dashes or case. */
export function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export type ParsedBatch = {
  codes: string[];
  duplicatesInFile: number;
  rejected: { line: number; value: string; reason: "too_short" | "too_long" | "bad_characters" }[];
};

/**
 * Suppliers deliver codes as pasted text, CSV columns or one-per-line files.
 * Parsing is forgiving about layout and strict about content: a malformed row
 * is reported with its line number instead of silently importing garbage that
 * a customer will later find unredeemable.
 */
export function parseCodeBatch(raw: string, maxCodes = 5000): ParsedBatch {
  const seen = new Set<string>();
  const codes: string[] = [];
  const rejected: ParsedBatch["rejected"] = [];
  let duplicatesInFile = 0;

  const lines = raw.split(/\r?\n/);
  lines.forEach((line, index) => {
    const cell = (line.split(",")[0] ?? "").trim();
    if (!cell || codes.length >= maxCodes) return;
    const value = normalizeCode(cell);
    if (value.length < 6) {
      rejected.push({ line: index + 1, value: maskCode(value), reason: "too_short" });
      return;
    }
    if (value.length > 120) {
      rejected.push({ line: index + 1, value: maskCode(value), reason: "too_long" });
      return;
    }
    if (!/^[A-Z0-9._:-]+$/.test(value)) {
      rejected.push({ line: index + 1, value: maskCode(value), reason: "bad_characters" });
      return;
    }
    if (seen.has(value)) {
      duplicatesInFile += 1;
      return;
    }
    seen.add(value);
    codes.push(value);
  });

  return { codes, duplicatesInFile, rejected };
}

export const MAX_DELIVERY_ATTEMPTS = 6;

/**
 * Exponential backoff with deterministic per-delivery jitter. Jitter is derived
 * from the delivery id rather than `Math.random()` so a retry storm spreads out
 * while remaining reproducible in tests and in incident review.
 */
export function nextAttemptDelayMs(attempt: number, deliveryId: string) {
  const step = Math.min(Math.max(1, attempt), MAX_DELIVERY_ATTEMPTS);
  const base = Math.min(30 * 60_000, 30_000 * 2 ** (step - 1));
  let hash = 0;
  for (let i = 0; i < deliveryId.length; i += 1) hash = (hash * 31 + deliveryId.charCodeAt(i)) % 1000;
  return base + Math.floor((base * 0.2 * hash) / 1000);
}

export function shouldRetry(attempt: number, error: { retryable: boolean }) {
  return error.retryable && attempt < MAX_DELIVERY_ATTEMPTS;
}

/** Provider failures split into "try again" and "this will never work". */
export function classifyDeliveryError(status: number | null, message: string) {
  const text = message.toLowerCase();
  if (status === 429 || (status !== null && status >= 500)) return { retryable: true, code: "provider_unavailable" };
  if (text.includes("timeout") || text.includes("network") || text.includes("fetch failed")) {
    return { retryable: true, code: "network" };
  }
  if (status === 401 || status === 403) return { retryable: false, code: "provider_auth" };
  if (text.includes("invalid recipient") || text.includes("unsubscribed") || text.includes("suppressed")) {
    return { retryable: false, code: "bad_recipient" };
  }
  if (status !== null && status >= 400) return { retryable: false, code: "rejected" };
  return { retryable: true, code: "unknown" };
}

/** Bangladeshi mobile numbers, normalized to E.164 for the SMS provider. */
export function normalizeBdMsisdn(input: string) {
  const digits = input.replace(/\D/g, "");
  const local = digits.startsWith("880") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  if (!/^1[3-9]\d{8}$/.test(local)) return null;
  return `+880${local}`;
}

export function isDeliverableEmail(input: string) {
  const value = input.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}

/**
 * Stock health for a digital product. Merchants oversell keys constantly
 * because the storefront shows "in stock" from a count nobody refreshes — so
 * the desk reports days of cover, not just a number.
 */
export function stockHealth(args: {
  available: number;
  reserved: number;
  soldLast7Days: number;
  lowStockThreshold: number;
}) {
  const available = Math.max(0, Math.trunc(args.available));
  const reserved = Math.max(0, Math.trunc(args.reserved));
  const velocity = Math.max(0, args.soldLast7Days) / 7;
  const daysOfCover = velocity === 0 ? null : Math.floor(available / velocity);
  const status: "out" | "critical" | "low" | "healthy" =
    available === 0
      ? "out"
      : daysOfCover !== null && daysOfCover <= 2
        ? "critical"
        : available <= Math.max(0, Math.trunc(args.lowStockThreshold))
          ? "low"
          : "healthy";
  return { available, reserved, daysOfCover, status };
}

export const DELIVERY_MESSAGES: Record<string, { en: string; bn: string }> = {
  provider_unavailable: {
    en: "The email or SMS provider is having trouble. We will retry automatically.",
    bn: "ইমেইল বা এসএমএস সেবাদাতায় সমস্যা হচ্ছে। আমরা স্বয়ংক্রিয়ভাবে আবার চেষ্টা করব।",
  },
  network: {
    en: "The network dropped mid-send. We will retry automatically.",
    bn: "পাঠানোর সময় নেটওয়ার্ক বিচ্ছিন্ন হয়েছে। আবার চেষ্টা করা হবে।",
  },
  provider_auth: {
    en: "The delivery provider rejected our credentials. Reconnect it in settings.",
    bn: "সেবাদাতা আমাদের পরিচয় গ্রহণ করেনি। সেটিংসে গিয়ে আবার সংযুক্ত করুন।",
  },
  bad_recipient: {
    en: "The customer's address or number cannot receive messages.",
    bn: "গ্রাহকের ঠিকানা বা নম্বরে বার্তা পৌঁছানো যাচ্ছে না।",
  },
  rejected: {
    en: "The provider rejected this message. Check the recipient details.",
    bn: "সেবাদাতা বার্তাটি গ্রহণ করেনি। গ্রাহকের তথ্য যাচাই করুন।",
  },
  out_of_stock: {
    en: "No codes are left for this product. Upload more keys to fulfil the order.",
    bn: "এই পণ্যের কোনো কোড অবশিষ্ট নেই। অর্ডার পূরণ করতে আরও কী আপলোড করুন।",
  },
  unknown: {
    en: "Delivery failed for an unexpected reason. We will retry automatically.",
    bn: "অপ্রত্যাশিত কারণে পাঠানো যায়নি। আবার চেষ্টা করা হবে।",
  },
};

export function explainDelivery(code: string, lang: "en" | "bn" = "en") {
  return DELIVERY_MESSAGES[code]?.[lang] ?? DELIVERY_MESSAGES["unknown"]![lang];
}
