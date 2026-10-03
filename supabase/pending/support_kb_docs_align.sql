-- Framique: align support_kb_docs with saveDoc writes (seed/backfill unblocked)
-- Status: PENDING — additive, nullable columns + check constraint only.
alter table public.support_kb_docs
  add column if not exists locale text,
  add column if not exists status text not null default 'draft',
  add column if not exists source_url text,
  add column if not exists updated_by text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'support_kb_docs_status_check') then
    alter table public.support_kb_docs
      add constraint support_kb_docs_status_check check (status in ('draft','published'));
  end if;
end $$;
