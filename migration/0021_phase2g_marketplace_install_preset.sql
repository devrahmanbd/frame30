-- Phase 2g — marketplace preset installs + store_themes display columns.
--
-- 1. marketplace_install_preset: WordPress-style theme install. Creates a
--    NEW INACTIVE store_themes row (never touches the active theme's
--    draft), snapshots version 1 and forks the editable draft. The caller
--    links the ledger row back via store_themes.source_install_id.
-- 2. store_themes display columns read by the Appearance/Themes screens
--    (screenshot_url, author, description, tags, auto_update, favourite,
--    installed_at) which no migration ever created.

-- 2. Display columns first (routine below does not need them, UI does).
alter table public.store_themes
  add column if not exists screenshot_url text,
  add column if not exists author text,
  add column if not exists description text,
  add column if not exists tags text[] default '{}' not null,
  add column if not exists auto_update boolean default false not null,
  add column if not exists favourite boolean default false not null,
  add column if not exists installed_at timestamptz;

-- 1. Install routine.
create or replace function public.marketplace_install_preset(
  _merchant_id uuid, _key text, _name text, _preset jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_theme uuid; v_id uuid;
begin
  if v_caller is null then raise exception 'auth.required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.merchant_members
    where merchant_id = _merchant_id and user_id = v_caller and status = 'active'
  ) and not public.is_platform_admin(v_caller) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _preset is null or jsonb_typeof(_preset) <> 'object' then
    raise exception 'builder.preset_invalid' using errcode = '22023';
  end if;

  insert into public.store_themes (merchant_id, name, is_active, installed_at)
  values (_merchant_id, coalesce(nullif(trim(_name), ''), _key), false, now())
  returning id into v_theme;

  insert into public.theme_versions
    (merchant_id, theme_id, version, status, label,
     templates, tokens, source_registry_key, created_by)
  values
    (_merchant_id, v_theme, 1, 'draft', _key,
     coalesce(_preset->'templates', '{}'::jsonb),
     coalesce(_preset->'tokens', '{}'::jsonb),
     _key, v_caller)
  returning id into v_id;

  insert into public.theme_drafts
    (merchant_id, theme_id, revision, templates, tokens, updated_by)
  values
    (_merchant_id, v_theme, 1,
     coalesce(_preset->'templates', '{}'::jsonb),
     coalesce(_preset->'tokens', '{}'::jsonb),
     v_caller);

  return jsonb_build_object('theme_id', v_theme, 'version_id', v_id);
end $$;
grant execute on function public.marketplace_install_preset(uuid, text, text, jsonb)
  to authenticated, service_role;
