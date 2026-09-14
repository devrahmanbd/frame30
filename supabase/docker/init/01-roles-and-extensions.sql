-- Framique — one-time bootstrap for a fresh self-hosted Postgres volume.
--
-- Runs ONLY on an empty data directory. Application schema is never created
-- here: that belongs to supabase/ migrations so that `bun run schema:check`
-- has a single source of truth. What lives here is what migrations cannot
-- create for themselves — cluster roles, extensions and the pg_cron owner.
--
-- Passwords come from the entrypoint environment; nothing is hard-coded.

\set pgpass `echo "$POSTGRES_PASSWORD"`

-- Extensions the platform depends on. pgcrypto backs gen_random_uuid() used by
-- every table default; pg_cron fires the scheduled jobs; pg_stat_statements is
-- what `bun run db:slow-queries` reads.
create extension if not exists pgcrypto with schema public;
create extension if not exists pg_stat_statements;
create extension if not exists pg_cron;
create extension if not exists pg_trgm with schema public;
create extension if not exists unaccent with schema public;

-- pg_cron's own catalogue is superuser territory; grant usage explicitly rather
-- than letting jobs be scheduled by whichever role happens to connect.
grant usage on schema cron to postgres;

-- PostgREST's connection role. It can *become* anon/authenticated/service_role
-- and nothing else, which is what keeps a JWT claim from reaching superuser.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute format('create role authenticator noinherit login password %L', current_setting('POSTGRES_PASSWORD', true));
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;

-- Deliberately NOT granted: default privileges on `public` for anon or
-- authenticated. Every table's grants are written in its own migration next to
-- its RLS policies, so a new table is unreachable until someone states who may
-- read it. See docs/01-architecture/tenancy-runtime.md §1.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Read-only monitoring role scraped by postgres_exporter (ops/prometheus.yml).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'metrics') then
    execute format('create role metrics login password %L in role pg_monitor', current_setting('POSTGRES_PASSWORD', true));
  end if;
end
$$;
