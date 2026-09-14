/**
 * Provider sign-off gate — pure rules (no I/O, no DB, no clock beyond what the
 * caller passes in).
 *
 * A live payment rail is never "just a credential row". Going live with bKash,
 * Nagad, Rocket, a bank rail, card acquiring or a BNPL/EMI product means real
 * regulated money moves, so this module encodes the *policy*:
 *
 *  - each provider declares the evidence it needs before anyone may submit,
 *  - credentials walk an explicit state machine (no jumping to `live`),
 *  - a sandbox credential and a live credential are different rows and are
 *    never interchangeable,
 *  - BNPL/EMI eligibility is a deterministic function of the cart amount and
 *    the provider's published plan table, never a guess at checkout time.
 *
 * Everything here is unit-tested; the server module owns tenancy, audit,
 * rate limits and metrics.
 */

export type Rail = "mfs" | "bank" | "card" | "bnpl" | "aggregator";

export const PROVIDER_KEYS = [
  // MFS wallets — each is its own contract with its own credentials.
  "bkash",
  "nagad",
  "rocket",
  "upay",
  "tap",
  "mcash",
  "surecash",
  // Bank wallet and direct rails.
  "cellfin",
  "bank_transfer",
  "card_acquiring",
  // Aggregators — one contract fronting cards, net-banking and wallets.
  "sslcommerz",
  "aamarpay",
  "shurjopay",
  "portwallet",
  // Deferred payment.
  "bkash_paylater",
  "nagad_bnpl",
  "bank_emi",
  // Community plugins — unofficial, self-hosted, as-is.
  "piprapay",
] as const;

export type ProviderKey = (typeof PROVIDER_KEYS)[number];

export const CHECKLIST_KEYS = [
  "trade_licence",
  "bin_tin",
  "kyc_approved",
  "bank_account_verified",
  "settlement_account",
  "merchant_agreement_signed",
  "provider_merchant_id",
  "provider_app_credentials",
  "webhook_endpoint_verified",
  "refund_policy_published",
  "pci_saq_attested",
  "bnpl_risk_disclosure",
  "emi_tenor_agreement",
] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

export type EmiPlan = { months: number; minAmountMinor: number; interestBps: number };

export type ProviderSpec = {
  key: ProviderKey;
  rail: Rail;
  label: string;
  labelBn: string;
  /** Evidence required before the merchant may submit for review. */
  requires: ChecklistKey[];
  /** Secret field names the merchant must supply for the live environment. */
  secretFields: string[];
  settlementDays: number;
  supportsRefund: boolean;
  /** Regulator-facing note surfaced in the UI and in licensing.md. */
  regulatory: string;
  emiPlans?: EmiPlan[];
  /** `community` = unofficial contributed plugin, supported by its own vendor. */
  support?: "community";
};


const MFS_CHECKS: ChecklistKey[] = [
  "trade_licence",
  "bin_tin",
  "kyc_approved",
  "settlement_account",
  "merchant_agreement_signed",
  "provider_merchant_id",
  "provider_app_credentials",
  "webhook_endpoint_verified",
  "refund_policy_published",
];

/**
 * Aggregators front card rails, so they carry the MFS evidence *plus* a PCI
 * SAQ attestation and a verified bank account for netted settlement.
 */
const AGGREGATOR_CHECKS: ChecklistKey[] = [...MFS_CHECKS, "bank_account_verified", "pci_saq_attested"];



