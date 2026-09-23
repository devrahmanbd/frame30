-- Open-theme approved-developer allowlist.
--
-- RLS shape mirrors the tightest existing tenant policy:
-- source: supabase/migrations/20260921_builder_global_blocks.sql
-- (builder_global_blocks_tenant_rw: FOR ALL TO authenticated with
-- USING + WITH CHECK on public.is_merchant_member(merchant_id)).
-- Reads are tenant-scoped; writes are limited to tenant members via the
-- same WITH CHECK (staff review gating lives in the server layer, where
-- all writes go through authenticated server functions, never anon).

CREATE TABLE IF NOT EXISTS public.theme_developers (
  merchant_id uuid PRIMARY KEY REFERENCES public.merchants(id) ON DELETE CASCADE,
  approved_at timestamptz NOT NULL DEFAULT now(),
  approved_by text NULL
);

ALTER TABLE public.theme_developers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS theme_developers_tenant_rw ON public.theme_developers;
CREATE POLICY theme_developers_tenant_rw ON public.theme_developers
  FOR ALL TO authenticated
  USING (public.is_merchant_member(merchant_id))
  WITH CHECK (public.is_merchant_member(merchant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.theme_developers TO authenticated;
GRANT ALL ON public.theme_developers TO service_role;
