-- Phase 2k — backfill auto_updates on pre-existing plugin_state (phase2j only covers fresh creates).
alter table public.plugin_state add column if not exists auto_updates boolean not null default false;