export const PROVIDER_CATALOG: Record<ProviderKey, ProviderSpec> = {
  bkash: {
    key: "bkash",
    rail: "mfs",
    label: "bKash (live)",
    labelBn: "বিকাশ (লাইভ)",
    requires: MFS_CHECKS,
    secretFields: ["app_key", "app_secret", "username", "password"],
    settlementDays: 2,
    supportsRefund: true,
    regulatory: "Bangladesh Bank PSD MFS rail. Merchant onboarding is contracted with bKash directly; Framique never holds customer funds.",
  },
  nagad: {
    key: "nagad",
    rail: "mfs",
    label: "Nagad (live)",
    labelBn: "নগদ (লাইভ)",
    requires: MFS_CHECKS,
    secretFields: ["merchant_id", "public_key", "private_key"],
    settlementDays: 2,
    supportsRefund: true,
    regulatory: "Bangladesh Bank PSD MFS rail operated under the Bangladesh Post Office licence.",
  },
  rocket: {
    key: "rocket",
    rail: "mfs",
    label: "Rocket (live)",
    labelBn: "রকেট (লাইভ)",
    requires: MFS_CHECKS,
    secretFields: ["merchant_id", "api_key", "api_secret"],
    settlementDays: 3,
    supportsRefund: true,
    regulatory: "Dutch-Bangla Bank MFS rail; settlement lands in the merchant's DBBL account.",
  },
  upay: {
    key: "upay",
    rail: "mfs",
    label: "Upay (live)",
    labelBn: "উপায় (লাইভ)",
    requires: MFS_CHECKS,
    secretFields: ["merchant_id", "api_key", "api_secret"],
    settlementDays: 3,
    supportsRefund: true,
    regulatory: "UCB Fintech MFS rail licensed by Bangladesh Bank PSD; settlement to the merchant's UCB or linked account.",
  },
  tap: {
    key: "tap",
    rail: "mfs",
    label: "Tap (live)",
    labelBn: "ট্যাপ (লাইভ)",
    requires: MFS_CHECKS,
    secretFields: ["merchant_id", "api_key", "api_secret"],
    settlementDays: 3,
    supportsRefund: true,
    regulatory: "Trust Axiata Digital MFS rail; merchant onboarding is contracted with TAP directly.",
  },
  mcash: {
    key: "mcash",
    rail: "mfs",
    label: "mCash (live)",
    labelBn: "এমক্যাশ (লাইভ)",
    requires: MFS_CHECKS,
    secretFields: ["merchant_id", "api_key", "api_secret"],
    settlementDays: 3,
    supportsRefund: true,
    regulatory: "Islami Bank Bangladesh MFS rail; Shariah-compliant settlement into an IBBL account.",
  },
  surecash: {
    key: "surecash",
    rail: "mfs",
    label: "SureCash (live)",
    labelBn: "শিওরক্যাশ (লাইভ)",
    requires: MFS_CHECKS,
    secretFields: ["merchant_id", "api_key", "api_token"],
    settlementDays: 4,
    supportsRefund: false,
    // Refunds are manual here, so the desk must never promise an automated reversal.
    regulatory: "Partner-bank MFS rail. Reversals are filed manually with the operator — do not offer instant refunds on this rail.",
  },
  cellfin: {
    key: "cellfin",
    rail: "bank",
    label: "CellFin (live)",
    labelBn: "সেলফিন (লাইভ)",
    requires: MFS_CHECKS,
    secretFields: ["merchant_id", "api_key", "api_secret"],
    settlementDays: 2,
    supportsRefund: true,
    regulatory: "Bank-wallet rail operated by Islami Bank Bangladesh; funds settle bank-to-bank, not through an MFS float.",
  },
  bank_transfer: {
    key: "bank_transfer",
    rail: "bank",
    label: "Direct bank transfer (BEFTN / RTGS)",
    labelBn: "সরাসরি ব্যাংক ট্রান্সফার",
    requires: [
      "trade_licence",
      "bin_tin",
      "kyc_approved",
      "bank_account_verified",
      "settlement_account",
      "merchant_agreement_signed",
    ],
    secretFields: ["bank_code", "account_title", "account_number"],
    settlementDays: 1,
    supportsRefund: false,
    regulatory: "BEFTN clears same-day for instructions filed before cut-off; RTGS is real-time above BDT 100,000.",
  },
  card_acquiring: {
    key: "card_acquiring",
    rail: "card",
    label: "Card acquiring (Visa / Mastercard)",
    labelBn: "কার্ড অ্যাকোয়ারিং",
    requires: [
      "trade_licence",
      "bin_tin",
      "kyc_approved",
      "settlement_account",
      "merchant_agreement_signed",
      "provider_merchant_id",
      "provider_app_credentials",
      "webhook_endpoint_verified",
      "refund_policy_published",
      "pci_saq_attested",
    ],
    secretFields: ["acquirer_mid", "terminal_id", "api_key", "api_secret"],
    settlementDays: 3,
    supportsRefund: true,
    regulatory: "Acquiring runs through a licensed PSO/PSP. Card data never touches Framique — hosted fields only, PCI-DSS SAQ-A.",
  },
  sslcommerz: {
    key: "sslcommerz",
    rail: "aggregator",
    label: "SSLCOMMERZ",
    labelBn: "এসএসএলকমার্জ",
    requires: AGGREGATOR_CHECKS,
    secretFields: ["store_id", "store_password"],
    settlementDays: 3,
    supportsRefund: true,
    regulatory: "PSO-licensed aggregator (SSL Wireless). One contract fronts cards, internet banking and every MFS wallet; card data stays on the aggregator's hosted page.",
  },
  aamarpay: {
    key: "aamarpay",
    rail: "aggregator",
    label: "aamarPay",
    labelBn: "আমারপে",
    requires: AGGREGATOR_CHECKS,
    secretFields: ["store_id", "signature_key"],
    settlementDays: 3,
    supportsRefund: true,
    regulatory: "PSO-licensed aggregator (Software Shop Limited). Settlement is netted weekly unless the merchant contracts a faster cycle.",
  },
  shurjopay: {
    key: "shurjopay",
    rail: "aggregator",
    label: "ShurjoPay",
    labelBn: "সূর্যপে",
    requires: AGGREGATOR_CHECKS,
    secretFields: ["merchant_username", "merchant_password", "prefix"],
    settlementDays: 3,
    supportsRefund: true,
    regulatory: "PSO-licensed aggregator (shurjoMukhi). Verification tokens are short-lived; never cache a token past its expiry.",
  },
  portwallet: {
    key: "portwallet",
    rail: "aggregator",
    label: "PortWallet",
    labelBn: "পোর্টওয়ালেট",
    requires: AGGREGATOR_CHECKS,
    secretFields: ["app_key", "secret_key"],
    settlementDays: 4,
    supportsRefund: true,
    regulatory: "PSO-licensed aggregator settling through its partner bank; refunds are API-driven but land on the original instrument only.",
  },
  bkash_paylater: {
    key: "bkash_paylater",
    rail: "bnpl",
    label: "bKash PayLater",
    labelBn: "বিকাশ পে-লেটার",
    requires: [...MFS_CHECKS, "bnpl_risk_disclosure"],
    secretFields: ["app_key", "app_secret"],
    settlementDays: 2,
    supportsRefund: true,
    regulatory: "Deferred-payment product underwritten by the provider; the merchant is settled in full and carries no credit risk.",
    emiPlans: [
      { months: 3, minAmountMinor: 500_000, interestBps: 0 },
      { months: 6, minAmountMinor: 1_000_000, interestBps: 0 },
    ],
  },
  nagad_bnpl: {
    key: "nagad_bnpl",
    rail: "bnpl",
    label: "Nagad BNPL",
    labelBn: "নগদ বিএনপিএল",
    requires: [...MFS_CHECKS, "bnpl_risk_disclosure"],
    secretFields: ["merchant_id", "private_key"],
    settlementDays: 3,
    supportsRefund: true,
    regulatory: "Deferred-payment product underwritten by the provider under its MFS licence.",
    emiPlans: [
      { months: 3, minAmountMinor: 500_000, interestBps: 0 },
      { months: 6, minAmountMinor: 1_500_000, interestBps: 0 },
    ],
  },
  bank_emi: {
    key: "bank_emi",
    rail: "bnpl",
    label: "Bank card EMI",
    labelBn: "ব্যাংক কার্ড ইএমআই",
    requires: [
      "trade_licence",
      "bin_tin",
      "kyc_approved",
      "settlement_account",
      "merchant_agreement_signed",
      "provider_merchant_id",
      "pci_saq_attested",
      "emi_tenor_agreement",
      "refund_policy_published",
    ],
    secretFields: ["acquirer_mid", "emi_product_code"],
    settlementDays: 3,
    supportsRefund: true,
    regulatory: "Issuer-funded EMI. The tenor table is contractual — never invent a tenor the acquirer has not signed off.",
    emiPlans: [
      { months: 3, minAmountMinor: 500_000, interestBps: 0 },
      { months: 6, minAmountMinor: 1_000_000, interestBps: 0 },
      { months: 9, minAmountMinor: 2_000_000, interestBps: 450 },
      { months: 12, minAmountMinor: 3_000_000, interestBps: 900 },
    ],
  },
  // Community plugin. Framique does not review or support the gateway itself,
  // so there is no contract evidence to collect from a provider we have no
  // relationship with — what remains is the merchant's own obligations: a
  // verified webhook endpoint, a published refund policy and a settlement
  // account. Live money still requires those before submission.
  piprapay: {
    key: "piprapay",
    rail: "aggregator",
    label: "PipraPay (community, unofficial)",
    labelBn: "পিপরাপে (কমিউনিটি, অনানুষ্ঠানিক)",
    requires: ["settlement_account", "webhook_endpoint_verified", "refund_policy_published"],
    secretFields: ["api_key", "base_url"],
    settlementDays: 0,
    supportsRefund: false,
    regulatory:
      "Unofficial community plugin for a gateway the merchant self-hosts. Framique neither operates nor supports PipraPay and holds no funds; the merchant is responsible for their own instance, its PCI posture and its regulatory standing.",
    support: "community",
  },
};


