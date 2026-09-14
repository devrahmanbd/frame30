import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "./authz-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

const grantSchema = z.array(z.object({ group: z.string(), action: z.string() }));

export const governanceLoadFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadGovernance } = await import("./governance.server");
    const merchantId = await scope(context.supabase, context.userId);
    return loadGovernance(context.supabase, merchantId, context.userId);
  });

export const governanceSaveRoleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        roleId: z.string().uuid().nullable(),
        name: z.string().min(2).max(60),
        grants: grantSchema,
        mfaRequired: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveRole } = await import("./governance.server");
    const merchantId = await scope(context.supabase, context.userId);
    await saveRole(context.supabase, merchantId, data);
    return { ok: true };
  });

export const governanceDeleteRoleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ roleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteRole } = await import("./governance.server");
    await scope(context.supabase, context.userId);
    await deleteRole(context.supabase, data.roleId);
    return { ok: true };
  });

export const governanceSetMemberFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        memberId: z.string().uuid(),
        roleId: z.string().uuid().nullable(),
        status: z.enum(["invited", "active", "suspended", "removed"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setMember } = await import("./governance.server");
    await scope(context.supabase, context.userId);
    await setMember(context.supabase, data);
    return { ok: true };
  });

export const governanceSetMfaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.enum(["none", "enrolled", "enforced"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setOwnMfa } = await import("./governance.server");
    const merchantId = await scope(context.supabase, context.userId);
    await setOwnMfa(context.supabase, merchantId, data.status);
    return { ok: true };
  });

export const governanceSubmitKycFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        legalName: z.string().min(2),
        contactPhone: z.string().min(6),
        tradeLicenseNo: z.string().max(64),
        binNo: z.string().max(64),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { submitKyc } = await import("./governance.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { state: await submitKyc(context.supabase, merchantId, data) };
  });

export const approvalSubmitFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        resourceType: z.string().min(2),
        resourceAction: z.string().min(2),
        note: z.string().max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { submitApproval } = await import("./governance.server");
    const merchantId = await scope(context.supabase, context.userId);
    await submitApproval(context.supabase, merchantId, data);
    return { ok: true };
  });

export const approvalDecideFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "cancelled"]),
        comment: z.string().max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { decideApproval } = await import("./governance.server");
    await scope(context.supabase, context.userId);
    return { status: await decideApproval(context.supabase, data) };
  });

export const governanceInviteFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("staff.invite")])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        role: z.enum(["owner", "admin", "staff", "viewer"]),
        roleId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { inviteMember } = await import("./governance.server");
    const merchantId = await scope(context.supabase, context.userId);
    await inviteMember(context.supabase, merchantId, data);
    return { ok: true };
  });

export const governanceRevokeSessionFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("staff.manage_grants")])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { revokeSession } = await import("./governance.server");
    const merchantId = await scope(context.supabase, context.userId);
    await revokeSession(context.supabase, merchantId, data.sessionId);
    return { ok: true };
  });
