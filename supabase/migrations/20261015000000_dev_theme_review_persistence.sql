-- Level B reviewed developer themes — durable review-store backing.
--
-- The Level B lane kept its review store in memory (`dev-theme-review.ts`
-- pure store: submit → review → publish with approval snapshots bound to
-- exact release fingerprints). This migration gives that store a durable
-- Supabase backing so approvals survive restarts and activation can
-- re-verify them fail-closed:
--
--   dev_theme_releases: one row per submitted fingerprint. The UNIQUE on
--     (merchant_id, theme_id, fingerprint) is the idempotency backstop:
--     resubmitting identical bytes re-resolves the same row (mirrors the
--     pure store's fingerprint-dedup), and the sha256 CHECK keeps malformed
--     fingerprints out at the storage layer too.
--   dev_theme_reviews: one row per (merchant, theme, fingerprint, decision).
--     The UNIQUE is the approval-idempotency backstop: re-approving the same
--     fingerprint + decision returns the existing row instead of stacking a
--     duplicate. A reject and an approve for one fingerprint are distinct
--     rows (different decisions); the release status carries the outcome.
--
-- CONTRACT: theme_id is the Level B manifest slug (text, e.g.
-- "aurora-lookbook") — NOT a store_themes uuid — so there is deliberately no
-- FK on theme_id. Approval binds bytes (fingerprint), never a row id, and
-- the manifest + hashed file list ride along as jsonb so a loaded snapshot
-- reconstructs the exact release the pure gate checks. files entries carry
-- { path, sha256, bytes } where bytes is the byte SIZE (same shape as
-- DevThemeHashedFile) — content itself is never stored; installs re-hash
-- presented bytes and compare against the fingerprint.
--
-- RLS shape mirrors the tightest existing tenant policy:
-- source: supabase/migrations/20260922150000_theme_submissions.sql
-- (FOR ALL TO authenticated with USING + WITH CHECK on
-- public.is_merchant_member(merchant_id)). Staff review gating lives in the
-- server layer (reviewer-role actors, same as the pure store).

CREATE TABLE IF NOT EXISTS public.dev_theme_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  theme_id text NOT NULL,
  version text NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'in_review'
    CHECK (status IN ('draft', 'in_review', 'approved', 'published', 'superseded', 'rejected', 'revoked', 'removed')),
  submitted_by text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NULL,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dev_theme_releases_merchant_theme_fp_uidx
    UNIQUE (merchant_id, theme_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS public.dev_theme_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  theme_id text NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  decision text NOT NULL CHECK (decision IN ('approve', 'reject')),
  reviewer_id text NOT NULL,
  reviewer_role text NOT NULL
    CHECK (reviewer_role IN ('moderator', 'admin', 'system')),
  reason text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  release_id uuid NULL REFERENCES public.dev_theme_releases(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dev_theme_reviews_merchant_theme_fp_decision_uidx
    UNIQUE (merchant_id, theme_id, fingerprint, decision)
);

ALTER TABLE public.dev_theme_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_theme_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dev_theme_releases_tenant_rw ON public.dev_theme_releases;
CREATE POLICY dev_theme_releases_tenant_rw ON public.dev_theme_releases
  FOR ALL TO authenticated
  USING (public.is_merchant_member(merchant_id))
  WITH CHECK (public.is_merchant_member(merchant_id));

DROP POLICY IF EXISTS dev_theme_reviews_tenant_rw ON public.dev_theme_reviews;
CREATE POLICY dev_theme_reviews_tenant_rw ON public.dev_theme_reviews
  FOR ALL TO authenticated
  USING (public.is_merchant_member(merchant_id))
  WITH CHECK (public.is_merchant_member(merchant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_theme_releases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_theme_reviews TO authenticated;
GRANT ALL ON public.dev_theme_releases TO service_role;
GRANT ALL ON public.dev_theme_reviews TO service_role;
