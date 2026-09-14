#!/usr/bin/env python3
"""Reconstruct a baseline Postgres schema from the generated Supabase types
reference (table shapes + FK relationships) and the schema fingerprint (enums).

Output: supabase/generated_baseline.sql (reviewed, then shipped as a migration).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TYPES = (ROOT / "supabase/types.reference.ts").read_text()
FP = json.loads((ROOT / "supabase/schema.fingerprint.json").read_text())
ENUMS = FP["enums"]

# ---------------------------------------------------------------- parse types
public_block = TYPES.split("  public: {", 1)[1]
tables_src = public_block.split("    Tables: {", 1)[1]
tables_src = tables_src.split("\n    Views: {", 1)[0]

TABLE_RE = re.compile(r"^      (\w+): \{$")
lines = tables_src.split("\n")

tables = {}
i = 0
cur = None
section = None
while i < len(lines):
    line = lines[i]
    m = TABLE_RE.match(line)
    if m:
        cur = m.group(1)
        tables[cur] = {"row": {}, "insert": {}, "fks": []}
        section = None
    elif cur:
        s = line.strip()
        if s in ("Row: {", "Insert: {", "Update: {", "Relationships: ["):
            section = s.split(":")[0]
        elif s in ("}", "]"):
            section = None
        elif section in ("Row", "Insert") and ":" in s:
            name, ttype = s.split(":", 1)
            optional = name.endswith("?")
            name = name.rstrip("?").strip()
            tables[cur][section.lower()][name] = {
                "type": ttype.strip(),
                "optional": optional,
            }
        elif section == "Relationships" and s.startswith("columns:"):
            cols = re.findall(r'"(\w+)"', s)
            ref_rel = None
            for j in range(i, min(i + 4, len(lines))):
                rm = re.search(r'referencedRelation: "(\w+)"', lines[j])
                if rm:
                    ref_rel = rm.group(1)
                    break
            if cols and ref_rel:
                tables[cur]["fks"].append((cols[0], ref_rel))
    i += 1

# ------------------------------------------------------------- type inference
TS_ARRAY = re.compile(r"^(.*)\[\]$")


def pg_type(table: str, col: str, ts: str) -> str:
    base = ts.replace(" | null", "").strip()
    arr = False
    m = TS_ARRAY.match(base)
    if m:
        base, arr = m.group(1).strip(), True
    em = re.match(r'Database\["public"\]\["Enums"\]\["(\w+)"\]', base)
    if em:
        t = f"public.{em.group(1)}"
    elif base == "Json":
        t = "jsonb"
    elif base == "boolean":
        t = "boolean"
    elif base == "number":
        if re.search(r"(_pct|_ratio|_score|_rate_num)$", col):
            t = "numeric"
        else:
            t = "bigint"
    else:  # string
        if col == "id" or col.endswith("_id") or col.endswith("_by") or col == "user_id":
            t = "uuid"
        elif col.endswith("_at"):
            t = "timestamptz"
        elif col.endswith("_date") or col.endswith("_on"):
            t = "date"
        else:
            t = "text"
    return t + "[]" if arr else t


def default_for(table: str, col: str, t: str) -> str | None:
    if col == "id" and t == "uuid":
        return "gen_random_uuid()"
    if t == "timestamptz":
        return "now()"
    if t == "jsonb":
        return "'{}'::jsonb"
    if t.endswith("[]"):
        return f"'{{}}'::{t}"
    if t == "boolean":
        return "false"
    if t in ("bigint", "numeric"):
        return "0"
    if t == "text":
        if col == "currency_code":
            return "'BDT'"
        return "''"
    if t.startswith("public."):
        enum_name = t.split(".", 1)[1]
        vals = ENUMS.get(enum_name)
        if vals:
            return f"'{vals[0]}'::{t}"
    return None



UNIQUES = {
    "merchants": [["slug"]],
    "merchant_members": [["merchant_id", "user_id"]],
    "profiles": [],
}

CORE_POLICIES = {
    "profiles": [
        """create policy "profiles_self" on public.profiles for all to authenticated
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());""",
    ],
    "platform_admins": [
        """create policy "platform_admins_read" on public.platform_admins for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());""",
    ],
    "merchant_members": [
        """create policy "merchant_members_read" on public.merchant_members for select to authenticated
  using (user_id = auth.uid() or public.is_merchant_member(merchant_id) or public.is_platform_admin());""",
        """create policy "merchant_members_manage" on public.merchant_members for all to authenticated
  using (public.is_merchant_admin(merchant_id) or public.is_platform_admin())
  with check (public.is_merchant_admin(merchant_id) or public.is_platform_admin());""",
    ],
    "merchants": [
        """create policy "merchants_read" on public.merchants for select to authenticated
  using (public.is_merchant_member(id) or public.is_platform_admin());""",
        """create policy "merchants_manage" on public.merchants for all to authenticated
  using (public.is_merchant_admin(id) or public.is_platform_admin())
  with check (public.is_merchant_admin(id) or public.is_platform_admin());""",
    ],
}

# --------------------------------------------------------------------- output
out = []
w = out.append

w("-- Framique baseline schema (reconstructed from the generated type contract).")
w("-- Enums, tables, keys, indexes, updated_at triggers, grants and RLS.")
w("")

w("-- ============================ enums ============================")
for name in sorted(ENUMS):
    vals = ", ".join("'" + v.replace("'", "''") + "'" for v in ENUMS[name])
    w(f"do $$ begin create type public.{name} as enum ({vals}); exception when duplicate_object then null; end $$;")
w("")

w("""-- ======================= shared utilities =======================
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.is_platform_admin(_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = _user_id)
$$;

