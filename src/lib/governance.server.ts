import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Grant } from "./permissions";

type Client = SupabaseClient<Database>;
export type StaffStatus = Database["public"]["Enums"]["staff_status"];
export type MfaStatus = Database["public"]["Enums"]["staff_mfa_status"];
export type ApprovalStatus = Database["public"]["Enums"]["approval_status"];
export type KycState = Database["public"]["Enums"]["kyc_state"];

export type { Grant } from "./permissions";
export { PERMISSION_MATRIX } from "./permissions";

function asGrants(value: unknown): Grant[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    return typeof r["group"] === "string" && typeof r["action"] === "string"
      ? [{ group: r["group"], action: r["action"] }]
      : [];
  });
}

export async function loadGovernance(supabase: Client, merchantId: string, userId: string) {
  const [members, roles, audit, kyc, approvals, sessions] = await Promise.all([
    supabase
      .from("merchant_members")
      .select("id, user_id, role, role_id, status, mfa_status, last_login_at, created_at, invited_by")
      .eq("merchant_id", merchantId)
      .order("created_at"),

    supabase
      .from("staff_roles")
      .select("id, name, is_fixed, grants, mfa_required, updated_at")
      .eq("merchant_id", merchantId)
      .order("is_fixed", { ascending: false })
      .order("name"),
    supabase
      .from("staff_audit")
      .select("id, action, payload, actor, created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("merchant_kyc")
      .select("state, legal_name, contact_phone, trade_license_no, bin_no, rejection_reason, submitted_at, reviewed_at")
      .eq("merchant_id", merchantId)
      .maybeSingle(),
    supabase
      .from("approval_requests")
      .select(
        "id, resource_type, resource_action, status, payload, submitted_by, reviewed_by, review_comment, expires_at, reviewed_at, created_at",
      )
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("auth_sessions")
      .select("id, user_id, device, ip_hash, aal, last_seen_at, revoked_at")
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(100),
  ]);

  const profileIds = Array.from(
    new Set([
      ...(members.data ?? []).map((m) => m.user_id),
      ...(members.data ?? []).map((m) => m.invited_by),
      ...(approvals.data ?? []).flatMap((a) => [a.submitted_by, a.reviewed_by]),
    ]),
  ).filter((id): id is string => Boolean(id));

  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", profileIds)
    : { data: [] as { id: string; email: string | null; full_name: string | null }[] };

  const nameOf = (id: string | null) => {
    if (!id) return null;
    const p = (profiles ?? []).find((row) => row.id === id);
    return p?.full_name || p?.email || id.slice(0, 8);
  };

  const memberUserIds = new Set((members.data ?? []).map((m) => m.user_id));

  return {
    merchantId,
    userId,
    members: (members.data ?? []).map((m) => ({
      id: m.id,
      userId: m.user_id,
      name: nameOf(m.user_id) ?? "",
      role: m.role,
      roleId: m.role_id,
      status: m.status,
      mfaStatus: m.mfa_status,
      lastLoginAt: m.last_login_at,
      joinedAt: m.created_at,
      invitedBy: nameOf(m.invited_by),
      isSelf: m.user_id === userId,
    })),
    sessions: (sessions.data ?? [])
      .filter((s) => memberUserIds.has(s.user_id))
      .map((s) => ({
        id: s.id,
        userId: s.user_id,
        name: nameOf(s.user_id) ?? "",
        device: s.device ?? "",
        ipHash: s.ip_hash ?? "",
        aal: s.aal ?? "",
        lastSeenAt: s.last_seen_at,
        isSelf: s.user_id === userId,
      })),
    roles: (roles.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      isFixed: r.is_fixed,
      mfaRequired: Boolean((r as { mfa_required?: boolean }).mfa_required),
      grants: asGrants(r.grants),
    })),
    audit: (audit.data ?? []).map((a) => ({
      id: String(a.id),
      action: a.action,
      actor: nameOf(a.actor),
      createdAt: a.created_at,
    })),
    kyc: kyc.data
      ? {
          state: kyc.data.state,
          legalName: kyc.data.legal_name ?? "",
          contactPhone: kyc.data.contact_phone ?? "",
          tradeLicenseNo: kyc.data.trade_license_no ?? "",
          binNo: kyc.data.bin_no ?? "",
          rejectionReason: kyc.data.rejection_reason,
          submittedAt: kyc.data.submitted_at,
        }
      : {
          state: "pending" as KycState,
          legalName: "",
          contactPhone: "",
          tradeLicenseNo: "",
          binNo: "",
          rejectionReason: null,
          submittedAt: null,
        },
    approvals: (approvals.data ?? []).map((a) => ({
      id: a.id,
      resourceType: a.resource_type,
      resourceAction: a.resource_action,
      status: a.status,
      submittedBy: nameOf(a.submitted_by) ?? "",
      reviewedBy: nameOf(a.reviewed_by),
      reviewComment: a.review_comment,
      expiresAt: a.expires_at,
      createdAt: a.created_at,
      isMine: a.submitted_by === userId,
      summary: summarize(a.payload),
    })),
  };
}

