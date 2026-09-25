-- Task 5/6 — unify url_redirects on the from_path/to_path/status_code convention.
-- The 20260919090000 migration added from_path/to_path (+ a text `status`
-- column) while the server code converged on integer `status_code`; the SEO
-- panel still wrote legacy source_path/target_path/code. This closes the gap:
-- additive, idempotent, legacy columns kept for old rows.

ALTER TABLE public.url_redirects ADD COLUMN IF NOT EXISTS status_code integer;

-- Backfill canonical columns from legacy ones where they are still NULL.
UPDATE public.url_redirects
SET from_path = COALESCE(from_path, source_path)
WHERE from_path IS NULL;

UPDATE public.url_redirects
SET to_path = COALESCE(to_path, target_path)
WHERE to_path IS NULL;

UPDATE public.url_redirects
SET status_code = COALESCE(
  status_code,
  CASE WHEN status ~ '^[0-9]+$' THEN status::integer ELSE NULL END,
  code,
  301
)
WHERE status_code IS NULL;

-- Keep legacy mirrors populated for readers that still use them.
UPDATE public.url_redirects
SET source_path = COALESCE(source_path, from_path)
WHERE source_path IS NULL AND from_path IS NOT NULL;

UPDATE public.url_redirects
SET target_path = COALESCE(target_path, to_path)
WHERE target_path IS NULL AND to_path IS NOT NULL;

UPDATE public.url_redirects
SET code = COALESCE(code, status_code, 301)
WHERE code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_url_redirects_merchant_from
  ON public.url_redirects (merchant_id, from_path);
