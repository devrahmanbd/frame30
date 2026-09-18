-- =====================================================================
-- Fix RLS policies for integration tables.
--
-- integration_connections: platform-level, no merchant_id column.
--   Admin-only read, service-role writes (via ownerGate).
--
-- integration_probes: linked to connections by service name, not
--   a connection_id foreign key.  Admin-only read.
-- =====================================================================

-- integration_connections: replace broken policy (referenced merchant_id)
drop policy if exists integration_connections_tenant_read on public.integration_connections;
create policy integration_connections_admin_read on public.integration_connections
  for select to authenticated
  using (is_platform_admin());

-- integration_probes: replace broken policy (referenced connection_id)
drop policy if exists integration_probes_tenant on public.integration_probes;
create policy integration_probes_admin_read on public.integration_probes
  for select to authenticated
  using (is_platform_admin());
