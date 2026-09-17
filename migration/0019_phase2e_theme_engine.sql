-- Theme engine routines (phase 2e). Called by src/lib/themes.server.ts but
-- never defined in any migration. Spec: the TS callers + normalizeSnapshot
-- shape + loadWorkspace reads. All routines are membership-guarded
-- (active member of the owning merchant, or platform admin).

-- Demo flag columns first: purge relies on them to remove only demo rows.
alter table public.products add column if not exists is_demo boolean default false not null;
alter table public.product_variants add column if not exists is_demo boolean default false not null;
alter table public.categories add column if not exists is_demo boolean default false not null;
alter table public.collections add column if not exists is_demo boolean default false not null;

-- 1. theme_autosave: last-writer-wins on a monotonic client revision.
-- Missing draft accepts any revision >= 0 (first write wins).
create or replace function public.theme_autosave(
  _theme_id uuid, _templates jsonb, _tokens jsonb, _revision bigint
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_merchant uuid;
  v_stored bigint;
begin
  if v_caller is null then raise exception 'auth.required' using errcode = '42501'; end if;
  select merchant_id into v_merchant from public.store_themes where id = _theme_id;
  if not found then raise exception 'builder.theme_missing' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.merchant_members
    where merchant_id = v_merchant and user_id = v_caller and status = 'active'
  ) and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select revision into v_stored from public.theme_drafts where theme_id = _theme_id;
  if not found then
    insert into public.theme_drafts (merchant_id, theme_id, revision, templates, tokens, updated_by)
    values (v_merchant, _theme_id, _revision,
      coalesce(_templates, '{}'::jsonb), coalesce(_tokens, '{}'::jsonb), v_caller);
    return jsonb_build_object('revision', _revision, 'applied', true);
  end if;
  if _revision > v_stored then
    update public.theme_drafts
    set templates = coalesce(_templates, '{}'::jsonb),
        tokens = coalesce(_tokens, '{}'::jsonb),
        revision = _revision, updated_at = now(), updated_by = v_caller
    where theme_id = _theme_id;
    return jsonb_build_object('revision', _revision, 'applied', true);
  end if;
  return jsonb_build_object('revision', v_stored, 'applied', false);
end $$;
grant execute on function public.theme_autosave(uuid, jsonb, jsonb, bigint)
  to authenticated, service_role;

-- 2. theme_commit: immutable snapshot. Identical consecutive drafts reuse
-- the previous version instead of stacking duplicates.
create or replace function public.theme_commit(
  _theme_id uuid, _templates jsonb, _tokens jsonb, _note text, _label text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_merchant uuid;
  v_id uuid; v_t jsonb; v_k jsonb; v_n bigint;
begin
  if v_caller is null then raise exception 'auth.required' using errcode = '42501'; end if;
  select merchant_id into v_merchant from public.store_themes where id = _theme_id;
  if not found then raise exception 'builder.theme_missing' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.merchant_members
    where merchant_id = v_merchant and user_id = v_caller and status = 'active'
  ) and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select id, templates, tokens into v_id, v_t, v_k
  from public.theme_versions where theme_id = _theme_id
  order by version desc limit 1;
  if found and v_t = coalesce(_templates, '{}'::jsonb)
     and v_k = coalesce(_tokens, '{}'::jsonb) then
    return v_id;
  end if;

  select coalesce(max(version), 0) + 1 into v_n
  from public.theme_versions where theme_id = _theme_id;
  insert into public.theme_versions
    (merchant_id, theme_id, version, status, label, note,
     templates, tokens, created_by)
  values
    (v_merchant, _theme_id, v_n, 'draft', _label, _note,
     coalesce(_templates, '{}'::jsonb), coalesce(_tokens, '{}'::jsonb), v_caller)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.theme_commit(uuid, jsonb, jsonb, text, text)
  to authenticated, service_role;

-- 3. theme_publish: flip a committed version live.
create or replace function public.theme_publish(_version_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_merchant uuid; v_theme uuid;
begin
  if v_caller is null then raise exception 'auth.required' using errcode = '42501'; end if;
  select merchant_id, theme_id into v_merchant, v_theme
  from public.theme_versions where id = _version_id;
  if not found then raise exception 'builder.version_missing' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.merchant_members
    where merchant_id = v_merchant and user_id = v_caller and status = 'active'
  ) and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.theme_versions
  set status = 'published', published_at = now()
  where id = _version_id;
  update public.store_themes
  set published_version_id = _version_id, updated_at = now()
  where id = v_theme;
  return _version_id;
