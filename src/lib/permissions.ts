/** Permission matrix — the single source of truth for role editing. */
export type Grant = { group: string; action: string };

export const PERMISSION_MATRIX: { group: string; actions: string[] }[] = [
  { group: "catalog", actions: ["read", "create", "update", "delete", "publish", "approve"] },
  { group: "inventory", actions: ["read", "adjust", "transfer", "reconcile"] },
  { group: "orders", actions: ["read", "create", "update_status", "refund"] },
  { group: "shipping", actions: ["read", "create", "label", "cancel"] },
  { group: "pos", actions: ["read", "operate", "cash_register"] },
  { group: "marketing", actions: ["read", "create", "update", "publish", "approve"] },
  { group: "themes", actions: ["read", "update", "publish", "approve"] },
  { group: "analytics", actions: ["read", "export"] },
  { group: "finance", actions: ["read", "initiate", "approve"] },
  { group: "settings", actions: ["read", "update"] },
  { group: "staff", actions: ["read", "invite", "manage_roles", "manage_grants", "mfa_admin"] },
  { group: "audit", actions: ["read"] },
];
