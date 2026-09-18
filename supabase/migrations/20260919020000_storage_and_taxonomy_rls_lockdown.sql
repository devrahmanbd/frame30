-- Phase P0-4 — Storage RLS and taxonomy isolation lockdown.
--
-- 1. blog_terms was mistakenly configured in 0024 with `blog_terms_auth_write`
--    (USING (true) WITH CHECK (true)), allowing any authenticated user to
--    mutate/delete categories and tags of any merchant. blog_terms has a
--    merchant_id column referencing public.merchants(id). We drop the open policy
--    and restrict mutations strictly to members of the owning merchant or platform admins.
--
-- 2. article_terms carry merchant_id directly: simplify and harden the policy.
--
-- 3. storage.objects: enforce tenant isolation directly at the database engine level.
--    Objects in tenant buckets ('media', 'theme-fonts', 'exports') follow the
--    path convention `<merchant_id>/<object_name>`. Any authenticated insert,
--    update, or delete must verify that the prefix UUID belongs to a merchant
--    the caller is a member of (or caller is platform admin).

-- ---------- blog_terms tenant containment ----------
drop policy if exists blog_terms_auth_write on public.blog_terms;
drop policy if exists blog_terms_tenant_write on public.blog_terms;

create policy blog_terms_tenant_write on public.blog_terms
  for all to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin())
  with check (public.is_merchant_member(merchant_id) or public.is_platform_admin());

-- ---------- article_terms tenant containment ----------
drop policy if exists article_terms_tenant_write on public.article_terms;

create policy article_terms_tenant_write on public.article_terms
  for all to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin())
  with check (public.is_merchant_member(merchant_id) or public.is_platform_admin());

-- ---------- storage.objects tenant confinement ----------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'objects'
  ) then
    alter table storage.objects enable row level security;

    drop policy if exists tenant_storage_insert on storage.objects;
    create policy tenant_storage_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id in ('media', 'theme-fonts', 'exports')
        and (
          split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and (
            public.is_merchant_member((split_part(name, '/', 1))::uuid)
            or public.is_platform_admin()
          )
        )
      );

    drop policy if exists tenant_storage_update on storage.objects;
    create policy tenant_storage_update on storage.objects
      for update to authenticated
      using (
        bucket_id in ('media', 'theme-fonts', 'exports')
        and (
          split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and (
            public.is_merchant_member((split_part(name, '/', 1))::uuid)
            or public.is_platform_admin()
          )
        )
      );

    drop policy if exists tenant_storage_delete on storage.objects;
    create policy tenant_storage_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id in ('media', 'theme-fonts', 'exports')
        and (
          split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and (
            public.is_merchant_member((split_part(name, '/', 1))::uuid)
            or public.is_platform_admin()
          )
        )
      );
  end if;
end $$;