create or replace function public.is_merchant_member(_merchant_id uuid, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.merchant_members m
    where m.merchant_id = _merchant_id and m.user_id = _user_id and m.status = 'active'
  )
$$;

create or replace function public.is_merchant_admin(_merchant_id uuid, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.merchant_members m
    where m.merchant_id = _merchant_id and m.user_id = _user_id
      and m.status = 'active' and m.role in ('owner','admin')
  )
$$;

grant execute on function public.is_platform_admin(uuid) to authenticated, service_role;
grant execute on function public.is_merchant_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_merchant_admin(uuid, uuid) to authenticated, service_role;
""")

# dependency order: merchants first, then tables sorted by FK depth
def depth(t, seen=None):
    seen = seen or set()
    if t in seen or t not in tables:
        return 0
    seen = seen | {t}
    d = 0
    for _, ref in tables[t]["fks"]:
        if ref != t and ref in tables:
            d = max(d, 1 + depth(ref, seen))
    return d


order = sorted(tables, key=lambda t: (depth(t), t))

w("-- ============================ tables ============================")
for t in order:
    spec = tables[t]
    row = spec["row"]
    ins = spec["insert"]
    cols = []
    for col, info in row.items():
        pt = pg_type(t, col, info["type"])
        nullable = "| null" in info["type"]
        piece = f"  {col} {pt}"
        insinfo = ins.get(col)
        if insinfo and insinfo["optional"] and not nullable:
            d = default_for(t, col, pt)
            if d:
                piece += f" default {d}"
        if not nullable:
            piece += " not null"
        cols.append(piece)
    pkcol = "id" if "id" in row else ("user_id" if "user_id" in row else None)
    pk = f"  primary key ({pkcol})" if pkcol else None
    body = ",\n".join(cols + ([pk] if pk else []))
    w(f"create table if not exists public.{t} (\n{body}\n);")
    # foreign keys
    seen_fk = set()
    for col, ref in spec["fks"]:
        if t == "profiles" or ref not in tables or col not in row or (col, ref) in seen_fk:
            continue
        seen_fk.add((col, ref))
        nullable = "| null" in row[col]["type"]
        action = "on delete set null" if nullable else "on delete cascade"
        w(
            f"alter table public.{t} add constraint {t}_{col}_fkey "
            f"foreign key ({col}) references public.{ref}(id) {action};"
        )
    if "merchant_id" in row:
        w(f"create index if not exists {t}_merchant_idx on public.{t} (merchant_id);")
    if "created_at" in row:
        w(f"create index if not exists {t}_created_idx on public.{t} (created_at desc);")
    if "updated_at" in row:
        w(
            f"create trigger {t}_set_updated_at before update on public.{t} "
            "for each row execute function public.set_updated_at();"
        )
    for uq in UNIQUES.get(t, []):
        w(f"create unique index if not exists {t}_{'_'.join(uq)}_uq on public.{t} ({', '.join(uq)});")
    w(f"grant select, insert, update, delete on public.{t} to authenticated;")
    w(f"grant all on public.{t} to service_role;")
    w(f"alter table public.{t} enable row level security;")
    if t in CORE_POLICIES:
        for pol in CORE_POLICIES[t]:
            w(pol)
    elif "merchant_id" in row:
        w(f"""create policy "{t}_tenant_read" on public.{t} for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());""")
        w(f"""create policy "{t}_tenant_write" on public.{t} for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));""")
    elif "user_id" in row:
        w(f"""create policy "{t}_self" on public.{t} for all to authenticated
  using (user_id = auth.uid() or public.is_platform_admin())
  with check (user_id = auth.uid() or public.is_platform_admin());""")
    else:
        w(f"""create policy "{t}_platform_only" on public.{t} for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());""")
    w("")

full = "\n".join(out)
(ROOT / "supabase/generated_baseline.sql").write_text(full)

# split into parts on the table markers, keeping the preamble in part 1
marker = "-- ============================ tables ============================"
head, body = full.split(marker)
chunks = ("\n" + body).split("\ncreate table if not exists ")
chunks = [c for c in chunks if c.strip()]
PARTS = 4
size = (len(chunks) + PARTS - 1) // PARTS
outdir = ROOT / "supabase/baseline_parts"
outdir.mkdir(exist_ok=True)
for idx in range(PARTS):
    sel = chunks[idx * size:(idx + 1) * size]
    if not sel:
        continue
    txt = "".join("create table if not exists " + c for c in sel)
    if idx == 0:
        txt = head + marker + "\n" + txt
    (outdir / f"part{idx + 1}.sql").write_text(txt)
    print(f"part{idx+1}: {len(txt)} bytes, {len(sel)} tables")
print("tables:", len(tables), "enums:", len(ENUMS))
print("bytes:", len("\n".join(out)))
