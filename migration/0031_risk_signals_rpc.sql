-- Migration 0031: Define missing get_merchant_risk_signals RPC and harden blog_terms RLS write policy.

create or replace function public.get_merchant_risk_signals(p_merchant_id uuid)
returns jsonb
language sql
security definer
stable
as $$
  select jsonb_build_object(
    'abuse_score', coalesce(abuse_score, 0),
    'theme_source', 'marketplace',
    'plugin_sources', jsonb_build_array('marketplace')
  )
  from public.merchants
  where id = p_merchant_id;
$$;

grant execute on function public.get_merchant_risk_signals(uuid) to authenticated, service_role, anon;

-- Harden blog_terms write policy to merchant members and platform admins
drop policy if exists blog_terms_auth_write on public.blog_terms;
drop policy if exists blog_terms_tenant_write on public.blog_terms;

create policy blog_terms_tenant_write on public.blog_terms
  for all to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin())
  with check (public.is_merchant_member(merchant_id) or public.is_platform_admin());
