-- Phase custom-domains — wire merchant_domains + domain_events into supabase/.
--
-- Source of truth: migration/0002_merchant_domains.sql (repo root, 130 lines).
-- That file was never wired into supabase/migrations or supabase/baseline_parts,
-- so fresh `supabase db reset` / CLI deploys lack the tables even though the live
-- DB has them (merchant_domains 22 cols, domain_events 9 cols) and 5+ server
-- modules query them (domains.server.ts, tenant-canary.server.ts, csrf.server.ts,
-- site-seo.server.ts, api/public/domains/verify-sni.ts).
--
-- PLUS domain_challenges: referenced by domains.server.ts storeChallenge (upsert
-- on hostname,token), readChallenge (select key_authorization, expires_at), and
-- sweepDomains (delete where expires_at < now), plus docs/custom-domain-system.md
-- ("ACME http-01: stores token + keyAuthorization, 1h TTL"). Zero DDL exists for
-- it anywhere in supabase/ or migration/. Shape below is INFERRED from those three
-- call sites only — columns: domain_id, hostname, token, key_authorization,
-- expires_at (+ id, created_at). Unique(hostname, token) matches the upsert
-- onConflict. Flag for DBA review before apply.
--
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS guards throughout; safe to re-run.
-- Apply manually (NOT applied by this change): psql / supabase db push.

-- ============================================================================
-- Enums (created only if they don't exist)
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'domain_status') THEN
    CREATE TYPE public.domain_status AS ENUM (
      'pending_dns', 'verifying', 'dns_verified', 'issuing_cert', 'active', 'failed', 'disabled'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cert_status') THEN
    CREATE TYPE public.cert_status AS ENUM (
      'none', 'pending', 'issued', 'renewing', 'error'
    );
  END IF;
END $$;

-- ============================================================================
-- Tables (faithful to migration/0002, IF NOT EXISTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_domains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    hostname text NOT NULL,
    status public.domain_status DEFAULT 'pending_dns'::public.domain_status NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    redirect_to_primary boolean DEFAULT true NOT NULL,
    verification_token text NOT NULL,
    dns_target text NOT NULL,
    created_by uuid NOT NULL,
    next_check_at timestamp with time zone NOT NULL,
    last_checked_at timestamp with time zone,
    check_attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    observed_records jsonb DEFAULT '[]'::jsonb NOT NULL,
    cert_status public.cert_status DEFAULT 'none'::public.cert_status NOT NULL,
    cert_issued_at timestamp with time zone,
    cert_expires_at timestamp with time zone,
    cert_error text,
    verified_at timestamp with time zone,
    activated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT merchant_domains_pkey PRIMARY KEY (id),
    CONSTRAINT merchant_domains_merchant_id_fkey FOREIGN KEY (merchant_id)
        REFERENCES public.merchants (id) ON DELETE CASCADE,
    CONSTRAINT merchant_domains_created_by_fkey FOREIGN KEY (created_by)
        REFERENCES auth.users (id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.merchant_domains IS 'Custom domains attached to a merchant storefront. Row-level security enforced via merchant_members.';

CREATE TABLE IF NOT EXISTS public.domain_events (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    domain_id uuid NOT NULL,
    merchant_id uuid NOT NULL,
    from_status public.domain_status,
    to_status public.domain_status NOT NULL,
    reason text,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    actor uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT domain_events_pkey PRIMARY KEY (id),
    CONSTRAINT domain_events_domain_id_fkey FOREIGN KEY (domain_id)
        REFERENCES public.merchant_domains (id) ON DELETE CASCADE,
    CONSTRAINT domain_events_merchant_id_fkey FOREIGN KEY (merchant_id)
        REFERENCES public.merchants (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.domain_events IS 'Append-only audit log for domain status transitions. One row per state change.';

-- INFERRED (no prior DDL; see header). ACME http-01 challenge store, 1h TTL.
CREATE TABLE IF NOT EXISTS public.domain_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    domain_id uuid NOT NULL
        CONSTRAINT domain_challenges_domain_id_fkey
        REFERENCES public.merchant_domains (id) ON DELETE CASCADE,
    hostname text NOT NULL,
    token text NOT NULL,
    key_authorization text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT domain_challenges_pkey PRIMARY KEY (id),
    CONSTRAINT domain_challenges_hostname_token_key UNIQUE (hostname, token)
);

COMMENT ON TABLE public.domain_challenges IS 'INFERRED from domains.server.ts (storeChallenge/readChallenge/sweepDomains). ACME http-01 challenge store, 1h TTL. DBA review required.';

-- ============================================================================
-- Indexes (IF NOT EXISTS)
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_domains_hostname ON public.merchant_domains (hostname);
CREATE INDEX IF NOT EXISTS idx_merchant_domains_merchant_id ON public.merchant_domains (merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_domains_status ON public.merchant_domains (status);
CREATE INDEX IF NOT EXISTS idx_merchant_domains_next_check ON public.merchant_domains (next_check_at) WHERE status IN ('pending_dns', 'verifying', 'issuing_cert');
CREATE INDEX IF NOT EXISTS idx_merchant_domains_cert_expires ON public.merchant_domains (cert_expires_at) WHERE status = 'active' AND cert_status = 'issued';

CREATE INDEX IF NOT EXISTS idx_domain_events_domain_id ON public.domain_events (domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_events_merchant_id ON public.domain_events (merchant_id);
CREATE INDEX IF NOT EXISTS idx_domain_events_created_at ON public.domain_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_domain_challenges_hostname_token ON public.domain_challenges (hostname, token);
CREATE INDEX IF NOT EXISTS idx_domain_challenges_expires_at ON public.domain_challenges (expires_at);

-- ============================================================================
-- Row-Level Security (DROP + CREATE = re-runnable)
-- ============================================================================

ALTER TABLE public.merchant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_domains_tenant_read ON public.merchant_domains;
CREATE POLICY merchant_domains_tenant_read ON public.merchant_domains
    FOR SELECT TO authenticated
    USING (public.is_merchant_member(merchant_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS merchant_domains_tenant_write ON public.merchant_domains;
CREATE POLICY merchant_domains_tenant_write ON public.merchant_domains
    TO authenticated
    USING (public.is_merchant_member(merchant_id))
    WITH CHECK (public.is_merchant_member(merchant_id));

DROP POLICY IF EXISTS domain_events_tenant_read ON public.domain_events;
CREATE POLICY domain_events_tenant_read ON public.domain_events
    FOR SELECT TO authenticated
    USING (public.is_merchant_member(merchant_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS domain_events_tenant_write ON public.domain_events;
CREATE POLICY domain_events_tenant_write ON public.domain_events
    TO authenticated
    USING (public.is_merchant_member(merchant_id))
    WITH CHECK (public.is_merchant_member(merchant_id));

-- domain_challenges: service-role only (all access via supabaseAdmin; the public
-- challenge is served through the app route, never direct PostgREST). No
-- authenticated/anon policies by design.
DROP POLICY IF EXISTS domain_challenges_tenant_read ON public.domain_challenges;
CREATE POLICY domain_challenges_tenant_read ON public.domain_challenges
    FOR SELECT TO authenticated
    USING (false);

-- ============================================================================
-- Grants
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_domains TO authenticated;
GRANT SELECT, INSERT ON public.domain_events TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON public.domain_challenges TO service_role;

NOTIFY pgrst, 'reload schema';
