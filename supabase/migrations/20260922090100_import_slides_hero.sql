-- Amendment: import_theme_slides also merges `hero` (repeater) sections.
--
-- The original only handled hero_carousel blueprints, so Supershop
-- (whose index hero is a `hero` repeater widget) could never import
-- slides: permanent noop/no_slides_in_blueprint. The fallback appends
-- the blueprint's whole hero section when the draft has neither hero
-- nor hero_carousel. Carousel path byte-identical to before.
create or replace function public.import_theme_slides(
  _merchant_id uuid, _theme_key text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_theme uuid;
  v_draft record;
  v_blueprint jsonb;
  v_slides jsonb;
  v_hero jsonb;
  v_existing jsonb;
  v_has_hero boolean;
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

  -- Find the merchant's most recent theme
  select id into v_theme from public.store_themes
  where merchant_id = _merchant_id
  order by is_active desc, created_at asc limit 1;

  if v_theme is null then
    return jsonb_build_object(
      'status', 'noop', 'imported', false, 'count', 0,
      'reason', 'no_theme'
    );
  end if;

  -- Load the blueprint preset
  select preset into v_blueprint from public.theme_registry
  where key = _theme_key limit 1;

  if v_blueprint is null then
    return jsonb_build_object(
      'status', 'noop', 'imported', false, 'count', 0,
      'reason', 'blueprint_not_found'
    );
  end if;

  -- Extract hero_carousel slides from the blueprint's index template
  v_slides := v_blueprint #>> '{templates,index,main}';
  if v_slides is null then
    v_slides := '[]'::jsonb;
  end if;

  -- Find the hero_carousel section in the blueprint
  v_slides := (
    select jsonb_agg(elem->'props'->'slides')
    from jsonb_array_elements(
      coalesce(v_blueprint #> '{templates,index,main}', '[]'::jsonb)
    ) elem
    where elem->>'type' = 'hero_carousel'
    limit 1
  );

  -- Fallback: `hero` repeater blueprints (e.g. supershop) carry slides in
  -- items/scalars instead of a hero_carousel section.
  if v_slides is null or jsonb_array_length(v_slides) = 0 then
    v_hero := (
      select elem from jsonb_array_elements(
        coalesce(v_blueprint #> '{templates,index,main}', '[]'::jsonb)
      ) elem
      where elem->>'type' = 'hero'
      limit 1
    );
  end if;

  if (v_slides is null or jsonb_array_length(v_slides) = 0) and v_hero is null then
    return jsonb_build_object(
      'status', 'noop', 'imported', false, 'count', 0,
      'reason', 'no_slides_in_blueprint'
    );
  end if;

  -- Check if the draft already has a hero section
  select templates into v_draft from public.theme_drafts
  where theme_id = v_theme;

  if found then
    v_existing := v_draft.templates #> '{index,main}';
    if v_existing is not null then
      v_has_hero := (
        select exists (
          select 1 from jsonb_array_elements(v_existing) elem
          where elem->>'type' in ('hero_carousel', 'hero')
        )
      );
      if v_has_hero then
        return jsonb_build_object(
          'status', 'noop', 'imported', false, 'count', 0,
          'reason', 'slides_already_exist'
        );
      end if;
    end if;
  end if;

  -- Merge the blueprint hero section into the draft's index main
  if v_slides is not null and jsonb_array_length(v_slides) > 0 then
    if found then
      update public.theme_drafts
      set templates = jsonb_set(
        templates,
        '{index,main}',
        coalesce(templates #> '{index,main}', '[]'::jsonb)
        || jsonb_build_array(
          jsonb_build_object(
            'type', 'hero_carousel',
            'props', jsonb_build_object(
              'slides', v_slides,
              'autoAdvanceMs', 6000
            )
          )
        ),
        updated_at = now()
      )
      where theme_id = v_theme;
    else
      insert into public.theme_drafts
        (merchant_id, theme_id, revision, templates, tokens, updated_by)
      values (
        _merchant_id, v_theme, 0,
        jsonb_build_object(
          'index', jsonb_build_object(
            'main', jsonb_build_array(
              jsonb_build_object(
                'type', 'hero_carousel',
                'props', jsonb_build_object(
                  'slides', v_slides,
                  'autoAdvanceMs', 6000
                )
              )
            )
          )
        ),
        '{}'::jsonb, v_caller
      );
    end if;

    return jsonb_build_object(
      'status', 'imported', 'imported', true,
      'count', jsonb_array_length(v_slides)
    );
  end if;

  -- Hero-section merge (repeater blueprints): append whole section as-is.
  if found then
    update public.theme_drafts
    set templates = jsonb_set(
      templates,
      '{index,main}',
      coalesce(templates #> '{index,main}', '[]'::jsonb)
      || jsonb_build_array(v_hero),
      updated_at = now()
    )
    where theme_id = v_theme;
  else
    insert into public.theme_drafts
      (merchant_id, theme_id, revision, templates, tokens, updated_by)
    values (
      _merchant_id, v_theme, 0,
      jsonb_build_object(
        'index', jsonb_build_object('main', jsonb_build_array(v_hero))
      ),
      '{}'::jsonb, v_caller
    );
  end if;

  return jsonb_build_object(
    'status', 'imported', 'imported', true,
    'count', coalesce(jsonb_array_length(v_hero->'props'->'items'), 1)
  );
end $$;

grant execute on function public.import_theme_slides(uuid, text)
  to authenticated, service_role;
