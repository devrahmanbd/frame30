/**
 * Merchant payout rules — pure, deterministic, unit-tested.
 *
 * Money leaving the platform is the highest-blast-radius action in the product,
 * so the policy lives in one place rather than being scattered across handlers:
 *
 *  - the payout state machine is explicit and one-directional (no "just set it
 *    to paid"),
 *  - the payable balance is derived from the ledger, never stored,
 *  - dual approval is required above a threshold, self-approval is refused, and
 *    the requester never counts as an approver,
 *  - destination accounts are validated for the rail (BD MSISDN vs bank
 *    account) before anyone can request money against them.
 *
 * Every amount is integer minor units. No float ever appears in this file.
 */

export const PAYOUT_STATES = [
  "draft",
  "requested",
  "approved",
  "processing",
  "paid",
  "failed",
  "cancelled",
  "reversed",
] as const;
export type PayoutState = (typeof PAYOUT_STATES)[number];

const TRANSITIONS: Record<PayoutState, PayoutState[]> = {
  draft: ["requested", "cancelled"],
  requested: ["approved", "cancelled"],
  approved: ["processing", "cancelled"],
  processing: ["paid", "failed"],
  paid: ["reversed"],
  failed: ["requested", "cancelled"],
  cancelled: [],
  reversed: [],
};

export function payoutCanTransition(from: PayoutState, to: PayoutState) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** States that still reserve merchant balance (money promised but not gone). */
export const RESERVING_STATES: PayoutState[] = ["requested", "approved", "processing"];

/* -------------------------------- balance -------------------------------- */

export type LedgerSlice = { direction: "credit" | "debit"; sellerMinor: number };

export type BalanceInput = {
  entries: LedgerSlice[];
  /** Sum of payouts already in flight (requested/approved/processing). */
  reservedMinor: number;
  /** Risk / dispute holds applied by the platform. */
  holdMinor?: number;
};

export type Balance = { grossMinor: number; reservedMinor: number; holdMinor: number; availableMinor: number };

export function computeBalance(input: BalanceInput): Balance {
  const grossMinor = input.entries.reduce(
    (sum, e) => sum + (e.direction === "credit" ? e.sellerMinor : -e.sellerMinor),
    0,
  );
  const holdMinor = Math.max(0, input.holdMinor ?? 0);
  const reservedMinor = Math.max(0, input.reservedMinor);
  return {
    grossMinor,
    reservedMinor,
    holdMinor,
    availableMinor: Math.max(0, grossMinor - reservedMinor - holdMinor),
  };
}

/* -------------------------------- amounts -------------------------------- */

export const MIN_PAYOUT_MINOR = 50_000; // BDT 500.00
export const MAX_PAYOUT_MINOR = 500_000_000; // BDT 5,000,000.00 per instruction
export const DUAL_APPROVAL_THRESHOLD_MINOR = 2_500_00; // BDT 2,500.00

export type PayoutMethod = "mfs" | "bank";

/** Rail fee, integer minor units, rounded half-up and floored at the fixed part. */
export function payoutFeeMinor(amountMinor: number, method: PayoutMethod): number {
  if (amountMinor <= 0) return 0;
  if (method === "mfs") {
    // 1.25% capped at BDT 50.00 — matches the MFS disbursement contract.
    return Math.min(5_000, Math.round((amountMinor * 125) / 10_000));
  }
  // BEFTN flat fee.
  return 1_500;
}

export function netPayoutMinor(amountMinor: number, method: PayoutMethod) {
  return Math.max(0, amountMinor - payoutFeeMinor(amountMinor, method));
}

export type AmountVerdict = { ok: boolean; code: null | "payout.below_minimum" | "payout.above_maximum" | "payout.insufficient_balance" | "payout.not_integer" };

