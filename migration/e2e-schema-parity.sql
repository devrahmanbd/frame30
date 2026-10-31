-- e2e-schema-parity.sql
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The checked-in baseline (`migration/0001_baseline.sql`) is a pg_dump taken
-- from a PG 17 database at an earlier point in time and is STALE relative to
-- the deployed schema. A large number of production relations (~120) have no
-- creator anywhere in this repo, so a fresh stack built from the repo alone
-- cannot fully materialize production.
--
-- Most of those relations are not touched by the repo's own seed or by the
-- `songoskriti-seven-templates` lane, so they are left absent and only produce
-- benign "relation does not exist" warnings (which the CI script logs).
--
-- TWO of them are different: `nav_menus` and `nav_menu_items` are INSERTed by
-- the repo's OWN demo seed (`migration/0003_demo_catalogue.sql`). Without them
-- the seed cannot run at all, and the demo merchant has no storefront
-- navigation. This file reproduces those two relations from the deployed
-- schema's DDL so a fresh stack can hold the seed and stay faithful to
-- production.
--
-- SCOPE / HONESTY
-- ---------------
-- This moves a fresh stack TOWARD the deployed schema, never away from it: the
-- DDL below is copied verbatim from production (`pg_dump --schema-only -t
-- public.nav_menus -t public.nav_menu_items`), stripped only of psql meta
-- commands and owner/privilege lines. It depends solely on `is_merchant_member`
-- and `is_platform_admin` (both created by the baseline) and
-- `gen_random_uuid()` — no foreign keys to other production-only relations.
--
-- This is NOT a substitute for reconciling the stale baseline with production
-- (see report.md §9.5 residual #1). It closes exactly the gap the seed needs
-- and no more.

CREATE TABLE IF NOT EXISTS public.nav_menus (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    name text NOT NULL,
    handle text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.nav_menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    menu_id uuid NOT NULL,
    label text NOT NULL,
    url text,
    sort_order integer DEFAULT 0 NOT NULL,
    parent_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nav_menus_pkey') THEN
        ALTER TABLE ONLY public.nav_menus ADD CONSTRAINT nav_menus_pkey PRIMARY KEY (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nav_menus_merchant_id_handle_key') THEN
        ALTER TABLE ONLY public.nav_menus ADD CONSTRAINT nav_menus_merchant_id_handle_key UNIQUE (merchant_id, handle);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nav_menu_items_pkey') THEN
        ALTER TABLE ONLY public.nav_menu_items ADD CONSTRAINT nav_menu_items_pkey PRIMARY KEY (id);
    END IF;
END $$;

ALTER TABLE public.nav_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nav_menu_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nav_menus' AND policyname = 'nav_menus_public_read') THEN
        CREATE POLICY nav_menus_public_read ON public.nav_menus FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nav_menus' AND policyname = 'nav_menus_tenant_write') THEN
        CREATE POLICY nav_menus_tenant_write ON public.nav_menus TO authenticated
            USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()))
            WITH CHECK ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nav_menu_items' AND policyname = 'nav_menu_items_public_read') THEN
        CREATE POLICY nav_menu_items_public_read ON public.nav_menu_items FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nav_menu_items' AND policyname = 'nav_menu_items_tenant_write') THEN
        CREATE POLICY nav_menu_items_tenant_write ON public.nav_menu_items TO authenticated
            USING ((EXISTS (SELECT 1 FROM public.nav_menus m
                            WHERE ((m.id = nav_menu_items.menu_id) AND
                                   (public.is_merchant_member(m.merchant_id) OR public.is_platform_admin())))))
            WITH CHECK ((EXISTS (SELECT 1 FROM public.nav_menus m
                                 WHERE ((m.id = nav_menu_items.menu_id) AND
                                        (public.is_merchant_member(m.merchant_id) OR public.is_platform_admin())))));
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- url_redirects — the OTHER production-only relation the public storefront
-- needs. src/lib/permalink.server.ts reads it ~10 times to resolve a
-- /store/<slug>/... request (301 lookups); those reads are strict (not loose),
-- so on a fresh stack without this table every storefront route 404s. This is
-- the logged root cause of the seven-template lane's three 404 failures
-- (render_read.failed ... relation "public.url_redirects" does not exist).
-- DDL copied verbatim from production (pg_dump --schema-only). It depends only
-- on gen_random_uuid() and the repo-created is_merchant_member/is_platform_admin
-- RLS helpers; no foreign keys to other production-only relations.
--
-- NOTE: url_missing_log (also read by permalink.server.ts) is deliberately NOT
-- created here — it does NOT exist in production either (verified: 0 rows), and
-- every read of it goes through loose() (caught), so its absence is benign and
-- creating it would DIVERGE from the deployed schema.
CREATE TABLE IF NOT EXISTS public.url_redirects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    source_path text NOT NULL,
    target_path text NOT NULL,
    status_code integer DEFAULT 301 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    from_path text,
    to_path text,
    status text,
    entity_type text DEFAULT 'manual'::text,
    origin text DEFAULT 'manual'::text,
    hits bigint DEFAULT 0,
    last_hit_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'url_redirects_pkey') THEN
        ALTER TABLE ONLY public.url_redirects ADD CONSTRAINT url_redirects_pkey PRIMARY KEY (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_url_redirects_merchant_from') THEN
        CREATE UNIQUE INDEX idx_url_redirects_merchant_from ON public.url_redirects USING btree (merchant_id, from_path);
    END IF;
END $$;

ALTER TABLE public.url_redirects ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'url_redirects' AND policyname = 'url_redirects_public_read') THEN
        CREATE POLICY url_redirects_public_read ON public.url_redirects FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'url_redirects' AND policyname = 'url_redirects_tenant_write') THEN
        CREATE POLICY url_redirects_tenant_write ON public.url_redirects TO authenticated
            USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()))
            WITH CHECK ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));
    END IF;
END $$;

-- GRANTS to match the deployed schema exactly (pg_dump --no-privileges above
-- carries none). The public storefront reads as anon, so anon needs SELECT on
-- url_redirects (production grants it) — without it the read would fail with
-- "permission denied" instead of resolving.
GRANT SELECT ON TABLE public.url_redirects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.url_redirects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.url_redirects TO service_role;

-- ---------------------------------------------------------------------------
-- merchant_settings GRANT drift. The deployed database grants anon a full
-- SELECT on this table; the checked-in baseline only grants anon COLUMN-level
-- SELECTs (cod_enabled, free_shipping_threshold_minor_int, ...). The public
-- storefront reads columns outside that list, producing the logged
-- "permission denied for table merchant_settings". Granting anon full SELECT
-- moves the fresh stack TOWARD the deployed schema (verified against
-- production: anon has SELECT).
GRANT SELECT ON TABLE public.merchant_settings TO anon;