end $$;
grant execute on function public.theme_publish(uuid)
  to authenticated, service_role;

-- 4. theme_rollback: snapshot the target as a NEW draft version and refresh
-- the draft, so the workspace shows the rolled-back content (source=draft).
create or replace function public.theme_rollback(_version_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_merchant uuid; v_theme uuid; v_ver bigint; v_lab text;
  v_t jsonb; v_k jsonb; v_n bigint; v_id uuid;
begin
  if v_caller is null then raise exception 'auth.required' using errcode = '42501'; end if;
  select merchant_id, theme_id, version, label, templates, tokens
    into v_merchant, v_theme, v_ver, v_lab, v_t, v_k
  from public.theme_versions where id = _version_id;
  if not found then raise exception 'builder.version_missing' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.merchant_members
    where merchant_id = v_merchant and user_id = v_caller and status = 'active'
  ) and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(max(version), 0) + 1 into v_n
  from public.theme_versions where theme_id = v_theme;
  insert into public.theme_versions
    (merchant_id, theme_id, version, status, label, note,
     templates, tokens, rollback_of, created_by)
  values
    (v_merchant, v_theme, v_n, 'draft', v_lab,
     'rollback of v' || v_ver::text,
     coalesce(v_t, '{}'::jsonb), coalesce(v_k, '{}'::jsonb),
     _version_id::text, v_caller)
  returning id into v_id;

  delete from public.theme_drafts where theme_id = v_theme;
  insert into public.theme_drafts
    (merchant_id, theme_id, revision, templates, tokens, updated_by)
  values
    (v_merchant, v_theme, v_n,
     coalesce(v_t, '{}'::jsonb), coalesce(v_k, '{}'::jsonb), v_caller);
  return v_id;
end $$;
grant execute on function public.theme_rollback(uuid)
  to authenticated, service_role;

-- 5. theme_schedule_set: queue a publish/unpublish for later.
create or replace function public.theme_schedule_set(
  _theme_id uuid, _version_id uuid, _action text, _run_at timestamptz
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_merchant uuid; v_id uuid;
begin
  if v_caller is null then raise exception 'auth.required' using errcode = '42501'; end if;
  select merchant_id into v_merchant from public.store_themes where id = _theme_id;
  if not found then raise exception 'builder.theme_missing' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.merchant_members
    where merchant_id = v_merchant and user_id = v_caller and status = 'active'
  ) and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _action not in ('publish', 'unpublish') then
    raise exception 'builder.schedule_invalid' using errcode = '22023';
  end if;
  if _version_id is not null and not exists (
    select 1 from public.theme_versions where id = _version_id and theme_id = _theme_id
  ) then
    raise exception 'builder.version_missing' using errcode = '22023';
  end if;

  insert into public.theme_schedules
    (merchant_id, theme_id, version_id, action, run_at, state, created_by)
  values
    (v_merchant, _theme_id, _version_id, _action, _run_at, 'scheduled', v_caller)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.theme_schedule_set(uuid, uuid, text, timestamptz)
  to authenticated, service_role;