export function isProviderKey(value: string): value is ProviderKey {
  return (PROVIDER_KEYS as readonly string[]).includes(value);
}

/* ------------------------------ state machine ----------------------------- */

export const CREDENTIAL_STATES = [
  "draft",
  "submitted",
  "in_review",
  "changes_requested",
  "approved",
  "live",
  "suspended",
  "rejected",
  "revoked",
] as const;
export type CredentialState = (typeof CREDENTIAL_STATES)[number];

const TRANSITIONS: Record<CredentialState, CredentialState[]> = {
  draft: ["submitted", "revoked"],
  submitted: ["in_review", "changes_requested", "rejected", "revoked"],
  in_review: ["approved", "changes_requested", "rejected"],
  changes_requested: ["submitted", "revoked"],
  approved: ["live", "revoked", "rejected"],
  live: ["suspended", "revoked"],
  suspended: ["live", "revoked"],
  rejected: ["draft", "revoked"],
  revoked: [],
};

export function credentialCanTransition(from: CredentialState, to: CredentialState) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** States in which the rail may actually take money. */
export function isChargeable(state: CredentialState) {
  return state === "live";
}

/* -------------------------------- checklist ------------------------------- */

export type Checklist = Partial<Record<ChecklistKey, boolean>>;

/** Evidence still missing before this provider may be submitted for review. */
export function checklistGaps(provider: ProviderKey, checklist: Checklist): ChecklistKey[] {
  const spec = PROVIDER_CATALOG[provider];
  return spec.requires.filter((key) => checklist[key] !== true);
}

