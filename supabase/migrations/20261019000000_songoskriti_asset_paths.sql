-- songoskriti-asset-paths: current
--
-- Repairs the seeded Songoskriti catalogue after the JPEG-asset rename.
--
-- Why a function and not a bare UPDATE: the applied seed
-- (20260924_songoskriti_demo.sql) is idempotent with
--   on conflict (id) do update set ... image_url = excluded.image_url
-- and its header says it is safe to re-run. After a theme_purge_demo +
-- re-seed cycle the retired .png paths come back, and a migration is never
-- re-run (db-migrate records it as applied). The function below is keyed by
-- row id, so it can be re-applied at any time with one command:
--   select public.theme_apply_songoskriti_asset_paths();
--
-- The applied migration is NOT edited (the drift gate forbids that).

create or replace function public.theme_apply_songoskriti_asset_paths()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Renamed assets: the bytes are unchanged, the public URL is now honest.
  update public.products set image_url = '/ph/songoskriti/cat-kids.jpg'
   where id = 'e50a0000-0000-4000-8000-000000002006';
  update public.products set image_url = '/ph/songoskriti/cat-kids.jpg'
   where id = 'e50a0000-0000-4000-8000-000000002008';
  update public.products set image_url = '/ph/songoskriti/cat-men.jpg'
   where id = 'e50a0000-0000-4000-8000-000000002010';
  update public.collections set image_url = '/ph/songoskriti/hero-festive.jpg'
   where id = 'a50a0000-0000-4000-8000-000000001003';
  update public.collections set image_url = '/ph/songoskriti/hero-weaves.jpg'
   where id = 'a50a0000-0000-4000-8000-000000001004';
  update public.collections set image_url = '/ph/songoskriti/hero-artisans.jpg'
   where id = 'a50a0000-0000-4000-8000-000000001005';

  -- Dead references: two seeded products pointed at artwork that never
  -- existed. They are re-pointed to existing theme art.
  update public.products set image_url = '/ph/songoskriti/prod-panjabi.png'
   where id = 'e50a0000-0000-4000-8000-000000002003';
  update public.products set image_url = '/ph/songoskriti/cat-living.png'
   where id = 'e50a0000-0000-4000-8000-000000002004';
end;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default, and this
-- function is SECURITY DEFINER: without the revoke below, an anonymous
-- caller could drive a write into the RLS-protected catalogue, and every
-- call would write a fresh row version (5 products + 3 collections).
revoke execute on function public.theme_apply_songoskriti_asset_paths() from public;
-- The PUBLIC revoke is not enough on its own: the baseline also grants
-- EXECUTE on new public functions to anon through
-- ALTER DEFAULT PRIVILEGES (migration/0001_baseline.sql), so anon keeps its
-- own EXECUTE grant and can still call this function.
revoke execute on function public.theme_apply_songoskriti_asset_paths() from anon;
grant execute on function public.theme_apply_songoskriti_asset_paths() to authenticated;

select public.theme_apply_songoskriti_asset_paths();