-- 6. theme_schedule_cancel: cancel a pending schedule (true when one was).
create or replace function public.theme_schedule_cancel(_schedule_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_n int := 0;
begin
  if v_caller is null then raise exception 'auth.required' using errcode = '42501'; end if;
  update public.theme_schedules s
  set state = 'cancelled'
  where s.id = _schedule_id and s.state = 'scheduled'
    and (exists (
      select 1 from public.merchant_members m
      where m.merchant_id = s.merchant_id and m.user_id = v_caller and m.status = 'active'
    ) or public.is_platform_admin(v_caller));
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
grant execute on function public.theme_schedule_cancel(uuid)
  to authenticated, service_role;

-- 7. theme_update_apply: registry update with optimistic concurrency — the
-- draft revision the preview was computed against must still hold.
create or replace function public.theme_update_apply(
  _theme_id uuid, _key text, _version text, _templates jsonb, _tokens jsonb,
  _mode text, _expected_revision bigint
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_merchant uuid;
  v_stored bigint;
  v_has_draft boolean;
  v_n bigint; v_id uuid;
begin
  if v_caller is null then raise exception 'auth.required' using errcode = '42501'; end if;
  select merchant_id into v_merchant from public.store_themes where id = _theme_id;
  if not found then raise exception 'builder.theme_missing' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.merchant_members
    where merchant_id = v_merchant and user_id = v_caller and status = 'active'
  ) and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _mode not in ('adopt', 'keep_mine') then
    raise exception 'builder.update_invalid' using errcode = '22023';
  end if;

  select revision into v_stored from public.theme_drafts where theme_id = _theme_id;
  v_has_draft := found;
  if v_has_draft and v_stored <> _expected_revision then
    raise exception 'builder.revision_conflict' using errcode = '23505';
  end if;

  select coalesce(max(version), 0) + 1 into v_n
  from public.theme_versions where theme_id = _theme_id;
  insert into public.theme_versions
    (merchant_id, theme_id, version, status, label, note,
     templates, tokens, source_registry_key, source_registry_version, created_by)
  values
    (v_merchant, _theme_id, v_n, 'draft', _key, 'registry update ' || _version || ' (' || _mode || ')',
     coalesce(_templates, '{}'::jsonb), coalesce(_tokens, '{}'::jsonb),
     _key, _version, v_caller)
  returning id into v_id;

  delete from public.theme_drafts where theme_id = _theme_id;
  insert into public.theme_drafts
    (merchant_id, theme_id, revision, templates, tokens, updated_by)
  values
    (v_merchant, _theme_id, v_n,
     coalesce(_templates, '{}'::jsonb), coalesce(_tokens, '{}'::jsonb), v_caller);

  update public.store_themes
  set source_listing_slug = _key, source_version = _version, updated_at = now()
  where id = _theme_id;

  return jsonb_build_object('version_id', v_id, 'revision', v_n);
end $$;
grant execute on function public.theme_update_apply(uuid, text, text, jsonb, jsonb, text, bigint)
  to authenticated, service_role;

-- 8. theme_import_demo: one-click demo catalogue. Idempotent: a second call
-- is a no-op (every written row is flagged is_demo). The preset's index
-- layout is merged into the merchant's draft so imports have a page.
create or replace function public.theme_import_demo(
  _merchant_id uuid, _theme_key text, _ast jsonb, _tokens jsonb, _catalog jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_cat jsonb; v_col jsonb; v_prod jsonb; v_var jsonb; v_slug text;
  v_cat_id uuid; v_prod_id uuid;
  v_n_cat int := 0; v_n_col int := 0; v_n_prod int := 0;
  v_theme uuid; v_tpl jsonb;
begin
  if v_caller is null then raise exception 'auth.required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.merchant_members
    where merchant_id = _merchant_id and user_id = v_caller and status = 'active'
  ) and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.products where merchant_id = _merchant_id and is_demo) then
    return jsonb_build_object('status', 'noop', 'imported', false,
      'products', 0, 'categories', 0, 'collections', 0, 'version_id', null);
  end if;

  for v_cat in select * from jsonb_array_elements(coalesce(_catalog->'categories', '[]'::jsonb)) loop
    insert into public.categories (merchant_id, slug, name, description, is_demo)
    values (_merchant_id, v_cat->>'slug', v_cat->>'name', v_cat->>'description', true);
    v_n_cat := v_n_cat + 1;
  end loop;

  for v_col in select * from jsonb_array_elements(coalesce(_catalog->'collections', '[]'::jsonb)) loop
    insert into public.collections (merchant_id, slug, name, description, is_demo)
    values (_merchant_id, v_col->>'slug', v_col->>'name', v_col->>'description', true);
    v_n_col := v_n_col + 1;
  end loop;

  for v_prod in select * from jsonb_array_elements(coalesce(_catalog->'products', '[]'::jsonb)) loop
    select id into v_cat_id from public.categories
    where merchant_id = _merchant_id and slug = v_prod->>'category' limit 1;
    insert into public.products
      (merchant_id, slug, title, description, status, category_id, tags, is_demo)
    values
      (_merchant_id, v_prod->>'slug', v_prod->>'title', v_prod->>'description',
       'active', v_cat_id,
       (select coalesce(array_agg(t), '{}') from jsonb_array_elements_text(coalesce(v_prod->'tags', '[]'::jsonb)) t),
       true)
    returning id into v_prod_id;
    v_n_prod := v_n_prod + 1;

    for v_var in select * from jsonb_array_elements(coalesce(v_prod->'variants', '[]'::jsonb)) loop
      insert into public.product_variants
        (merchant_id, product_id, name, sku, price_amount_minor_int,
         compare_at_amount_minor_int, stock_quantity, is_demo)
      values
        (_merchant_id, v_prod_id, v_var->>'name', v_var->>'sku',
         coalesce((v_var->>'price')::bigint, 0),
         nullif(v_var->>'compare_at', '')::bigint,
         coalesce((v_var->>'stock')::bigint, 0),
         true);
    end loop;

    for v_slug in select * from jsonb_array_elements_text(coalesce(v_prod->'collections', '[]'::jsonb)) loop
      insert into public.collection_products (collection_id, product_id, merchant_id, position)
      select c.id, v_prod_id, _merchant_id,
             coalesce((select max(position) + 10 from public.collection_products
                       where collection_id = c.id), 0)
      from public.collections c
      where c.merchant_id = _merchant_id and c.slug = v_slug;
    end loop;
  end loop;

  -- Merge the preset index layout into the draft (other templates untouched).
  select id into v_theme from public.store_themes
  where merchant_id = _merchant_id
  order by is_active desc, created_at asc limit 1;
  if v_theme is not null then
    select templates into v_tpl from public.theme_drafts where theme_id = v_theme;
    if found then
      update public.theme_drafts
      set templates = v_tpl || jsonb_build_object('index', coalesce(_ast, '{}'::jsonb)),
          updated_at = now()
      where theme_id = v_theme;
    else
      insert into public.theme_drafts (merchant_id, theme_id, revision, templates, tokens, updated_by)
      values (_merchant_id, v_theme, 0,
        jsonb_build_object('index', coalesce(_ast, '{}'::jsonb)),
        coalesce(_tokens, '{}'::jsonb), v_caller);
    end if;
  end if;

  return jsonb_build_object('status', 'imported', 'imported', true,
    'products', v_n_prod, 'categories', v_n_cat, 'collections', v_n_col,
    'version_id', null);