export function checklistProgress(provider: ProviderKey, checklist: Checklist) {
  const total = PROVIDER_CATALOG[provider].requires.length;
  const done = total - checklistGaps(provider, checklist).length;
  return { done, total, pct: total === 0 ? 100 : Math.round((done / total) * 100) };
}

export type SubmitVerdict = { ok: boolean; missingEvidence: ChecklistKey[]; missingSecrets: string[] };

/**
 * The submit gate. Live credentials additionally require every declared secret
 * field; sandbox rows only need the evidence checklist to be *started*.
 */
export function evaluateSubmission(
  provider: ProviderKey,
  environment: "sandbox" | "live",
  checklist: Checklist,
  secretFieldsPresent: string[],
): SubmitVerdict {
  const spec = PROVIDER_CATALOG[provider];
  const missingEvidence = environment === "live" ? checklistGaps(provider, checklist) : [];
  const missingSecrets =
    environment === "live" ? spec.secretFields.filter((f) => !secretFieldsPresent.includes(f)) : [];
  return {
    ok: missingEvidence.length === 0 && missingSecrets.length === 0,
    missingEvidence,
    missingSecrets,
  };
}

/** Only a platform reviewer decides; a merchant can never approve its own rail. */
export function canDecide(reviewerIsPlatformAdmin: boolean, reviewerId: string, submittedBy: string | null) {
  if (!reviewerIsPlatformAdmin) return { ok: false as const, reason: "provider.not_reviewer" };
  if (submittedBy && submittedBy === reviewerId) return { ok: false as const, reason: "provider.self_review" };
  return { ok: true as const, reason: null };
}

/* --------------------------------- BNPL/EMI -------------------------------- */

export type EmiOffer = { months: number; perInstalmentMinor: number; totalMinor: number; interestBps: number };

/**
 * Deterministic EMI schedule for an amount. Integer minor units only: the
 * remainder is pushed onto the first instalment so the parts always sum back to
 * the total (no invented or lost paisa).
 */
export function emiOffers(provider: ProviderKey, amountMinor: number): EmiOffer[] {
  const plans = PROVIDER_CATALOG[provider].emiPlans ?? [];
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return [];
  return plans
    .filter((p) => amountMinor >= p.minAmountMinor)
    .map((p) => {
      const totalMinor = amountMinor + Math.round((amountMinor * p.interestBps) / 10_000);
      const base = Math.floor(totalMinor / p.months);
      const first = base + (totalMinor - base * p.months);
      return {
        months: p.months,
        perInstalmentMinor: base,
        totalMinor,
        interestBps: p.interestBps,
        firstInstalmentMinor: first,
      } as EmiOffer & { firstInstalmentMinor: number };
    });
}

/* --------------------------------- masking -------------------------------- */

/** Never render a raw provider secret. Last four only, fixed-width prefix. */
export function maskSecret(value: string) {
  const v = (value ?? "").trim();
  if (v.length <= 4) return "••••";
  return `••••${v.slice(-4)}`;
}