function summarize(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const entries = Object.entries(payload as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string" || typeof v === "number")
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v)}`);
  return entries.join(" · ");
}

export class GovernanceError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "GovernanceError";
  }
}

function rethrow(message: string | undefined): never {
  throw new GovernanceError(message ?? "common.error");
}

export async function saveRole(
  supabase: Client,
  merchantId: string,
  input: { roleId: string | null; name: string; grants: Grant[]; mfaRequired?: boolean },
) {
  const { data, error } = await supabase.rpc("staff_save_role", {
    _merchant_id: merchantId,
    _role_id: input.roleId as unknown as string,
    _name: input.name,
    _grants: input.grants as unknown as Database["public"]["Tables"]["staff_roles"]["Row"]["grants"],
    _mfa_required: input.mfaRequired ?? false,
  });
  if (error) rethrow(error.message);
  return data;
}

export async function deleteRole(supabase: Client, roleId: string) {
  const { error } = await supabase.rpc("staff_delete_role", { _role_id: roleId });
  if (error) rethrow(error.message);
}

/** Mirrors the server guard so the editor can explain a rule before saving. */
export const ROLE_GRANT_RULES = {
  forbidden: ["staff:manage_roles", "staff:manage_grants"],
  ownerOnly: ["finance:read", "finance:initiate", "finance:approve", "settings:update"],
} as const;

export async function setMember(
  supabase: Client,
  input: { memberId: string; roleId: string | null; status: StaffStatus },
) {
  const { error } = await supabase.rpc("staff_set_member", {
    _member_id: input.memberId,
    _role_id: input.roleId as unknown as string,
    _status: input.status,
  });
  if (error) rethrow(error.message);
}

export async function setOwnMfa(supabase: Client, merchantId: string, status: MfaStatus) {
  const { error } = await supabase.rpc("staff_set_own_mfa", {
    _merchant_id: merchantId,
    _status: status,
  });
  if (error) rethrow(error.message);
}

export async function submitApproval(
  supabase: Client,
  merchantId: string,
  input: { resourceType: string; resourceAction: string; note: string },
) {
  const { error } = await supabase.rpc("approval_submit", {
    _merchant_id: merchantId,
    _resource_type: input.resourceType,
    _resource_id: null as unknown as string,
    _resource_action: input.resourceAction,
    _payload: { note: input.note } as never,
  });
  if (error) rethrow(error.message);
}

export async function decideApproval(
  supabase: Client,
  input: { requestId: string; decision: ApprovalStatus; comment: string },
) {
  const { data, error } = await supabase.rpc("approval_decide", {
    _request_id: input.requestId,
    _decision: input.decision,
    _comment: input.comment,
  });
  if (error) rethrow(error.message);
  return data;
}

export async function submitKyc(
  supabase: Client,
  merchantId: string,
  profile: {
    legalName: string;
    contactPhone: string;
    tradeLicenseNo: string;
    binNo: string;
  },
) {
  const { data, error } = await supabase.rpc("kyc_submit", {
    _merchant_id: merchantId,
    _profile: {
      legal_name: profile.legalName,
      contact_phone: profile.contactPhone,
      trade_license_no: profile.tradeLicenseNo,
      bin_no: profile.binNo,
    } as never,
  });
  if (error) rethrow(error.message);
  return data;
}


export async function inviteMember(
  supabase: Client,
  merchantId: string,
  input: { email: string; role: Database["public"]["Enums"]["merchant_role"]; roleId: string | null },
) {
  const { error } = await supabase.rpc("staff_invite", {
    _merchant_id: merchantId,
    _email: input.email,
    _role: input.role,
    _role_id: input.roleId as unknown as string,
  });
  if (error) rethrow(error.message);
}

export async function revokeSession(supabase: Client, merchantId: string, sessionRowId: string) {
  const { error } = await supabase.rpc("staff_revoke_session", {
    _merchant_id: merchantId,
    _session_row_id: sessionRowId,
  });
  if (error) rethrow(error.message);
}
