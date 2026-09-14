-- Seed: one demo owner user, one store (merchant), owner membership + settings.
--
-- Auth user (create it first, then run this file):
--   email:    owner@frame19.demo
--   password: Frame19!demo2026
--   uid:      f2da8eff-1aef-4772-bd13-7b6f9e543e7a
--
-- On a fresh project the auth user must be created through the Auth API,
-- not SQL (the auth schema is managed by the platform):
--
--   curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
--     -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"email":"owner@frame19.demo","password":"Frame19!demo2026"}'
--
-- If the returned uid differs, replace :seed_user_id below with it.

\set seed_user_id 'f2da8eff-1aef-4772-bd13-7b6f9e543e7a'
\set seed_merchant_id '11111111-1111-4111-8111-111111111111'

begin;

insert into public.profiles (id, email, full_name, phone)
values (:'seed_user_id', 'owner@frame19.demo', 'Demo Owner', '+8801700000000')
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      phone = excluded.phone;

insert into public.merchants (id, name, slug, currency_code, status, kyc_status)
values (:'seed_merchant_id', 'Frame19 Demo Store', 'frame19-demo', 'BDT', 'active', 'verified')
on conflict (id) do update
  set name = excluded.name,
      slug = excluded.slug,
      status = excluded.status,
      kyc_status = excluded.kyc_status;

insert into public.merchant_members (merchant_id, user_id, role, status, mfa_status)
values (:'seed_merchant_id', :'seed_user_id', 'owner', 'active', 'none')
on conflict (merchant_id, user_id) do update
  set role = excluded.role,
      status = excluded.status;

insert into public.merchant_settings (
  merchant_id, tagline, support_email, support_phone,
  cod_enabled, mfs_enabled, cod_surcharge_minor_int,
  shipping_flat_minor_int, free_shipping_threshold_minor_int,
  low_stock_threshold, prices_include_vat,
  ship_address_line, ship_city, ship_postcode
)
select :'seed_merchant_id', 'Commerce that survives cash on delivery',
       'support@frame19.demo', '+8801700000000',
       true, true, 0,
       6000, 200000,
       5, true,
       'House 19, Road 7, Banani', 'Dhaka', '1213'
where not exists (
  select 1 from public.merchant_settings where merchant_id = :'seed_merchant_id'
);

commit;

-- Public storefront read policies (applied 2026-09-03). Kept here so a fresh
-- import gets them even if 0001_baseline.sql predates them.
create or replace function public.is_public_merchant(_merchant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.merchants m where m.id = _merchant_id and m.status = 'active')
$$;
grant execute on function public.is_public_merchant(uuid) to anon, authenticated, service_role;
drop policy if exists merchants_public_read on public.merchants;
create policy merchants_public_read on public.merchants for select to anon, authenticated using (status = 'active');
revoke select on public.merchant_settings from anon;
grant select (merchant_id, tagline, cod_enabled, cod_surcharge_minor_int, mfs_enabled, shipping_flat_minor_int, free_shipping_threshold_minor_int, prices_include_vat, support_email, support_phone) on public.merchant_settings to anon;
drop policy if exists merchant_settings_public_read on public.merchant_settings;
create policy merchant_settings_public_read on public.merchant_settings for select to anon, authenticated using (public.is_public_merchant(merchant_id));
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select to anon, authenticated using (status = 'active' and deleted_at is null and public.is_public_merchant(merchant_id));
drop policy if exists product_variants_public_read on public.product_variants;
create policy product_variants_public_read on public.product_variants for select to anon, authenticated using (deleted_at is null and public.is_public_merchant(merchant_id) and exists (select 1 from public.products p where p.id = product_id and p.status = 'active' and p.deleted_at is null));
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories for select to anon, authenticated using (deleted_at is null and public.is_public_merchant(merchant_id));
drop policy if exists collections_public_read on public.collections;
create policy collections_public_read on public.collections for select to anon, authenticated using (is_published = true and deleted_at is null and public.is_public_merchant(merchant_id));
drop policy if exists storefront_pages_public_read on public.storefront_pages;
create policy storefront_pages_public_read on public.storefront_pages for select to anon, authenticated using (is_published = true and deleted_at is null and public.is_public_merchant(merchant_id));
drop policy if exists articles_public_read on public.articles;
create policy articles_public_read on public.articles for select to anon, authenticated using (status = 'published' and deleted_at is null and public.is_public_merchant(merchant_id));
drop policy if exists product_reviews_public_read on public.product_reviews;
create policy product_reviews_public_read on public.product_reviews for select to anon, authenticated using (status = 'published' and public.is_public_merchant(merchant_id));
