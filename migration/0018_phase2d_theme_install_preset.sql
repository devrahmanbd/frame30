-- theme_install_preset: install an official preset as a new theme version
-- and fork it into the editable draft. Called by installRegistryTheme
-- (Content > Themes and the marketplace built-in bridge).
-- Contract: types.reference.ts + src/routes/.../builder.tsx (expects an
-- error containing "builder.draft_exists" when a draft exists and no
-- overwrite was confirmed).
create or replace function public.theme_install_preset(
  _merchant_id uuid,
  _key text,
  _preset jsonb,
  _overwrite_draft boolean default false
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_theme uuid;
  v_version bigint;
  v_id uuid;
begin
  if v_caller is null then
    raise exception 'auth.required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.merchant_members
    where merchant_id = _merchant_id and user_id = v_caller and status = 'active'
  ) and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if _preset is null or jsonb_typeof(_preset) <> 'object' then
    raise exception 'builder.preset_invalid' using errcode = '22023';
  end if;

  -- Active theme first, else oldest (mirrors ensureTheme ordering).
  select id into v_theme from public.store_themes
  where merchant_id = _merchant_id
  order by is_active desc, created_at asc
  limit 1;

  if v_theme is null then
    insert into public.store_themes (merchant_id, name, is_active)
    values (_merchant_id, _key, true)
    returning id into v_theme;
  end if;

  -- Never silently replace authored work: the UI confirms overwrite.
  if exists (select 1 from public.theme_drafts where theme_id = v_theme)
     and not coalesce(_overwrite_draft, false) then
    raise exception 'builder.draft_exists' using errcode = '23505';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.theme_versions where theme_id = v_theme;

  insert into public.theme_versions
    (merchant_id, theme_id, version, status, label,
     templates, tokens, source_registry_key, created_by)
  values
    (_merchant_id, v_theme, v_version, 'draft', _key,
     coalesce(_preset->'templates', '{}'::jsonb),
     coalesce(_preset->'tokens', '{}'::jsonb),
     _key, v_caller)
  returning id into v_id;

  delete from public.theme_drafts where theme_id = v_theme;
  insert into public.theme_drafts
    (merchant_id, theme_id, revision, templates, tokens, updated_by)
  values
    (_merchant_id, v_theme, v_version,
     coalesce(_preset->'templates', '{}'::jsonb),
     coalesce(_preset->'tokens', '{}'::jsonb),
     v_caller);

  return v_id;
end $$;
grant execute on function public.theme_install_preset(uuid, text, jsonb, boolean)
  to authenticated, service_role;
