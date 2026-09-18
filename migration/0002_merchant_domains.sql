-- Migration: 0002_merchant_domains
-- Purpose: Create merchant_domains and domain_events tables for the custom domain lifecycle.
-- Evidence: 27 code references across domains.server.ts, csrf.server.ts, search-console.server.ts,
--          tenant-canary.server.ts, verify-sni.ts, site-seo.server.ts.

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
-- Tables
-- ============================================================================

CREATE TABLE public.merchant_domains (
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

CREATE TABLE public.domain_events (
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

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE UNIQUE INDEX idx_merchant_domains_hostname ON public.merchant_domains (hostname);
CREATE INDEX idx_merchant_domains_merchant_id ON public.merchant_domains (merchant_id);
CREATE INDEX idx_merchant_domains_status ON public.merchant_domains (status);
CREATE INDEX idx_merchant_domains_next_check ON public.merchant_domains (next_check_at) WHERE status IN ('pending_dns', 'verifying', 'issuing_cert');
CREATE INDEX idx_merchant_domains_cert_expires ON public.merchant_domains (cert_expires_at) WHERE status = 'active' AND cert_status = 'issued';

CREATE INDEX idx_domain_events_domain_id ON public.domain_events (domain_id);
CREATE INDEX idx_domain_events_merchant_id ON public.domain_events (merchant_id);
CREATE INDEX idx_domain_events_created_at ON public.domain_events (created_at DESC);

-- ============================================================================
-- Row-Level Security
-- ============================================================================

ALTER TABLE public.merchant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

-- merchant_domains: tenant read
CREATE POLICY merchant_domains_tenant_read ON public.merchant_domains
    FOR SELECT TO authenticated
    USING (public.is_merchant_member(merchant_id) OR public.is_platform_admin());

-- merchant_domains: tenant write
CREATE POLICY merchant_domains_tenant_write ON public.merchant_domains
    TO authenticated
    USING (public.is_merchant_member(merchant_id))
    WITH CHECK (public.is_merchant_member(merchant_id));

-- domain_events: tenant read
CREATE POLICY domain_events_tenant_read ON public.domain_events
    FOR SELECT TO authenticated
    USING (public.is_merchant_member(merchant_id) OR public.is_platform_admin());

-- domain_events: tenant write
CREATE POLICY domain_events_tenant_write ON public.domain_events
    TO authenticated
    USING (public.is_merchant_member(merchant_id))
    WITH CHECK (public.is_merchant_member(merchant_id));

-- ============================================================================
-- Grants
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_domains TO authenticated;
GRANT SELECT, INSERT ON public.domain_events TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
