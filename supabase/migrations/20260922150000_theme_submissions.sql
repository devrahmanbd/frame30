-- Open-theme third-party submissions (pending review queue).
--
-- RLS shape mirrors the tightest existing tenant policy:
-- source: supabase/migrations/20260921_builder_global_blocks.sql
-- (builder_global_blocks_tenant_rw: FOR ALL TO authenticated with
-- USING + WITH CHECK on public.is_merchant_member(merchant_id)).
-- Reads are tenant-scoped; staff review gating lives in the server layer
-- (decideThemeSubmissionFn requires the themes.publish permission, the same
-- gate as builderPublishFn in src/lib/themes.functions.ts).

CREATE TABLE IF NOT EXISTS public.theme_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  package jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  reviewer_note text NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz NULL
);

ALTER TABLE public.theme_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS theme_submissions_tenant_rw ON public.theme_submissions;
CREATE POLICY theme_submissions_tenant_rw ON public.theme_submissions
  FOR ALL TO authenticated
  USING (public.is_merchant_member(merchant_id))
  WITH CHECK (public.is_merchant_member(merchant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.theme_submissions TO authenticated;
GRANT ALL ON public.theme_submissions TO service_role;
