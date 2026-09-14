/**
 * Authorisation model — the single source of truth for "who may do what".
 *
 * Pure and isomorphic: the client imports it to *hide* affordances, the server
 * imports it to *refuse* calls. Hiding is never the control.
 *
 * Two disjoint namespaces:
 *  - `Permission`         — merchant-tenant grants ("orders.refund"). Held by
 *                           `merchant_members` via `staff_roles.grants`.
 *  - `PlatformPermission` — platform-owner grants ("tenant.suspend"). Held only
 *                           by rows in `platform_admins`, used by /root.
 *
 * A merchant grant can never satisfy a platform permission and vice versa.
 */

import { PERMISSION_MATRIX } from "./permissions";

/* ------------------------------------------------------------------ *
 * Merchant permissions
 * ------------------------------------------------------------------ */

export const PERMISSIONS = [
  // catalog
  "catalog.read",
  "catalog.create",
  "catalog.update",
  "catalog.delete",
  "catalog.publish",
  "catalog.approve",
  // inventory
  "inventory.read",
  "inventory.adjust",
  "inventory.transfer",
  "inventory.reconcile",
  // orders
  "orders.read",
  "orders.create",
  "orders.update_status",
  "orders.refund",
  // shipping
  "shipping.read",
  "shipping.create",
  "shipping.label",
  "shipping.cancel",
  // pos
  "pos.read",
  "pos.operate",
  "pos.cash_register",
  // marketing
  "marketing.read",
  "marketing.create",
  "marketing.update",
  "marketing.publish",
  "marketing.approve",
  // themes
  "themes.read",
  "themes.update",
  "themes.publish",
  "themes.approve",
  // analytics
  "analytics.read",
  "analytics.export",
  // finance
  "finance.read",
  "finance.initiate",
  "finance.approve",
  // settings
  "settings.read",
  "settings.update",
  // staff
  "staff.read",
  "staff.invite",
  "staff.manage_roles",
  "staff.manage_grants",
  "staff.mfa_admin",
  // audit
  "audit.read",
  // customers & support
  "customers.read",
  "customers.update",
  "customers.export",
  "customers.unmask",
  // risk
  "fraud.read",
  "fraud.rules",
  "fraud.release",
  "fraud.blacklist",
  // developers
  "apikeys.read",
  "apikeys.mint",
  "webhooks.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

/** `{ group, action }` rows (as stored in `staff_roles.grants`) → flat keys. */
export function grantsToPermissions(
  grants: readonly { group: string; action: string }[] | null | undefined,
): Permission[] {
  const out: Permission[] = [];
  for (const g of grants ?? []) {
    const key = `${g.group}.${g.action}`;
    if (isPermission(key)) out.push(key);
  }
  return out;
}

export function permissionToGrant(permission: Permission): { group: string; action: string } {
  const idx = permission.indexOf(".");
  return { group: permission.slice(0, idx), action: permission.slice(idx + 1) };
}

/* ------------------------------------------------------------------ *
 * Role presets
 * ------------------------------------------------------------------ */

export type RolePreset =
  | "owner"
  | "admin"
  | "manager"
  | "staff"
  | "support"
  | "fulfilment"
  | "marketing"
  | "finance"
  | "read_only";

const READ_ONLY: Permission[] = [
  "catalog.read",
  "inventory.read",
  "orders.read",
  "shipping.read",
  "pos.read",
  "marketing.read",
  "themes.read",
  "analytics.read",
  "finance.read",
  "settings.read",
  "customers.read",
];

export const ROLE_PRESETS: Record<RolePreset, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== "staff.mfa_admin"),
  manager: [
    ...READ_ONLY,
    "catalog.create",
    "catalog.update",
    "catalog.publish",
    "inventory.adjust",
    "inventory.transfer",
    "orders.create",
    "orders.update_status",
    "shipping.create",
    "shipping.label",
    "marketing.create",
    "marketing.update",
    "customers.update",
    "fraud.read",
    "staff.read",
    "audit.read",
  ],
  staff: [
    ...READ_ONLY,
    "catalog.update",
    "inventory.adjust",
    "orders.update_status",
    "shipping.create",
    "shipping.label",
    "pos.operate",
  ],
  support: [
    "orders.read",
    "shipping.read",
    "customers.read",
    "customers.update",
    "catalog.read",
    "fraud.read",
  ],
  fulfilment: [
    "orders.read",
    "orders.update_status",
    "shipping.read",
    "shipping.create",
    "shipping.label",
    "shipping.cancel",
    "inventory.read",
    "inventory.adjust",
    "inventory.transfer",
  ],
  marketing: [
    "marketing.read",
    "marketing.create",
    "marketing.update",
    "marketing.publish",
    "catalog.read",
    "themes.read",
    "analytics.read",
    "customers.read",
  ],
  finance: [
    "finance.read",
    "finance.initiate",
    "finance.approve",
    "orders.read",
    "orders.refund",
    "analytics.read",
    "analytics.export",
    "audit.read",
  ],
  read_only: READ_ONLY,
};

