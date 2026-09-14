/**
 * §5 — step-up action classes.
 *
 * Pure and isomorphic. Every DANGEROUS permission belongs to exactly one
 * action class; a grant is minted per class, burned on use, and never older
 * than `STEP_UP_MAX_AGE_SECONDS`. Re-prompting is therefore per action class,
 * not per session: confirming a refund never silently authorises a purge.
 */
import { DANGEROUS, isDangerous, type AnyPermission } from "./authz";

export const STEP_UP_CLASSES = [
  "refund",
  "payout",
  "purge",
  "api_key.rotate",
  "staff",
  "export",
  "unmask",
  "risk",
  "platform",
] as const;

export type StepUpClass = (typeof STEP_UP_CLASSES)[number];

/** Hard ceiling for grant age (§5: max 15 minutes). */
export const STEP_UP_MAX_AGE_SECONDS = 900;

const CLASS_BY_PERMISSION: Record<string, StepUpClass> = {
  "staff.manage_roles": "staff",
  "staff.manage_grants": "staff",
  "staff.mfa_admin": "staff",
  "orders.refund": "refund",
  "refund.force": "refund",
  "finance.initiate": "payout",
  "finance.approve": "payout",
  "payouts.approve": "payout",
  "customers.export": "export",
  "analytics.export": "export",
  "customers.unmask": "unmask",
  "apikeys.mint": "api_key.rotate",
  "gateway.rotate": "api_key.rotate",
  "fraud.blacklist": "risk",
  "tenant.purge": "purge",
  "tenant.suspend": "platform",
  "tenant.impersonate": "platform",
  "plan.write": "platform",
};

/** The class guarding a permission, or null when the permission is ordinary. */
export function stepUpClassFor(permission: AnyPermission): StepUpClass | null {
  if (!isDangerous(permission)) return null;
  return CLASS_BY_PERMISSION[permission] ?? "platform";
}

/** Every DANGEROUS permission must be mapped — asserted by the contract test. */
export function unmappedDangerousPermissions(): string[] {
  return DANGEROUS.filter((p) => !CLASS_BY_PERMISSION[p]);
}
