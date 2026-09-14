#!/usr/bin/env python3
"""Compact emitter: reads the parsed schema from gen-baseline-schema.py output
(supabase/generated_baseline.sql) and rewrites it as compact DDL parts plus a
policy/grant/trigger automation block."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
full = (ROOT / "supabase/generated_baseline.sql").read_text()
head, body = full.split("-- ============================ tables ============================")

# ---- compact each create table into a single line, drop generated index/trigger/grant/policy noise
tables = []
for block in ("\n" + body).split("\ncreate table if not exists ")[1:]:
    name = block.split(" (", 1)[0].replace("public.","")
    cols_src = block.split(" (", 1)[1].split("\n);", 1)[0]
    cols = " ".join(x.strip() for x in cols_src.strip().split("\n"))
    cols = cols.replace("id bigint default 0 not null", "id bigint generated always as identity")
    rest = block.split("\n);", 1)[1]
    fks = [l for l in rest.split("\n") if l.startswith("alter table") and "foreign key" in l]
    uqs = [l for l in rest.split("\n") if l.startswith("create unique index")]
    pols = re.findall(r'create policy "[^"]+" on [^;]+;', rest, re.S)
    core = [p for p in pols if "_tenant_" not in p and "_self\"" not in p and "_platform_only" not in p]
    tables.append((name, f"create table if not exists public.{name} ({cols});", fks, uqs, core))

AUTOMATION = """
-- Grants, RLS, indexes, updated_at triggers and default tenant policies for
-- every reconstructed table. Tables that already carry a hand-written policy
-- (tenancy core) keep it; the loop only adds what is missing.
do $$
declare r record; has_merchant boolean; has_user boolean; has_updated boolean; has_created boolean;
begin
  for r in select c.relname as t from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.t);
    execute format('grant all on public.%I to service_role', r.t);
    execute format('alter table public.%I enable row level security', r.t);

    select count(*) > 0 into has_merchant from information_schema.columns
      where table_schema='public' and table_name=r.t and column_name='merchant_id';
    select count(*) > 0 into has_user from information_schema.columns
      where table_schema='public' and table_name=r.t and column_name='user_id';
    select count(*) > 0 into has_updated from information_schema.columns
      where table_schema='public' and table_name=r.t and column_name='updated_at';
    select count(*) > 0 into has_created from information_schema.columns
      where table_schema='public' and table_name=r.t and column_name='created_at';

    if has_merchant then
      execute format('create index if not exists %I on public.%I (merchant_id)', r.t||'_merchant_idx', r.t);
    end if;
    if has_created then
      execute format('create index if not exists %I on public.%I (created_at desc)', r.t||'_created_idx', r.t);
    end if;
    if has_updated and not exists (
      select 1 from pg_trigger where tgname = r.t||'_set_updated_at'
    ) then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', r.t||'_set_updated_at', r.t);
    end if;

    if exists (select 1 from pg_policies where schemaname='public' and tablename=r.t) then
      continue;
    end if;

    if has_merchant then
      execute format($f$create policy %I on public.%I for select to authenticated
        using (public.is_merchant_member(merchant_id) or public.is_platform_admin())$f$, r.t||'_tenant_read', r.t);
      execute format($f$create policy %I on public.%I for all to authenticated
        using (public.is_merchant_member(merchant_id))
        with check (public.is_merchant_member(merchant_id))$f$, r.t||'_tenant_write', r.t);
    elsif has_user then
      execute format($f$create policy %I on public.%I for all to authenticated
        using (user_id = auth.uid() or public.is_platform_admin())
        with check (user_id = auth.uid() or public.is_platform_admin())$f$, r.t||'_self', r.t);
    else
      execute format($f$create policy %I on public.%I for all to authenticated
        using (public.is_platform_admin()) with check (public.is_platform_admin())$f$, r.t||'_platform_only', r.t);
    end if;
  end loop;
end $$;
"""

outdir = ROOT / "supabase/baseline_parts"
for f in outdir.glob("*.sql"):
    f.unlink()

PARTS = 3
size = (len(tables) + PARTS - 1) // PARTS
for idx in range(PARTS):
    sel = tables[idx * size:(idx + 1) * size]
    if not sel:
        continue
    lines = []
    if idx == 0:
        lines.append(head.strip())
    for name, ddl, fks, uqs, core in sel:
        lines.append(ddl)
        lines.extend(fks)
        lines.extend(uqs)
        lines.extend(core)
    if idx == PARTS - 1:
        lines.append(AUTOMATION)
    txt = "\n".join(lines) + "\n"
    (outdir / f"part{idx + 1}.sql").write_text(txt)
    print(f"part{idx+1}: {len(txt)} bytes, {len(sel)} tables")
