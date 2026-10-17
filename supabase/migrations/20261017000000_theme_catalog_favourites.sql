-- theme_catalog_favourites: backfill of missing DDL (2026-10-17).
--
-- The table is required by the shipped code — loadThemesWorkspace reads
-- favourites, setCatalogFavourite upserts on conflict (merchant_id,
-- theme_key) — and earlier migrations carry its policies/grants
-- (20260918120000_p0_rls_lockdown, 20260923_retire_themes,
-- 20260924_theme_write_restore), but no file in this repository ever
-- created it. Production acquired the table out-of-band, so a fresh
-- database built from this chain (migration/0001_baseline.sql +
-- supabase/migrations/*) lacks it and every Themes workspace load fails
-- with `relation "public.theme_catalog_favourites" does not exist`
-- (reproduced on the loopback E2E stack 2026-10-17).
--
-- Column shape mirrors the generated src/integrations/supabase/types.ts
-- (Row: id, merchant_id, theme_key, created_at, updated_at) and the
-- onConflict target used by the code, so reads and upserts match
-- production semantics. Idempotent: IF NOT EXISTS / drop-if-exists
-- everywhere; safe to replay.

create table if not exists public.theme_catalog_favourites (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  theme_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, theme_key)
);

alter table public.theme_catalog_favourites enable row level security;

-- Tenant policy, verbatim from 20260924_theme_write_restore.sql.
drop policy if exists theme_catalog_favourites_tenant on public.theme_catalog_favourites;
create policy theme_catalog_favourites_tenant on public.theme_catalog_favourites
  for all to authenticated
  using (public.is_merchant_member(merchant_id))
  with check (public.is_merchant_member(merchant_id));

grant select, insert, update, delete on public.theme_catalog_favourites to authenticated;

notify pgrst, 'reload schema';
