/**
 * Server-side enforcement for the authz model in `authz.ts`.
 *
 * `requirePermission("orders.refund")` is the ONLY approved way for a mutating
 * server function to authorise its caller. It resolves the actor once, refuses
 * with a neutral error, and puts the resolved actor on `context`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  can,
  grantsToPermissions,
  isPlatformPermission,
  MERCHANT_ROLE_PRESET,
  ROLE_PRESETS,
  type AnyPermission,
  type AuthzContext,
  type Permission,
} from "./authz";

type Client = SupabaseClient<Database>;

export class ForbiddenError extends Error {
  code = "forbidden";
  permission: AnyPermission;
  constructor(permission: AnyPermission) {
    super("You do not have permission to perform this action.");
    this.name = "ForbiddenError";
    this.permission = permission;
  }
}

export type Actor = AuthzContext & {
  userId: string;
  merchantId: string | null;
};

function asGrantRows(value: unknown): { group: string; action: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    return typeof r["group"] === "string" && typeof r["action"] === "string"
      ? [{ group: r["group"], action: r["action"] }]
      : [];
  });
}

/**
 * Resolves the caller's effective grants for one tenant. When `merchantId` is
 * omitted the caller's single membership is used; ambiguity is not guessed.
 */
export async function loadActor(
  supabase: Client,
  userId: string,
  merchantId?: string | null,
): Promise<Actor> {
  const [{ data: admin }, { data: memberships }] = await Promise.all([
    supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
    supabase
      .from("merchant_members")
      .select("merchant_id, role, role_id, status")
      .eq("user_id", userId),
  ]);

  const rows = memberships ?? [];
  const member = merchantId
    ? (rows.find((r) => r.merchant_id === merchantId) ?? null)
    : rows.length === 1
      ? rows[0]!
      : null;

  let permissions: readonly Permission[] = [];
  if (member) {
    if (member.role_id) {
      const { data: role } = await supabase
        .from("staff_roles")
        .select("grants")
        .eq("id", member.role_id)
        .maybeSingle();
      permissions = grantsToPermissions(asGrantRows(role?.grants));
    }
    if (permissions.length === 0) {
      const preset = MERCHANT_ROLE_PRESET[member.role] ?? "read_only";
      permissions = ROLE_PRESETS[preset];
    }
  }

  return {
    userId,
    merchantId: member?.merchant_id ?? merchantId ?? null,
    permissions,
    status: member?.status ?? null,
    platformAdmin: Boolean(admin),
  };
}

/** Throws `ForbiddenError` unless the actor holds `permission`. */
export function assertPermission(permission: AnyPermission, actor: AuthzContext): void {
  if (!can(permission, actor)) throw new ForbiddenError(permission);
}
