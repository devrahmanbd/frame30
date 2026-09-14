/**
 * USD pilot gate — the pure predicate behind `docs/06-payments/currency-gates.md`.
 *
 * A store is BDT-locked until every one of five checks passes, and the answer
 * is recomputed per request rather than cached on the store row. Failure is
 * explicit and named so the admin surface can explain *which* check blocked the
 * pilot instead of showing a dead toggle.
 */

export const CURRENCY_MODES = ["bdt_locked", "pilot_assessing", "usd_enabled"] as const;
export type CurrencyMode = (typeof CURRENCY_MODES)[number];

const MODE_TRANSITIONS: Record<CurrencyMode, CurrencyMode[]> = {
  bdt_locked: ["pilot_assessing"],
  pilot_assessing: ["usd_enabled", "bdt_locked"],
  usd_enabled: ["bdt_locked"],
};

/** Rollback to BDT is always allowed; entering the pilot never is, without the gate. */
export function currencyModeCanTransition(from: CurrencyMode, to: CurrencyMode) {
  if (to === "bdt_locked") return from !== "bdt_locked";
  return (MODE_TRANSITIONS[from] ?? []).includes(to);
}

export const GATE_CHECKS = [
  "plan_tier",
  "entitlement",
  "owner_consent",
  "fx_feed",
  "kyc_standing",
] as const;
export type GateCheck = (typeof GATE_CHECKS)[number];

export type GateInput = {
  planTier: string | null;
  subscriptionStatus: string | null;
  entitled: boolean;
  consentAt: string | null;
  /** Newest BDT↔USD snapshot timestamp, or null when the feed is empty. */
  fxSnapshotAt: string | null;
  kycState: string | null;
  now: Date;
};

export type CheckResult = { key: GateCheck; ok: boolean; detail: string };
export type GateVerdict = { allowed: boolean; checks: CheckResult[]; deniedFor: GateCheck[] };

/** A snapshot older than this cannot back a conversion — fail closed. */
export const FX_MAX_AGE_SECONDS = 24 * 60 * 60;

export function fxAgeSeconds(snapshotAt: string | null, now: Date) {
  if (!snapshotAt) return null;
  const ts = Date.parse(snapshotAt);
  if (Number.isNaN(ts)) return null;
  return Math.max(0, Math.floor((now.getTime() - ts) / 1000));
}

export function evaluateCurrencyGate(input: GateInput): GateVerdict {
  const tierOk =
    (input.planTier === "business" || input.planTier === "enterprise") &&
    (input.subscriptionStatus === "active" || input.subscriptionStatus === "trialing");
  const age = fxAgeSeconds(input.fxSnapshotAt, input.now);
  const checks: CheckResult[] = [
    {
      key: "plan_tier",
      ok: tierOk,
      detail: tierOk
        ? `${input.planTier} · ${input.subscriptionStatus}`
        : "Business or Enterprise plan on an active or trialing subscription is required",
    },
    {
      key: "entitlement",
      ok: input.entitled,
      detail: input.entitled ? "currency_pilot entitlement resolved" : "currency_pilot entitlement not granted",
    },
    {
      key: "owner_consent",
      ok: Boolean(input.consentAt),
      detail: input.consentAt ? `recorded ${input.consentAt}` : "owner has not accepted the USD pilot terms",
    },
    {
      key: "fx_feed",
      ok: age !== null && age <= FX_MAX_AGE_SECONDS,
      detail:
        age === null
          ? "no BDT↔USD snapshot available"
          : age <= FX_MAX_AGE_SECONDS
            ? `snapshot ${Math.floor(age / 60)} min old`
            : `snapshot is stale (${Math.floor(age / 3600)}h)`,
    },
    {
      key: "kyc_standing",
      ok: input.kycState === "approved",
      detail: input.kycState === "approved" ? "KYC approved" : `KYC state is ${input.kycState ?? "missing"}`,
    },
  ];
  const deniedFor = checks.filter((c) => !c.ok).map((c) => c.key);
  return { allowed: deniedFor.length === 0, checks, deniedFor };
}

/* ------------------------------- FX auditing ------------------------------ */

export type FxAuditRow = {
  snapshotId: string;
  base: string;
  quote: string;
  ratePpm: number;
  source: string;
  effectiveAt: string;
};

/** Rate drift between consecutive snapshots, in basis points. Integers only. */
export function driftBps(previousPpm: number, currentPpm: number) {
  if (previousPpm <= 0) return 0;
  return Math.round(((currentPpm - previousPpm) * 10_000) / previousPpm);
}

/** A jump this large is almost always a bad feed, not a market move. */
export const DRIFT_ALERT_BPS = 500;

export function auditSnapshots(rows: FxAuditRow[]) {
  const sorted = [...rows].sort((a, b) => Date.parse(a.effectiveAt) - Date.parse(b.effectiveAt));
  return sorted.map((row, i) => {
    const prev = i > 0 ? sorted[i - 1] : undefined;
    const drift = prev ? driftBps(prev.ratePpm, row.ratePpm) : 0;
    return { ...row, driftBps: drift, suspicious: Math.abs(drift) >= DRIFT_ALERT_BPS };
  });
}
