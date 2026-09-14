import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  can,
  grantsToPermissions,
  MERCHANT_ROLE_PRESET,
  ROLE_PRESETS,
  type AuthzContext,
  type Permission,
} from "@/lib/authz";

export type Membership = {
  merchantId: string;
  status: string;
  role: string;
  permissions: readonly Permission[];
};

function grantRows(value: unknown): { group: string; action: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    return typeof r["group"] === "string" && typeof r["action"] === "string"
      ? [{ group: r["group"], action: r["action"] }]
      : [];
  });
}

async function loadMembership(): Promise<Membership | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data } = await supabase
    .from("merchant_members")
    .select("merchant_id, role, role_id, status")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  let permissions: readonly Permission[] = [];
  if (data.role_id) {
    const { data: role } = await supabase
      .from("staff_roles")
      .select("grants")
      .eq("id", data.role_id)
      .maybeSingle();
    permissions = grantsToPermissions(grantRows(role?.grants));
  }
  if (permissions.length === 0) {
    permissions = ROLE_PRESETS[MERCHANT_ROLE_PRESET[data.role] ?? "read_only"];
  }

  return {
    merchantId: data.merchant_id,
    status: data.status,
    role: data.role,
    permissions,
  };
}

export function useMembership() {
  return useQuery({
    queryKey: ["membership"],
    queryFn: loadMembership,
    staleTime: 60_000,
  });
}

/**
 * Client-side affordance filter. The server still refuses independently —
 * this only decides what is worth rendering.
 */
export function useCan() {
  const { data } = useMembership();
  const ctx: AuthzContext = {
    permissions: data?.permissions ?? [],
    status: data?.status ?? null,
  };
  return (permission: Permission | null | undefined) =>
    permission ? can(permission, ctx) : Boolean(data && data.status === "active");
}
