/**
 * Service-role RPC handle for routines that are no longer executable by the
 * `authenticated` role.
 *
 * EXECUTE on the privileged routines (platform governance, billing plan
 * lifecycle, tenant purge, SKU sequencing) is granted to `service_role` only,
 * so the caller's own token can no longer invoke them. Every call site below
 * has already resolved and authorised the actor — platform-admin check,
 * merchant membership scope — before reaching for this handle. Never call it
 * before that check: it bypasses RLS by design.
 */
export type PrivilegedRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function privilegedRpc(): Promise<PrivilegedRpc> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as PrivilegedRpc;
}