end $$;
grant execute on function public.theme_import_demo(uuid, text, jsonb, jsonb, jsonb)
  to authenticated, service_role;

-- 9. theme_purge_demo: removes ONLY is_demo rows (real catalogue untouched;
-- demo categories referenced by real products keep those products via the
-- SET NULL foreign key, then the category itself is removed only when
-- nothing real references it).
create or replace function public.theme_purge_demo(_merchant_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_prod int := 0; v_col int := 0; v_cat int := 0;
begin
  if v_caller is null then raise exception 'auth.required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.merchant_members
    where merchant_id = _merchant_id and user_id = v_caller and status = 'active'
  ) and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from public.product_variants
  where product_id in (select id from public.products
                       where merchant_id = _merchant_id and is_demo);
  delete from public.products where merchant_id = _merchant_id and is_demo;
  get diagnostics v_prod = row_count;
  delete from public.collections where merchant_id = _merchant_id and is_demo;
  get diagnostics v_col = row_count;
  delete from public.categories c
  where c.merchant_id = _merchant_id and c.is_demo
    and not exists (select 1 from public.products p
                    where p.category_id = c.id and coalesce(p.is_demo, false) = false);
  get diagnostics v_cat = row_count;

  if v_prod + v_col + v_cat = 0 then
    return jsonb_build_object('status', 'noop', 'purged', false,
      'products', 0, 'categories', 0, 'collections', 0, 'version_id', null);
  end if;
  return jsonb_build_object('status', 'purged', 'purged', true,
    'products', v_prod, 'categories', v_cat, 'collections', v_col,
    'version_id', null);
end $$;
grant execute on function public.theme_purge_demo(uuid)
  to authenticated, service_role;
