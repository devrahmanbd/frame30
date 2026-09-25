/**
 * Single-store MVP gate (no code removed — switched off by policy).
 *
 * Global kill-switch: one store per account while the MVP stays simple.
 * Per-plan overrides are reserved ({plan: maxStores}) for later; today
 * every plan resolves to the global cap.
 */
export const MAX_STORES_PER_ACCOUNT = 1;

/** Future per-plan caps. All plans currently resolve to the global cap. */
export const PLAN_STORE_CAPS: Partial<Record<string, number>> = {};

export function storeCapForPlan(plan?: string | null): number {
  if (
    plan &&
    Number.isInteger(PLAN_STORE_CAPS[plan]) &&
    (PLAN_STORE_CAPS[plan] as number) > 0
  ) {
    return PLAN_STORE_CAPS[plan] as number;
  }
  return MAX_STORES_PER_ACCOUNT;
}

/** True when the account may create another store. */
export function canCreateAdditionalStore(
  activeMemberships: number,
  plan?: string | null,
): boolean {
  if (!Number.isFinite(activeMemberships) || activeMemberships < 0)
    return false;
  return activeMemberships < storeCapForPlan(plan);
}