export function validateAmount(amountMinor: number, availableMinor: number): AmountVerdict {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return { ok: false, code: "payout.not_integer" };
  if (amountMinor < MIN_PAYOUT_MINOR) return { ok: false, code: "payout.below_minimum" };
  if (amountMinor > MAX_PAYOUT_MINOR) return { ok: false, code: "payout.above_maximum" };
  if (amountMinor > availableMinor) return { ok: false, code: "payout.insufficient_balance" };
  return { ok: true, code: null };
}

/* ------------------------------- approvals ------------------------------- */

export type Approval = { actorId: string; decision: "approve" | "reject"; at: string };

export function approvalsRequired(amountMinor: number) {
  return amountMinor >= DUAL_APPROVAL_THRESHOLD_MINOR ? 2 : 1;
}

export type ApprovalVerdict = {
  required: number;
  approvals: number;
  satisfied: boolean;
  rejected: boolean;
  blocked: null | "payout.self_approval" | "payout.duplicate_approver";
};

/**
 * Counts distinct approvers. The requester is excluded (four-eyes), a repeat
 * decision by the same actor never counts twice, and a single rejection stops
 * the payout regardless of how many approvals came before it.
 */
export function evaluateApprovals(input: {
  amountMinor: number;
  requesterId: string;
  approvals: Approval[];
}): ApprovalVerdict {
  const required = approvalsRequired(input.amountMinor);
  const seen = new Set<string>();
  let approvals = 0;
  let rejected = false;
  let blocked: ApprovalVerdict["blocked"] = null;
  for (const a of input.approvals) {
    if (a.decision === "reject") rejected = true;
    if (a.actorId === input.requesterId) {
      blocked = "payout.self_approval";
      continue;
    }
    if (seen.has(a.actorId)) {
      blocked = blocked ?? "payout.duplicate_approver";
      continue;
    }
    seen.add(a.actorId);
    if (a.decision === "approve") approvals += 1;
  }
  return { required, approvals, satisfied: !rejected && approvals >= required, rejected, blocked };
}

/* ------------------------------ destinations ------------------------------ */

const BD_MSISDN = /^01[3-9]\d{8}$/;

export function normalizeMsisdn(raw: string) {
  const digits = (raw ?? "").replace(/[^\d]/g, "");
  if (digits.startsWith("880")) return `0${digits.slice(3)}`;
  if (digits.startsWith("8801")) return `0${digits.slice(3)}`;
  return digits;
}

export type AccountVerdict = { ok: boolean; code: null | "payout.bad_msisdn" | "payout.bad_account_number" | "payout.bad_holder" | "payout.bad_bank" };

export function validateAccount(input: {
  method: PayoutMethod;
  holderName: string;
  msisdn?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
}): AccountVerdict {
  if (!input.holderName || input.holderName.trim().length < 3) return { ok: false, code: "payout.bad_holder" };
  if (input.method === "mfs") {
    return BD_MSISDN.test(normalizeMsisdn(input.msisdn ?? ""))
      ? { ok: true, code: null }
      : { ok: false, code: "payout.bad_msisdn" };
  }
  if (!input.bankName || input.bankName.trim().length < 2) return { ok: false, code: "payout.bad_bank" };
  const acct = (input.accountNumber ?? "").replace(/[\s-]/g, "");
  if (!/^\d{8,20}$/.test(acct)) return { ok: false, code: "payout.bad_account_number" };
  return { ok: true, code: null };
}

/** Display form — never show a full destination number in a list view. */
export function maskDestination(input: { method: PayoutMethod; msisdn?: string | null; accountNumber?: string | null }) {
  const raw = (input.method === "mfs" ? input.msisdn : input.accountNumber) ?? "";
  const v = raw.replace(/[\s-]/g, "");
  return v.length <= 4 ? "••••" : `••••${v.slice(-4)}`;
}

/* --------------------------------- retries -------------------------------- */

export const MAX_PAYOUT_ATTEMPTS = 5;

/** Exponential backoff for a failed disbursement, capped at 6 hours. */
export function retryDelaySeconds(attempt: number) {
  const base = 60 * 2 ** Math.max(0, attempt - 1);
  return Math.min(base, 6 * 60 * 60);
}
