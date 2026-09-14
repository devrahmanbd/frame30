# Database export

`0001_baseline.sql` is a full `pg_dump` of the `public` schema of the live production
database: 136 tables, all enums, indexes, foreign keys, triggers, grants and 251 RLS policies.

Regenerate after schema changes:

```bash
pg_dump "$SUPABASE_DB_URL" --schema=public --schema-only --no-owner \
  -f migration/0001_baseline.sql
```

Import into a fresh database:

```bash
psql "$TARGET_DB_URL" -f migration/0001_baseline.sql
```

Notes:
- Source SQL used to build this lives in `supabase/baseline_parts/` and `supabase/migrations/`.
- RPC/business functions defined outside the baseline are not part of this dump; the
  `supabase/migrations/*.sql` grant files reference some of them and will error until
  those functions are recreated.

## Seed data (`0002_seed.sql`)

Creates one demo store and its owner:

- store: **Frame19 Demo Store** (`frame19-demo`, BDT, active, KYC verified) + settings
- owner: `owner@frame19.demo` / `Frame19!demo2026` (owner member, active)

Order of operations on a fresh database:

```bash
psql "$TARGET_DB_URL" -f migration/0001_baseline.sql

# auth users cannot be created from SQL — use the Auth API first
curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d '{"email":"owner@frame19.demo","password":"Frame19!demo2026"}'

# paste the returned uid into :seed_user_id if it differs, then
psql "$TARGET_DB_URL" -f migration/0002_seed.sql
```

If email confirmation is on, mark the seeded user confirmed once:
`update auth.users set email_confirmed_at = now() where email = 'owner@frame19.demo';`

The file is idempotent (upserts), so re-running it is safe.
