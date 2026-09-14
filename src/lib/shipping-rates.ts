/**
 * Pure shipping maths. No IO, no clock, no client trust — this module is the
 * only place a delivery price is computed, and it is unit tested directly.
 *
 * Money is integer minor units (BDT paisa). Nothing here ever produces a float.
 */

export type ZoneLike = {
  id: string;
  code: string;
  districts: string[];
  isDefault: boolean;
  enabled: boolean;
  priority: number;
};

export type RateRuleLike = {
  id: string;
  zoneId: string;
  carrierCode: string | null;
  minWeightGrams: number;
  maxWeightGrams: number;
  baseMinorInt: number;
  perKgMinorInt: number;
  codFeeBp: number;
  freeOverMinorInt: number | null;
  enabled: boolean;
  priority: number;
};

export type QuoteInput = {
  city: string | null;
  weightGrams: number;
  isCod: boolean;
  codAmountMinorInt: number;
  orderTotalMinorInt: number;
  carrierCode: string;
};

export type QuoteBreakdown = {
  zoneId: string | null;
  zoneCode: string | null;
  ruleId: string | null;
  billableKg: number;
  baseMinorInt: number;
  perKgMinorInt: number;
  weightMinorInt: number;
  shippingMinorInt: number;
  codFeeMinorInt: number;
  totalMinorInt: number;
  freeApplied: boolean;
  fallback: boolean;
};

/** Normalizes a Bangladeshi district / city string for zone matching. */
export function normalizeDistrict(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z\u0980-\u09FF\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Highest-priority enabled zone whose district list contains the city. */
export function matchZone(zones: ZoneLike[], city: string | null): ZoneLike | null {
  const needle = normalizeDistrict(city);
  const enabled = [...zones]
    .filter((z) => z.enabled)
    .sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code));
  if (needle) {
    const hit = enabled.find((z) => z.districts.some((d) => normalizeDistrict(d) === needle));
    if (hit) return hit;
  }
  return enabled.find((z) => z.isDefault) ?? enabled[0] ?? null;
}

/** Carrier-specific rules beat any-carrier rules; then priority, then weight fit. */
export function matchRule(
  rules: RateRuleLike[],
  zoneId: string,
  carrierCode: string,
  weightGrams: number,
): RateRuleLike | null {
  const weight = Math.max(0, Math.round(weightGrams));
  const candidates = rules
    .filter(
      (r) =>
        r.enabled &&
        r.zoneId === zoneId &&
        (r.carrierCode === null || r.carrierCode === carrierCode) &&
        weight >= r.minWeightGrams &&
        weight < r.maxWeightGrams,
    )
    .sort(
      (a, b) =>
        Number(b.carrierCode !== null) - Number(a.carrierCode !== null) ||
        a.priority - b.priority ||
        a.minWeightGrams - b.minWeightGrams,
    );
  return candidates[0] ?? null;
}

export function billableKilos(weightGrams: number): number {
  return Math.max(1, Math.ceil(Math.max(1, Math.round(weightGrams)) / 1000));
}

/** COD handling fee, rounded up so the merchant is never short by a paisa. */
export function codFee(codAmountMinorInt: number, feeBasisPoints: number): number {
  if (codAmountMinorInt <= 0 || feeBasisPoints <= 0) return 0;
  return Math.ceil((codAmountMinorInt * feeBasisPoints) / 10_000);
}

/** Last-known-good table used when no rule matches; flagged as a fallback. */
export const FALLBACK_RULE = {
  baseMinorInt: 8000,
  perKgMinorInt: 3000,
  codFeeBp: 100,
} as const;

export function computeQuote(
  zones: ZoneLike[],
  rules: RateRuleLike[],
  input: QuoteInput,
): QuoteBreakdown {
  const zone = matchZone(zones, input.city);
  const rule = zone ? matchRule(rules, zone.id, input.carrierCode, input.weightGrams) : null;

  const base = rule ? rule.baseMinorInt : FALLBACK_RULE.baseMinorInt;
  const perKg = rule ? rule.perKgMinorInt : FALLBACK_RULE.perKgMinorInt;
  const feeBp = rule ? rule.codFeeBp : FALLBACK_RULE.codFeeBp;

  const kg = billableKilos(input.weightGrams);
  const weightMinorInt = Math.max(0, kg - 1) * perKg;
  const freeOver = rule?.freeOverMinorInt ?? null;
  const freeApplied = freeOver !== null && input.orderTotalMinorInt >= freeOver;
  const shipping = freeApplied ? 0 : base + weightMinorInt;
  const cod = input.isCod ? codFee(input.codAmountMinorInt, feeBp) : 0;

  return {
    zoneId: zone?.id ?? null,
    zoneCode: zone?.code ?? null,
    ruleId: rule?.id ?? null,
    billableKg: kg,
    baseMinorInt: base,
    perKgMinorInt: perKg,
    weightMinorInt,
    shippingMinorInt: shipping,
    codFeeMinorInt: cod,
    totalMinorInt: shipping + cod,
    freeApplied,
    fallback: rule === null,
  };
}

/** Seeded on first visit so a new store always has a working rate table. */
export const DEFAULT_ZONES = [
  {
    code: "dhaka_metro",
    nameEn: "Dhaka metro",
    nameBn: "ঢাকা মেট্রো",
    districts: ["Dhaka", "ঢাকা"],
    isDefault: false,
    priority: 10,
    base: 6000,
    perKg: 2000,
    codBp: 100,
  },
  {
    code: "dhaka_suburb",
    nameEn: "Dhaka suburb",
    nameBn: "ঢাকা শহরতলি",
    districts: ["Gazipur", "Narayanganj", "Savar", "Keraniganj", "গাজীপুর", "নারায়ণগঞ্জ"],
    isDefault: false,
    priority: 20,
    base: 9000,
    perKg: 2500,
    codBp: 100,
  },
  {
    code: "outside_dhaka",
    nameEn: "Outside Dhaka",
    nameBn: "ঢাকার বাইরে",
    districts: [],
    isDefault: true,
    priority: 90,
    base: 13000,
    perKg: 3000,
    codBp: 150,
  },
] as const;