/** Legacy `merchant_role` enum → preset. Used until every member has a role_id. */
export const MERCHANT_ROLE_PRESET: Record<string, RolePreset> = {
  owner: "owner",
  admin: "admin",
  staff: "staff",
  viewer: "read_only",
};

/* ------------------------------------------------------------------ *
 * Platform (owner console) permissions — /root only
 * ------------------------------------------------------------------ */

export const PLATFORM_PERMISSIONS = [
  "tenant.read",
  "tenant.suspend",
  "tenant.limits",
  "tenant.impersonate",
  "tenant.purge",
  "plan.read",
  "plan.write",
  "gateway.read",
  "gateway.rotate",
  "refund.force",
  "payouts.approve",
  "platform.audit",
  "flags.write",
  "ops.write",
  "platform.access",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

const PLATFORM_SET: ReadonlySet<string> = new Set(PLATFORM_PERMISSIONS);

export function isPlatformPermission(value: string): value is PlatformPermission {
  return PLATFORM_SET.has(value);
}

export type AnyPermission = Permission | PlatformPermission;

/* ------------------------------------------------------------------ *
 * Dangerous actions — step-up MFA + reason + audit row, always
 * ------------------------------------------------------------------ */

export const DANGEROUS = [
  "staff.manage_roles",
  "staff.manage_grants",
  "staff.mfa_admin",
  "orders.refund",
  "finance.initiate",
  "finance.approve",
  "customers.export",
  "customers.unmask",
  "analytics.export",
  "apikeys.mint",
  "fraud.blacklist",
  "tenant.suspend",
  "tenant.impersonate",
  "tenant.purge",
  "gateway.rotate",
  "refund.force",
  "payouts.approve",
  "plan.write",
] as const satisfies readonly AnyPermission[];

export type DangerousPermission = (typeof DANGEROUS)[number];

const DANGEROUS_SET: ReadonlySet<string> = new Set(DANGEROUS);

export function isDangerous(permission: AnyPermission): boolean {
  return DANGEROUS_SET.has(permission);
}

/* ------------------------------------------------------------------ *
 * can()
 * ------------------------------------------------------------------ */

export type AuthzContext = {
  /** Merchant grants held for the tenant currently in scope. */
  permissions?: readonly Permission[];
  /** Row exists in `platform_admins`. Grants platform permissions only. */
  platformAdmin?: boolean;
  /** Membership status; only `active` members may act. */
  status?: string | null;
  /** True while acting through an impersonation grant. */
  impersonating?: boolean;
  /** Fresh step-up MFA grant (`step_up_grants`) covering this action class. */
  stepUp?: boolean;
};

/**
 * Pure decision function. Returns true only when the actor holds the grant,
 * is active, and — for DANGEROUS actions — has a fresh step-up and is not
 * impersonating.
 */
export function can(permission: AnyPermission, ctx: AuthzContext): boolean {
  if (isDangerous(permission)) {
    if (ctx.impersonating) return false;
    if (ctx.stepUp === false) return false;
  }

  if (isPlatformPermission(permission)) return ctx.platformAdmin === true;

  if (ctx.status && ctx.status !== "active") return false;
  return (ctx.permissions ?? []).includes(permission);
}

export function canAny(permissions: readonly AnyPermission[], ctx: AuthzContext): boolean {
  return permissions.some((p) => can(p, ctx));
}

export function permissionsForPreset(preset: RolePreset): readonly Permission[] {
  return ROLE_PRESETS[preset];
}

/** Every permission the editable matrix can express must exist in PERMISSIONS. */
export function matrixPermissions(): string[] {
  return PERMISSION_MATRIX.flatMap((g) => g.actions.map((a) => `${g.group}.${a}`));
}
