-- e2e-schema-parity-prod.sql
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The checked-in baseline (migration/0001_baseline.sql) is a STALE pg_dump. A
-- cross-check of every production `public` relation against every `create table`
-- in the repo finds ~120 relations with NO creator anywhere in the repo. Most
-- are app features whose tables were created by migrations that never made it
-- into this repository, so a fresh stack built from the repo alone cannot
-- reproduce them.
--
-- The app READS many of these at runtime. Tracing `.from("<table>")` across the
-- server-side libs, ~79 production-only tables are read somewhere; the
-- storefront render path reads a subset strictly (e.g. `template_seo.map` reads
-- `builder_template_seo` and THROWS if it is missing -> the /store route 404s).
-- Materializing them is what lets the seven-templates lane run green on a fresh
-- stack instead of 404-ing on every storefront route.
--
-- SCOPE / HONESTY
-- ---------------
-- This DDL is copied VERBATIM from the deployed database (pg_dump --schema-only
-- --no-owner), INCLUDING its GRANTS, so a fresh stack reproduces the deployed
-- read/write posture exactly rather than an approximation. It moves a fresh
-- stack TOWARD the deployed schema, never away from it.
--
-- It is applied BEST-EFFORT (soft) — the same policy as the migration chain:
-- every statement is attempted, and any that fail (e.g. an RLS policy
-- referencing a function that is itself production-only) are counted and
-- printed as [prod-parity], never fatal. The CREATE TABLE + GRANT statements
-- carry no dependency on production-only functions (only gen_random_uuid() and
-- auth.users, both present), so the TABLES the app reads always land; only
-- optional policies degrade. The schema assertion block in
-- scripts/e2e-seven-templates-ci.sh hard-verifies the tables the lane needs.
--
-- The three relations created by the HARD parity step (migration/e2e-schema-parity
-- .sql: nav_menus, nav_menu_items, url_redirects) are intentionally NOT
-- duplicated here.
--
-- This does NOT close the overall schema/production drift — see report.md §9.5.

CREATE TABLE public.abuse_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id text NOT NULL,
    tenant_id uuid NOT NULL,
    reported_by_email text NOT NULL,
    reported_by_role text DEFAULT 'customer'::text NOT NULL,
    reason text DEFAULT 'spam'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT abuse_reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'reviewed'::text, 'ignored'::text, 'blocked'::text])))
);
CREATE TABLE public.api_key_abuse_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    api_key_id uuid NOT NULL,
    company_id uuid NOT NULL,
    action text NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT api_key_abuse_log_action_check CHECK ((action = ANY (ARRAY['review'::text, 'suspended'::text, 'banned'::text])))
);
CREATE TABLE public.api_key_usage (
    id bigint NOT NULL,
    api_key_id uuid NOT NULL,
    company_id uuid NOT NULL,
    endpoint text NOT NULL,
    method text NOT NULL,
    status_code integer NOT NULL,
    request_id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE public.api_key_usage_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.api_key_usage_id_seq OWNED BY public.api_key_usage.id;
CREATE TABLE public.appointees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    name text NOT NULL,
    phone_number_id uuid,
    email text,
    relation text,
    confirmed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.article_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    article_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    revision_num integer NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    target_type text,
    target_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.backup_health_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tier text DEFAULT 'tier_1'::text NOT NULL,
    rpo_target_seconds integer DEFAULT 900 NOT NULL,
    rto_target_seconds integer DEFAULT 3600 NOT NULL,
    max_backup_age_alert_seconds integer DEFAULT 1800 NOT NULL,
    wal_gap_alert_seconds integer DEFAULT 300 NOT NULL,
    alert_channel text DEFAULT 'alertmanager'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.backup_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stamp text NOT NULL,
    status text NOT NULL,
    bytes bigint DEFAULT 0 NOT NULL,
    sha256 text NOT NULL,
    object_key text,
    destinations jsonb DEFAULT '[]'::jsonb NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT backup_runs_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'partial'::text, 'failed'::text])))
);
CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    service_id uuid,
    staff_id uuid,
    customer_name text NOT NULL,
    customer_email text,
    customer_phone text,
    notes text,
    scheduled_at timestamp with time zone NOT NULL,
    status public.booking_status DEFAULT 'pending'::public.booking_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    party_size integer DEFAULT 1 NOT NULL,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    google_event_id text,
    google_calendar_id text,
    location_id uuid,
    recurrence_parent_id uuid,
    recurrence_index integer,
    management_token uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_provider text,
    meeting_url text,
    meeting_id text,
    customer_account_id uuid,
    assigned_staff_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    question_answers jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE public.builder_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    company_id uuid,
    site_id uuid,
    kind text NOT NULL,
    name text NOT NULL,
    slug text,
    status text DEFAULT 'draft'::text NOT NULL,
    current_version_id uuid,
    published_version_id uuid,
    thumbnail_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT builder_documents_kind_check CHECK ((kind = ANY (ARRAY['tenant_page'::text, 'site_page'::text, 'cms_post'::text, 'standalone'::text, 'blog_archive'::text]))),
    CONSTRAINT builder_documents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);
CREATE TABLE public.builder_sites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    company_id uuid,
    slug text NOT NULL,
    name text NOT NULL,
    theme jsonb DEFAULT '{}'::jsonb NOT NULL,
    nav jsonb DEFAULT '[]'::jsonb NOT NULL,
    footer jsonb DEFAULT '{}'::jsonb NOT NULL,
    home_document_id uuid,
    is_published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    theme_synced_from_company_at timestamp with time zone
);
CREATE TABLE public.builder_template_seo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    template text NOT NULL,
    seo_title text,
    seo_description text,
    og_image text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.builder_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid,
    name text NOT NULL,
    kind text NOT NULL,
    category text,
    tree jsonb NOT NULL,
    thumbnail_url text,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT builder_templates_kind_check CHECK ((kind = ANY (ARRAY['section'::text, 'page'::text, 'block'::text])))
);
CREATE TABLE public.builder_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    version_number integer NOT NULL,
    tree jsonb DEFAULT '{"sections": []}'::jsonb NOT NULL,
    label text,
    kind text DEFAULT 'manual'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT builder_versions_kind_check CHECK ((kind = ANY (ARRAY['auto'::text, 'manual'::text, 'publish'::text])))
);
CREATE TABLE public.carding_velocity_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    max_attempts_per_ip_24h integer DEFAULT 15 NOT NULL,
    max_small_value_per_hour integer DEFAULT 8 NOT NULL,
    low_value_threshold_cents integer DEFAULT 500 NOT NULL,
    max_emails_per_ip_24h integer DEFAULT 10 NOT NULL,
    captcha_after_first_attempt boolean DEFAULT true NOT NULL,
    captcha_window_sec integer DEFAULT 900 NOT NULL,
    auto_refund_carding_blocked boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.checkout_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    tenant_id uuid NOT NULL,
    service_id uuid,
    step text DEFAULT 'started'::text NOT NULL,
    last_path text,
    customer_email text,
    amount_cents integer,
    abandoned_at timestamp with time zone,
    completed_at timestamp with time zone,
    booking_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.cms_post_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    version_number integer NOT NULL,
    snapshot jsonb NOT NULL,
    change_note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.cms_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind public.cms_kind NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    excerpt text,
    body_md text DEFAULT ''::text NOT NULL,
    cover_url text,
    seo_title text,
    seo_description text,
    published boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    author_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.cms_regen_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger text NOT NULL,
    post_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    tagline text,
    description text,
    logo_url text,
    hero_image_url text,
    accent_color text DEFAULT '#af3003'::text,
    phone text,
    email text,
    address text,
    is_published boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    secondary_color text,
    font_heading text,
    font_body text,
    custom_css text,
    custom_domain text,
    template_key text DEFAULT 'editorial'::text NOT NULL,
    notify_email_enabled boolean DEFAULT true NOT NULL,
    notify_sms_enabled boolean DEFAULT false NOT NULL,
    notify_whatsapp_enabled boolean DEFAULT false NOT NULL,
    notify_from_email text,
    notify_from_name text,
    resend_api_key text,
    twilio_account_sid text,
    twilio_auth_token text,
    twilio_from_number text,
    ultramsg_instance_id text,
    ultramsg_token text,
    reminder_hours_before integer DEFAULT 24 NOT NULL,
    is_suspended boolean DEFAULT false NOT NULL,
    suspended_at timestamp with time zone,
    suspended_reason text,
    custom_domain_verify_token text,
    custom_domain_verified_at timestamp with time zone,
    custom_domain_status text,
    custom_domain_last_checked_at timestamp with time zone,
    custom_domain_check_attempts integer DEFAULT 0,
    reminder_sms_enabled boolean DEFAULT true NOT NULL,
    reminder_employee_enabled boolean DEFAULT true NOT NULL,
    reminder_appointee_enabled boolean DEFAULT true NOT NULL,
    telephony_enabled boolean DEFAULT false NOT NULL,
    is_super_admin boolean DEFAULT false NOT NULL,
    CONSTRAINT companies_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'::text))
);
CREATE TABLE public.company_holidays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    holiday_date date NOT NULL,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.company_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'staff'::public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.company_secrets (
    company_id uuid NOT NULL,
    resend_api_key text,
    twilio_account_sid text,
    twilio_auth_token text,
    twilio_from_number text,
    ultramsg_instance_id text,
    ultramsg_token text,
    stripe_secret_key text,
    stripe_webhook_secret text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    encrypted_resend_api_key text,
    encrypted_twilio_auth_token text,
    encrypted_ultramsg_token text,
    encrypted_stripe_secret_key text,
    encrypted_stripe_webhook_secret text
);
CREATE TABLE public.company_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    mfa_required boolean DEFAULT false NOT NULL,
    email_verification_required boolean DEFAULT false NOT NULL,
    invite_token_ttl_hours integer DEFAULT 72 NOT NULL,
    invite_daily_ceiling integer DEFAULT 20 NOT NULL,
    session_absolute_ttl_days integer DEFAULT 30 NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.custom_role_permissions (
    custom_role_id uuid NOT NULL,
    permission_key text NOT NULL
);
CREATE TABLE public.custom_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.customer_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    email text NOT NULL,
    display_name text,
    phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.customer_webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid NOT NULL,
    company_id uuid NOT NULL,
    event text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    status_code integer,
    latency_ms integer,
    attempts integer DEFAULT 0 NOT NULL,
    error text,
    next_retry_at timestamp with time zone,
    delivered_at timestamp with time zone,
    dead_lettered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.customer_webhook_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    url text NOT NULL,
    secret text,
    kind text DEFAULT 'generic'::text NOT NULL,
    events text[] DEFAULT '{}'::text[] NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    auto_disabled boolean DEFAULT false NOT NULL,
    last_delivery_status text,
    last_delivery_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.domain_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    domain text,
    outcome text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.drill_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    drill_type text DEFAULT 'weekly'::text NOT NULL,
    tier text DEFAULT 'tier_1'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    duration_seconds integer,
    rto_target_seconds integer DEFAULT 3600 NOT NULL,
    rpo_target_seconds integer DEFAULT 900 NOT NULL,
    last_backup_age_seconds integer,
    wal_gap_seconds integer,
    tables_validated integer,
    validation_queries_passed integer,
    validation_queries_total integer,
    app_health_checks_passed integer,
    app_health_checks_total integer,
    environment text DEFAULT 'isolated'::text NOT NULL,
    operator text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.embed_allowlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    allowed_origin text,
    booking_slug text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.embed_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    booking_slug text NOT NULL,
    embedder_origin text NOT NULL,
    event_type text NOT NULL,
    visitor_utm_source text,
    visitor_utm_medium text,
    visitor_utm_campaign text,
    visitor_referrer text,
    visitor_user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT embed_analytics_event_type_check CHECK ((event_type = ANY (ARRAY['view'::text, 'start'::text, 'complete'::text])))
);
CREATE TABLE public.erasure_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    request_type text NOT NULL,
    subject_email text,
    subject_id text,
    status text DEFAULT 'requested'::text NOT NULL,
    confirm_token text,
    confirm_token_expiry timestamp with time zone,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    completed_at timestamp with time zone,
    rows_affected integer DEFAULT 0 NOT NULL,
    tables_touched text DEFAULT '[]'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT erasure_requests_request_type_check CHECK ((request_type = ANY (ARRAY['customer_erasure'::text, 'tenant_deletion'::text, 'retention_prune'::text]))),
    CONSTRAINT erasure_requests_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'confirmed'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'expired'::text])))
);
CREATE TABLE public.experiments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    description text,
    enabled boolean DEFAULT true NOT NULL,
    variants jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    merchant_id uuid,
    name text,
    hypothesis text,
    surface text DEFAULT ''::text,
    status text DEFAULT 'draft'::text,
    traffic_pct integer DEFAULT 100,
    started_at timestamp with time zone,
    stopped_at timestamp with time zone
);
CREATE TABLE public.external_calendar_feeds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    label text NOT NULL,
    kind text DEFAULT 'ical'::text NOT NULL,
    url text NOT NULL,
    username text,
    password text,
    etag text,
    busy_blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    sync_status text DEFAULT 'idle'::text NOT NULL,
    last_sync_at timestamp with time zone,
    last_sync_error text,
    last_event_count integer DEFAULT 0 NOT NULL,
    writable boolean DEFAULT false NOT NULL,
    caldav_home text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT external_calendar_feeds_kind_check CHECK ((kind = ANY (ARRAY['ical'::text, 'caldav'::text])))
);
CREATE TABLE public.feature_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    key text NOT NULL,
    value jsonb DEFAULT 'true'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.followup_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    kind text NOT NULL,
    ref_booking_id uuid,
    ref_staff_id uuid,
    title text NOT NULL,
    description text,
    assignee_staff_id uuid,
    priority integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    due_at timestamp with time zone,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT followup_tasks_kind_check CHECK ((kind = ANY (ARRAY['noshow_recovery'::text, 'rebook_declined'::text, 'first_visit_welcome'::text, 'confirm_pending'::text, 'review_request'::text, 'general'::text]))),
    CONSTRAINT followup_tasks_priority_check CHECK (((priority >= 0) AND (priority <= 3))),
    CONSTRAINT followup_tasks_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'closed'::text, 'cancelled'::text])))
);
CREATE TABLE public.forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    schema jsonb DEFAULT '{"fields": []}'::jsonb NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    submission_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.gallery_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title text,
    caption text,
    image_url text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.inbound_webhook_events (
    provider text NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    payload_sha256 text NOT NULL,
    status text DEFAULT 'processing'::text NOT NULL,
    attempts integer DEFAULT 1 NOT NULL,
    processing_started_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    failed_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inbound_webhook_events_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'processed'::text, 'failed'::text])))
);
CREATE TABLE public.integration_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    provider text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.integration_health_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    integration_id text NOT NULL,
    provider text NOT NULL,
    status text DEFAULT 'unknown'::text NOT NULL,
    last_check_at timestamp with time zone,
    last_success_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    consecutive_failures integer DEFAULT 0,
    consecutive_successes integer DEFAULT 0,
    circuit_state text DEFAULT 'closed'::text,
    circuit_opened_at timestamp with time zone,
    degradation_message text,
    recommended_action text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT integration_health_status_circuit_state_check CHECK ((circuit_state = ANY (ARRAY['closed'::text, 'open'::text, 'half_open'::text]))),
    CONSTRAINT integration_health_status_status_check CHECK ((status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'auth_expired'::text, 'rate_limited'::text, 'upstream_outage'::text, 'connectivity_error'::text, 'unknown'::text])))
);
CREATE TABLE public.integration_probes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    connection_id uuid NOT NULL,
    status text NOT NULL,
    latency_ms integer,
    error_message text,
    probed_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.invite_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    token_hash text NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    single_use boolean DEFAULT true NOT NULL,
    consumed boolean DEFAULT false NOT NULL,
    consumed_at timestamp with time zone,
    revoked boolean DEFAULT false NOT NULL,
    revoked_at timestamp with time zone,
    issued_by uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.job_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    queue text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    run_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    address text,
    phone text,
    timezone text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.marketing_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text,
    source text DEFAULT 'landing'::text,
    page text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    referrer text,
    user_agent text,
    ip text,
    consent_marketing boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.marketplace_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_merchant_id uuid NOT NULL,
    amount_minor bigint DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    reference text,
    reason text,
    settled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    host_staff_id uuid,
    created_by uuid,
    title text NOT NULL,
    description text,
    scheduled_at timestamp with time zone NOT NULL,
    duration_minutes integer DEFAULT 30 NOT NULL,
    provider text DEFAULT 'manual'::text NOT NULL,
    join_url text,
    gcal_event_id text,
    gcal_calendar_id text,
    attendees jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.mfa_recovery_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.mfa_secrets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    secret text NOT NULL,
    active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    activated_at timestamp with time zone,
    deactivated_at timestamp with time zone
);
CREATE TABLE public.navigation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    label text NOT NULL,
    href text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    parent_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.newsletter_subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    email text NOT NULL,
    name text,
    source text DEFAULT 'website'::text,
    tags text[] DEFAULT '{}'::text[],
    status text DEFAULT 'subscribed'::text NOT NULL,
    confirmed_at timestamp with time zone,
    unsubscribed_at timestamp with time zone,
    unsubscribe_token uuid DEFAULT gen_random_uuid() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.notification_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    booking_id uuid,
    event_key text NOT NULL,
    channel text NOT NULL,
    recipient text NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.notification_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    event_key text NOT NULL,
    channel text NOT NULL,
    subject text,
    body text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT notification_templates_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'whatsapp'::text]))),
    CONSTRAINT notification_templates_event_key_check CHECK ((event_key = ANY (ARRAY['booking_confirmed'::text, 'booking_reminder'::text, 'booking_cancelled'::text, 'staff_notify'::text])))
);
CREATE TABLE public.oauth_state (
    state text NOT NULL,
    user_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.oauth_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_app_id uuid NOT NULL,
    access_token_hash text NOT NULL,
    refresh_token_hash text,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.observability_prune_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ran_at timestamp with time zone DEFAULT now() NOT NULL,
    analytics_deleted bigint DEFAULT 0 NOT NULL,
    errors_deleted bigint DEFAULT 0 NOT NULL,
    notifications_deleted bigint DEFAULT 0 NOT NULL,
    duration_ms integer DEFAULT 0 NOT NULL,
    ok boolean DEFAULT true NOT NULL,
    error text
);
CREATE TABLE public.outbound_webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    events text[] DEFAULT '{}'::text[] NOT NULL,
    secret text,
    headers jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    kind text DEFAULT 'generic'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outbound_webhooks_kind_check CHECK ((kind = ANY (ARRAY['generic'::text, 'zapier'::text, 'make'::text, 'n8n'::text, 'hubspot'::text, 'salesforce'::text, 'slack'::text])))
);
CREATE TABLE public.page_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page_id uuid NOT NULL,
    title text NOT NULL,
    body jsonb DEFAULT '{}'::jsonb NOT NULL,
    revision_num integer NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.page_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page_id uuid NOT NULL,
    version_no integer NOT NULL,
    blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    seo jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    note text
);
CREATE TABLE public.pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    published_version_id uuid,
    seo jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_version_id uuid,
    scheduled_for timestamp with time zone,
    published_at timestamp with time zone,
    CONSTRAINT pages_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);
CREATE TABLE public.partner_abuse_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_app_id uuid NOT NULL,
    trigger text NOT NULL,
    severity text DEFAULT 'low'::text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    resolution_note text,
    reviewed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT partner_abuse_queue_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT partner_abuse_queue_status_check CHECK ((status = ANY (ARRAY['open'::text, 'reviewing'::text, 'resolved'::text, 'dismissed'::text])))
);
CREATE TABLE public.partner_apps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret_hash text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    redirect_uris text[] DEFAULT '{}'::text[] NOT NULL,
    webhook_url text,
    webhook_secret_hash text,
    status text DEFAULT 'draft'::text NOT NULL,
    daily_quota integer DEFAULT 10000 NOT NULL,
    daily_requests_used integer DEFAULT 0 NOT NULL,
    quota_reset_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT partner_apps_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text, 'revoked'::text])))
);
CREATE TABLE public.partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    website text DEFAULT ''::text NOT NULL,
    contact_email text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    tier text DEFAULT 'standard'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT partners_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text, 'revoked'::text]))),
    CONSTRAINT partners_tier_check CHECK ((tier = ANY (ARRAY['standard'::text, 'premium'::text, 'enterprise'::text])))
);
CREATE TABLE public.payment_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    provider text NOT NULL,
    mode text DEFAULT 'platform'::text NOT NULL,
    account_id text,
    credentials jsonb DEFAULT '{}'::jsonb NOT NULL,
    commission_bps integer,
    commission_flat_cents integer,
    charges_enabled boolean DEFAULT false NOT NULL,
    payouts_enabled boolean DEFAULT false NOT NULL,
    details_submitted boolean DEFAULT false NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_accounts_mode_check CHECK ((mode = ANY (ARRAY['platform'::text, 'byo'::text]))),
    CONSTRAINT payment_accounts_provider_check CHECK ((provider = ANY (ARRAY['stripe'::text, 'paypal'::text, 'twocheckout'::text, 'authorizenet'::text])))
);
CREATE TABLE public.payment_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    booking_id uuid,
    payment_intent_id text,
    charge_id text,
    customer_email text,
    customer_ip text,
    card_last4 text,
    card_brand text,
    card_fingerprint text,
    outcome text DEFAULT 'unknown'::text NOT NULL,
    decline_code text,
    amount_cents integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    is_low_value boolean DEFAULT false NOT NULL,
    session_id text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_attempts_outcome_check CHECK ((outcome = ANY (ARRAY['succeeded'::text, 'failed'::text, 'declined'::text, 'generic_decline'::text, 'expired_card'::text, 'carding_velocity_blocked'::text])))
);
CREATE TABLE public.payment_disputes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    booking_id uuid,
    stripe_dispute_id text,
    stripe_charge_id text,
    payment_intent_id text,
    reason text,
    status text DEFAULT 'needs_response'::text NOT NULL,
    amount_cents integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    customer_email text,
    evidence_due_by timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolution text,
    CONSTRAINT payment_disputes_status_check CHECK ((status = ANY (ARRAY['needs_response'::text, 'under_review'::text, 'won'::text, 'lost'::text, 'warning_needs_response'::text, 'warning_closed'::text])))
);
CREATE TABLE public.payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    provider_key text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.permissions (
    key text NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.phone_numbers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    owner_type text NOT NULL,
    owner_id uuid NOT NULL,
    e164 text NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    consent_sms boolean DEFAULT false NOT NULL,
    consent_voice boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT phone_numbers_owner_type_check CHECK ((owner_type = ANY (ARRAY['customer'::text, 'staff'::text, 'appointee'::text, 'contact'::text])))
);
CREATE TABLE public.plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    price_cents integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    billing_interval text DEFAULT 'month'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    highlight boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    trial_days integer DEFAULT 14,
    max_staff integer DEFAULT 1,
    max_services integer DEFAULT 3,
    max_pages integer DEFAULT 0,
    max_storage_mb integer DEFAULT 100,
    max_bookings_per_month integer DEFAULT 50,
    allow_custom_domain boolean DEFAULT false NOT NULL,
    allow_remove_branding boolean DEFAULT false NOT NULL,
    allow_white_label boolean DEFAULT false NOT NULL,
    allow_priority_support boolean DEFAULT false NOT NULL,
    features jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_roles_enabled boolean DEFAULT false,
    max_customers integer,
    max_branches integer,
    max_blog_posts integer,
    max_newsletter_subscribers integer,
    media_storage_mb integer,
    stripe_price_id text,
    max_forms integer,
    max_locations integer,
    max_submissions_per_month integer,
    max_custom_domains integer DEFAULT 1 NOT NULL,
    domain_addon_price_cents integer DEFAULT 0 NOT NULL,
    CONSTRAINT plans_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['month'::text, 'year'::text])))
);
CREATE TABLE public.platform_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    level text DEFAULT 'error'::text NOT NULL,
    source text DEFAULT 'client'::text NOT NULL,
    message text NOT NULL,
    stack text,
    url text,
    user_id uuid,
    company_id uuid,
    context jsonb
);
CREATE TABLE public.platform_observability (
    id boolean DEFAULT true NOT NULL,
    sentry_dsn text,
    sentry_org_slug text,
    sentry_project_slug text,
    sentry_environment text DEFAULT 'production'::text,
    sentry_traces_sample_rate numeric DEFAULT 0.1,
    grafana_url text,
    grafana_dashboard_url text,
    prometheus_url text,
    prometheus_pushgateway_url text,
    prometheus_scrape_token text,
    tracking_enabled boolean DEFAULT false NOT NULL,
    gtm_container_id text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT platform_observability_id_check CHECK ((id = true))
);
CREATE TABLE public.platform_payment_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    commission_bps integer DEFAULT 500 NOT NULL,
    commission_flat_cents integer DEFAULT 0 NOT NULL,
    min_fee_cents integer DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_payment_settings_provider_check CHECK ((provider = ANY (ARRAY['stripe'::text, 'paypal'::text, 'twocheckout'::text, 'authorizenet'::text])))
);
CREATE TABLE public.platform_settings (
    key text NOT NULL,
    value text,
    is_secret boolean DEFAULT false NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    description text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.platform_snapshot_restores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone
);
CREATE TABLE public.platform_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    snapshot_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone
);
CREATE TABLE public.rate_limits (
    bucket text NOT NULL,
    key text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    hits integer DEFAULT 0 NOT NULL
);
CREATE TABLE public.recovery_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone
);
CREATE TABLE public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    recipient_role text NOT NULL,
    recipient_phone_e164 text,
    recipient_email text,
    recipient_staff_id uuid,
    channel text NOT NULL,
    wave_key text NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    provider text DEFAULT 'none'::text NOT NULL,
    idempotency_key text NOT NULL,
    CONSTRAINT reminders_channel_check CHECK ((channel = ANY (ARRAY['sms'::text, 'whatsapp'::text, 'email'::text, 'voice'::text, 'in_app'::text]))),
    CONSTRAINT reminders_recipient_role_check CHECK ((recipient_role = ANY (ARRAY['customer'::text, 'appointee'::text, 'employee'::text]))),
    CONSTRAINT reminders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'suppressed'::text, 'cancelled'::text]))),
    CONSTRAINT reminders_wave_key_check CHECK ((wave_key = ANY (ARRAY['day_before'::text, 'two_hours'::text, 'booking_created'::text])))
);
CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    rating smallint NOT NULL,
    title text,
    body text,
    is_published boolean DEFAULT true NOT NULL,
    owner_reply text,
    owner_replied_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);
CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);
CREATE VIEW public.role_assignments_view AS
 SELECT ur.id,
    ur.user_id,
    ur.role,
    u.email,
    u.created_at AS user_created_at,
    (ur.id)::text AS role_assigned_at
   FROM (public.user_roles ur
     JOIN auth.users u ON ((u.id = ur.user_id)))
  ORDER BY ur.id DESC;
CREATE TABLE public.role_permissions (
    role public.app_role NOT NULL,
    permission_key text NOT NULL
);
CREATE TABLE public.routing_forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    routes jsonb DEFAULT '[]'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.routing_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    form_id uuid NOT NULL,
    company_id uuid NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    matched_service_id uuid,
    matched_staff_id uuid,
    booking_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.schema_migration_files (
    filename text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_ms integer DEFAULT 0 NOT NULL
);
CREATE TABLE public.security_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    event text NOT NULL,
    actor jsonb,
    severity smallint DEFAULT 1 NOT NULL,
    payload jsonb,
    ip inet,
    user_agent text,
    correlation uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    chain_hash text
);
CREATE TABLE public.seo_keywords (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    entity_type public.seo_entity_type,
    entity_id text,
    keyword text NOT NULL,
    last_position integer,
    last_checked timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.seo_not_found_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid,
    path text NOT NULL,
    referrer text,
    count integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.seo_redirects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    from_path text NOT NULL,
    to_path text NOT NULL,
    status_code integer DEFAULT 301 NOT NULL,
    hits integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.seo_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    site_name text,
    title_template text DEFAULT '%title% | %sitename%'::text,
    default_og_image text,
    twitter_handle text,
    organization_json jsonb,
    enable_breadcrumbs boolean DEFAULT true NOT NULL,
    enable_faq_schema boolean DEFAULT true NOT NULL,
    noindex_archives boolean DEFAULT false NOT NULL,
    auto_internal_links boolean DEFAULT false NOT NULL,
    allow_ai_bots boolean DEFAULT true NOT NULL,
    disallow_paths text[] DEFAULT ARRAY[]::text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    duration_minutes integer DEFAULT 30 NOT NULL,
    price_cents integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    buffer_before_min integer DEFAULT 0 NOT NULL,
    buffer_after_min integer DEFAULT 0 NOT NULL,
    capacity integer DEFAULT 1 NOT NULL,
    is_recurring boolean DEFAULT false NOT NULL,
    recurrence_rule text,
    cancellation_window_hours integer DEFAULT 24 NOT NULL,
    location_id uuid,
    is_event boolean DEFAULT false NOT NULL,
    event_start_at timestamp with time zone,
    event_end_at timestamp with time zone,
    max_party_size integer DEFAULT 1 NOT NULL,
    allow_group boolean DEFAULT false NOT NULL,
    min_notice_minutes integer DEFAULT 0 NOT NULL,
    booking_window_days integer DEFAULT 60 NOT NULL,
    booking_questions jsonb DEFAULT '[]'::jsonb NOT NULL,
    daily_booking_cap integer,
    weekly_booking_cap integer,
    assignment_mode text DEFAULT 'single'::text NOT NULL,
    assigned_staff_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    CONSTRAINT services_duration_minutes_check CHECK ((duration_minutes > 0)),
    CONSTRAINT services_price_cents_check CHECK ((price_cents >= 0))
);
CREATE TABLE public.sso_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    protocol text NOT NULL,
    saml_entity_id text,
    saml_sso_url text,
    saml_certificate text,
    saml_name_id_format text DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'::text,
    oidc_issuer text,
    oidc_client_id text,
    oidc_client_secret text,
    oidc_scopes text DEFAULT 'openid profile email'::text,
    domain_allowlist text[],
    attribute_mapping jsonb DEFAULT '{}'::jsonb,
    jit_provisioning boolean DEFAULT true NOT NULL,
    active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sso_configs_protocol_check CHECK ((protocol = ANY (ARRAY['saml2'::text, 'oidc'::text])))
);
CREATE TABLE public.staff_availability (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    weekday smallint NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_availability_check CHECK ((end_time > start_time)),
    CONSTRAINT staff_availability_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);
CREATE TABLE public.staff_calendar_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    company_id uuid NOT NULL,
    provider text DEFAULT 'google'::text NOT NULL,
    google_email text,
    calendar_id text DEFAULT 'primary'::text NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    token_expires_at timestamp with time zone,
    sync_token text,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sync_status text DEFAULT 'idle'::text NOT NULL,
    last_sync_error text,
    last_sync_event_count integer DEFAULT 0 NOT NULL
);
CREATE TABLE public.staff_hour_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    company_id uuid NOT NULL,
    override_date date NOT NULL,
    is_closed boolean DEFAULT false NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.staff_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid,
    display_name text NOT NULL,
    title text,
    bio text,
    avatar_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    location_id uuid
);
CREATE TABLE public.staff_time_off (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_time_off_check CHECK ((ends_at > starts_at))
);
CREATE TABLE public.step_up_confirmations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    confirmed_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.support_revision_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    conversation_id uuid,
    turn_ref text NOT NULL,
    original_reply text NOT NULL,
    revised_reply text NOT NULL,
    score_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    severity text DEFAULT 'low'::text NOT NULL,
    rubric_version text DEFAULT 'proper-v1'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewer text,
    reviewed_at timestamp with time zone,
    applied_action text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT support_revision_reviews_severity_check CHECK ((severity = ANY (ARRAY['none'::text, 'low'::text, 'severe'::text]))),
    CONSTRAINT support_revision_reviews_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'applied'::text])))
);
CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    contact_email text NOT NULL,
    subject text NOT NULL,
    message text NOT NULL,
    category public.support_ticket_category DEFAULT 'other'::public.support_ticket_category NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT '3'::text NOT NULL,
    assigned_to uuid,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    merchant_id uuid,
    body text,
    channel text DEFAULT 'widget'::text,
    order_id uuid,
    order_number text,
    requester_hash text,
    assignee_id uuid,
    conversation_id uuid,
    first_response_at timestamp with time zone,
    first_response_due_at timestamp with time zone,
    resolved_at timestamp with time zone,
    resolution_due_at timestamp with time zone,
    breach_first_response boolean DEFAULT false,
    breach_resolution boolean DEFAULT false
);
CREATE TABLE public.system_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_tag text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    requested_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    error text,
    previous_tag text,
    log text DEFAULT ''::text NOT NULL,
    progress jsonb DEFAULT '{}'::jsonb NOT NULL,
    kind text DEFAULT 'deploy'::text NOT NULL,
    CONSTRAINT system_updates_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'success'::text, 'failed'::text, 'rolled_back'::text])))
);
CREATE TABLE public.tenant_blocklists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    scope text NOT NULL,
    entry_type text NOT NULL,
    entry_value text NOT NULL,
    reason text DEFAULT 'abuse'::text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_blocklists_entry_type_check CHECK ((entry_type = ANY (ARRAY['email'::text, 'domain'::text]))),
    CONSTRAINT tenant_blocklists_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'org'::text])))
);
CREATE TABLE public.tenant_domains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    hostname public.citext NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    verification_method public.tenant_domain_verify_method DEFAULT 'txt'::public.tenant_domain_verify_method NOT NULL,
    verification_token text NOT NULL,
    status public.tenant_domain_status DEFAULT 'pending'::public.tenant_domain_status NOT NULL,
    last_checked_at timestamp with time zone,
    check_attempts integer DEFAULT 0 NOT NULL,
    cert_status public.tenant_domain_cert_status DEFAULT 'none'::public.tenant_domain_cert_status NOT NULL,
    cert_last_issued_at timestamp with time zone,
    cert_renews_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_domains_status_check CHECK ((status = ANY (ARRAY['pending'::public.tenant_domain_status, 'verifying'::public.tenant_domain_status, 'verified'::public.tenant_domain_status, 'failed'::public.tenant_domain_status, 'active'::public.tenant_domain_status, 'revoked'::public.tenant_domain_status])))
);
CREATE TABLE public.tenant_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    created_by uuid NOT NULL,
    assigned_to uuid,
    subject text NOT NULL,
    body text,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    customer_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.testimonials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote text NOT NULL,
    author_name text NOT NULL,
    author_role text,
    author_avatar_url text,
    rating integer DEFAULT 5 NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testimonials_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);
CREATE TABLE public.theme_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    merchant_id uuid NOT NULL,
    theme_key text NOT NULL,
    path text NOT NULL,
    content_type text NOT NULL,
    size_bytes integer DEFAULT 0 NOT NULL,
    data bytea,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    theme_id uuid,
    kind text,
    name text,
    content text,
    url text,
    bytes bigint DEFAULT 0,
    enabled boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.user_custom_roles (
    user_id uuid NOT NULL,
    custom_role_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid,
    ip text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_active_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    revoked_at timestamp with time zone
);
CREATE TABLE public.voice_call_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    call_role text NOT NULL,
    e164 text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    provider text DEFAULT 'qbx'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    next_attempt_at timestamp with time zone,
    last_error text,
    booking_reference text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT voice_call_schedules_call_role_check CHECK ((call_role = ANY (ARRAY['customer'::text, 'appointee'::text]))),
    CONSTRAINT voice_call_schedules_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'dispatched'::text, 'answered'::text, 'no_answer'::text, 'failed'::text, 'cancelled'::text])))
);
CREATE TABLE public.waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    service_id uuid NOT NULL,
    staff_id uuid,
    customer_name text NOT NULL,
    customer_email text NOT NULL,
    customer_phone text,
    preferred_from timestamp with time zone,
    preferred_to timestamp with time zone,
    status text DEFAULT 'waiting'::text NOT NULL,
    notified_at timestamp with time zone,
    notify_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT waitlist_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'notified'::text, 'booked'::text, 'expired'::text, 'cancelled'::text])))
);
CREATE TABLE public.wal_archive_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    last_archived_segment text DEFAULT '000000010000000000000001'::text NOT NULL,
    last_archived_at timestamp with time zone DEFAULT now() NOT NULL,
    gap_seconds integer DEFAULT 0 NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    alert_sent_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.wallet_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    booking_id uuid,
    kind text NOT NULL,
    amount_cents integer NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    description text,
    external_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text,
    gross_cents integer,
    platform_fee_cents integer DEFAULT 0 NOT NULL,
    net_to_tenant_cents integer,
    payout_id uuid,
    payout_status text DEFAULT 'unpaid'::text NOT NULL
);
CREATE TABLE public.webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_id uuid NOT NULL,
    event text NOT NULL,
    payload jsonb NOT NULL,
    status_code integer,
    response_body text,
    attempts integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp with time zone,
    delivered_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dead_lettered_at timestamp with time zone
);
CREATE TABLE public.workflow_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid NOT NULL,
    booking_id uuid,
    scheduled_for timestamp with time zone NOT NULL,
    sent_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workflow_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])))
);
CREATE TABLE public.workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    trigger text NOT NULL,
    offset_minutes integer DEFAULT 0 NOT NULL,
    channel text DEFAULT 'email'::text NOT NULL,
    subject text,
    body text NOT NULL,
    service_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workflows_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text]))),
    CONSTRAINT workflows_trigger_check CHECK ((trigger = ANY (ARRAY['booking_created'::text, 'before_booking'::text, 'after_booking'::text, 'no_show'::text, 'cancelled'::text])))
);
ALTER TABLE ONLY public.api_key_usage ALTER COLUMN id SET DEFAULT nextval('public.api_key_usage_id_seq'::regclass);
ALTER TABLE ONLY public.abuse_reports
    ADD CONSTRAINT abuse_reports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.api_key_abuse_log
    ADD CONSTRAINT api_key_abuse_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.api_key_usage
    ADD CONSTRAINT api_key_usage_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.appointees
    ADD CONSTRAINT appointees_booking_id_name_key UNIQUE (booking_id, name);
ALTER TABLE ONLY public.appointees
    ADD CONSTRAINT appointees_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.article_revisions
    ADD CONSTRAINT article_revisions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.backup_health_config
    ADD CONSTRAINT backup_health_config_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.backup_health_config
    ADD CONSTRAINT backup_health_config_tier_key UNIQUE (tier);
ALTER TABLE ONLY public.backup_runs
    ADD CONSTRAINT backup_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.builder_documents
    ADD CONSTRAINT builder_documents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.builder_sites
    ADD CONSTRAINT builder_sites_owner_id_slug_key UNIQUE (owner_id, slug);
ALTER TABLE ONLY public.builder_sites
    ADD CONSTRAINT builder_sites_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.builder_template_seo
    ADD CONSTRAINT builder_template_seo_merchant_id_template_key UNIQUE (merchant_id, template);
ALTER TABLE ONLY public.builder_template_seo
    ADD CONSTRAINT builder_template_seo_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.builder_templates
    ADD CONSTRAINT builder_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.builder_versions
    ADD CONSTRAINT builder_versions_document_id_version_number_key UNIQUE (document_id, version_number);
ALTER TABLE ONLY public.builder_versions
    ADD CONSTRAINT builder_versions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.carding_velocity_config
    ADD CONSTRAINT carding_velocity_config_company_id_key UNIQUE (company_id);
ALTER TABLE ONLY public.carding_velocity_config
    ADD CONSTRAINT carding_velocity_config_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.checkout_sessions
    ADD CONSTRAINT checkout_sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.cms_post_versions
    ADD CONSTRAINT cms_post_versions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.cms_post_versions
    ADD CONSTRAINT cms_post_versions_post_id_version_number_key UNIQUE (post_id, version_number);
ALTER TABLE ONLY public.cms_posts
    ADD CONSTRAINT cms_posts_kind_slug_key UNIQUE (kind, slug);
ALTER TABLE ONLY public.cms_posts
    ADD CONSTRAINT cms_posts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.cms_regen_jobs
    ADD CONSTRAINT cms_regen_jobs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_owner_id_key UNIQUE (owner_id);
ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.company_holidays
    ADD CONSTRAINT company_holidays_company_id_holiday_date_key UNIQUE (company_id, holiday_date);
ALTER TABLE ONLY public.company_holidays
    ADD CONSTRAINT company_holidays_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_company_id_user_id_key UNIQUE (company_id, user_id);
ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.company_secrets
    ADD CONSTRAINT company_secrets_pkey PRIMARY KEY (company_id);
ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_company_id_key UNIQUE (company_id);
ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.custom_role_permissions
    ADD CONSTRAINT custom_role_permissions_pkey PRIMARY KEY (custom_role_id, permission_key);
ALTER TABLE ONLY public.custom_roles
    ADD CONSTRAINT custom_roles_company_id_name_key UNIQUE (company_id, name);
ALTER TABLE ONLY public.custom_roles
    ADD CONSTRAINT custom_roles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customer_accounts
    ADD CONSTRAINT customer_accounts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customer_accounts
    ADD CONSTRAINT customer_accounts_user_id_company_id_key UNIQUE (user_id, company_id);
ALTER TABLE ONLY public.customer_webhook_deliveries
    ADD CONSTRAINT customer_webhook_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customer_webhook_subscriptions
    ADD CONSTRAINT customer_webhook_subscriptions_company_id_url_key UNIQUE (company_id, url);
ALTER TABLE ONLY public.customer_webhook_subscriptions
    ADD CONSTRAINT customer_webhook_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.domain_audit_log
    ADD CONSTRAINT domain_audit_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.drill_results
    ADD CONSTRAINT drill_results_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.embed_allowlist
    ADD CONSTRAINT embed_allowlist_company_id_allowed_origin_booking_slug_key UNIQUE (company_id, allowed_origin, booking_slug);
ALTER TABLE ONLY public.embed_allowlist
    ADD CONSTRAINT embed_allowlist_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.embed_analytics
    ADD CONSTRAINT embed_analytics_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.erasure_requests
    ADD CONSTRAINT erasure_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_key_key UNIQUE (key);
ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.external_calendar_feeds
    ADD CONSTRAINT external_calendar_feeds_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_company_id_key_key UNIQUE (company_id, key);
ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.followup_tasks
    ADD CONSTRAINT followup_tasks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_company_id_slug_key UNIQUE (company_id, slug);
ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.gallery_items
    ADD CONSTRAINT gallery_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.inbound_webhook_events
    ADD CONSTRAINT inbound_webhook_events_pkey PRIMARY KEY (provider, event_id);
ALTER TABLE ONLY public.integration_connections
    ADD CONSTRAINT integration_connections_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.integration_health_status
    ADD CONSTRAINT integration_health_status_company_id_integration_id_key UNIQUE (company_id, integration_id);
ALTER TABLE ONLY public.integration_health_status
    ADD CONSTRAINT integration_health_status_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.integration_probes
    ADD CONSTRAINT integration_probes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_company_id_email_key UNIQUE (company_id, email);
ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_company_id_token_hash_key UNIQUE (company_id, token_hash);
ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.job_queue
    ADD CONSTRAINT job_queue_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.marketing_leads
    ADD CONSTRAINT marketing_leads_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.marketplace_payouts
    ADD CONSTRAINT marketplace_payouts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.mfa_recovery_codes
    ADD CONSTRAINT mfa_recovery_codes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.mfa_secrets
    ADD CONSTRAINT mfa_secrets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.mfa_secrets
    ADD CONSTRAINT mfa_secrets_user_id_active_key UNIQUE (user_id, active);
ALTER TABLE ONLY public.navigation
    ADD CONSTRAINT navigation_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_company_id_email_key UNIQUE (company_id, email);
ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_booking_id_event_key_channel_key UNIQUE (booking_id, event_key, channel);
ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_company_id_event_key_channel_key UNIQUE (company_id, event_key, channel);
ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.oauth_state
    ADD CONSTRAINT oauth_state_pkey PRIMARY KEY (state);
ALTER TABLE ONLY public.oauth_tokens
    ADD CONSTRAINT oauth_tokens_access_token_hash_key UNIQUE (access_token_hash);
ALTER TABLE ONLY public.oauth_tokens
    ADD CONSTRAINT oauth_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.observability_prune_log
    ADD CONSTRAINT observability_prune_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.outbound_webhooks
    ADD CONSTRAINT outbound_webhooks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.page_revisions
    ADD CONSTRAINT page_revisions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.page_versions
    ADD CONSTRAINT page_versions_page_id_version_no_key UNIQUE (page_id, version_no);
ALTER TABLE ONLY public.page_versions
    ADD CONSTRAINT page_versions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_company_id_slug_key UNIQUE (company_id, slug);
ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.partner_abuse_queue
    ADD CONSTRAINT partner_abuse_queue_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.partner_apps
    ADD CONSTRAINT partner_apps_client_id_key UNIQUE (client_id);
ALTER TABLE ONLY public.partner_apps
    ADD CONSTRAINT partner_apps_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_slug_key UNIQUE (slug);
ALTER TABLE ONLY public.payment_accounts
    ADD CONSTRAINT payment_accounts_company_id_provider_key UNIQUE (company_id, provider);
ALTER TABLE ONLY public.payment_accounts
    ADD CONSTRAINT payment_accounts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.payment_attempts
    ADD CONSTRAINT payment_attempts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.payment_disputes
    ADD CONSTRAINT payment_disputes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.payment_disputes
    ADD CONSTRAINT payment_disputes_stripe_dispute_id_key UNIQUE (stripe_dispute_id);
ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (key);
ALTER TABLE ONLY public.phone_numbers
    ADD CONSTRAINT phone_numbers_company_id_owner_type_owner_id_e164_key UNIQUE (company_id, owner_type, owner_id, e164);
ALTER TABLE ONLY public.phone_numbers
    ADD CONSTRAINT phone_numbers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_code_key UNIQUE (code);
ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.platform_errors
    ADD CONSTRAINT platform_errors_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.platform_observability
    ADD CONSTRAINT platform_observability_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.platform_payment_settings
    ADD CONSTRAINT platform_payment_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.platform_payment_settings
    ADD CONSTRAINT platform_payment_settings_provider_key UNIQUE (provider);
ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);
ALTER TABLE ONLY public.platform_snapshot_restores
    ADD CONSTRAINT platform_snapshot_restores_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.platform_snapshots
    ADD CONSTRAINT platform_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (bucket, key, window_start);
ALTER TABLE ONLY public.recovery_codes
    ADD CONSTRAINT recovery_codes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recovery_codes
    ADD CONSTRAINT recovery_codes_user_id_code_hash_key UNIQUE (user_id, code_hash);
ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_idempotency_key_key UNIQUE (idempotency_key);
ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_booking_id_key UNIQUE (booking_id);
ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role, permission_key);
ALTER TABLE ONLY public.routing_forms
    ADD CONSTRAINT routing_forms_company_id_slug_key UNIQUE (company_id, slug);
ALTER TABLE ONLY public.routing_forms
    ADD CONSTRAINT routing_forms_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.routing_submissions
    ADD CONSTRAINT routing_submissions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.schema_migration_files
    ADD CONSTRAINT schema_migration_files_pkey PRIMARY KEY (filename);
ALTER TABLE ONLY public.security_events
    ADD CONSTRAINT security_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.seo_keywords
    ADD CONSTRAINT seo_keywords_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.seo_not_found_log
    ADD CONSTRAINT seo_not_found_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.seo_redirects
    ADD CONSTRAINT seo_redirects_company_id_from_path_key UNIQUE (company_id, from_path);
ALTER TABLE ONLY public.seo_redirects
    ADD CONSTRAINT seo_redirects_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.seo_settings
    ADD CONSTRAINT seo_settings_company_id_key UNIQUE (company_id);
ALTER TABLE ONLY public.seo_settings
    ADD CONSTRAINT seo_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sso_configs
    ADD CONSTRAINT sso_configs_company_id_protocol_key UNIQUE (company_id, protocol);
ALTER TABLE ONLY public.sso_configs
    ADD CONSTRAINT sso_configs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.staff_availability
    ADD CONSTRAINT staff_availability_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.staff_calendar_connections
    ADD CONSTRAINT staff_calendar_connections_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.staff_calendar_connections
    ADD CONSTRAINT staff_calendar_connections_staff_id_provider_key UNIQUE (staff_id, provider);
ALTER TABLE ONLY public.staff_hour_overrides
    ADD CONSTRAINT staff_hour_overrides_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.staff_hour_overrides
    ADD CONSTRAINT staff_hour_overrides_staff_id_override_date_key UNIQUE (staff_id, override_date);
ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.staff_time_off
    ADD CONSTRAINT staff_time_off_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.step_up_confirmations
    ADD CONSTRAINT step_up_confirmations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.support_revision_reviews
    ADD CONSTRAINT support_revision_reviews_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.system_updates
    ADD CONSTRAINT system_updates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tenant_blocklists
    ADD CONSTRAINT tenant_blocklists_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tenant_domains
    ADD CONSTRAINT tenant_domains_hostname_key UNIQUE (hostname);
ALTER TABLE ONLY public.tenant_domains
    ADD CONSTRAINT tenant_domains_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tenant_tickets
    ADD CONSTRAINT tenant_tickets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.theme_assets
    ADD CONSTRAINT theme_assets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_custom_roles
    ADD CONSTRAINT user_custom_roles_pkey PRIMARY KEY (user_id, custom_role_id);
ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.voice_call_schedules
    ADD CONSTRAINT voice_call_schedules_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_notify_token_key UNIQUE (notify_token);
ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.wal_archive_state
    ADD CONSTRAINT wal_archive_state_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);
CREATE INDEX appointees_booking_idx ON public.appointees USING btree (booking_id);
CREATE INDEX backup_runs_created_at_idx ON public.backup_runs USING btree (created_at DESC);
CREATE INDEX bookings_company_scheduled_idx ON public.bookings USING btree (company_id, scheduled_at) WHERE (status <> 'cancelled'::public.booking_status);
CREATE INDEX bookings_company_time_idx ON public.bookings USING btree (company_id, scheduled_at);
CREATE INDEX checkout_sessions_session_idx ON public.checkout_sessions USING btree (session_id);
CREATE INDEX checkout_sessions_tenant_time_idx ON public.checkout_sessions USING btree (tenant_id, created_at DESC);
CREATE INDEX cms_post_versions_post_idx ON public.cms_post_versions USING btree (post_id, version_number DESC);
CREATE INDEX cms_posts_kind_published_idx ON public.cms_posts USING btree (kind, published, published_at DESC);
CREATE INDEX cms_regen_jobs_created_idx ON public.cms_regen_jobs USING btree (created_at DESC);
CREATE UNIQUE INDEX companies_custom_domain_unique ON public.companies USING btree (lower(custom_domain)) WHERE (custom_domain IS NOT NULL);
CREATE INDEX companies_slug_idx ON public.companies USING btree (slug);
CREATE INDEX domain_audit_log_company_idx ON public.domain_audit_log USING btree (company_id, created_at DESC);
CREATE INDEX embed_allowlist_company_idx ON public.embed_allowlist USING btree (company_id);
CREATE INDEX embed_allowlist_slug_idx ON public.embed_allowlist USING btree (company_id, booking_slug);
CREATE INDEX embed_analytics_company_slug_idx ON public.embed_analytics USING btree (company_id, booking_slug);
CREATE INDEX embed_analytics_created_idx ON public.embed_analytics USING btree (created_at DESC);
CREATE INDEX embed_analytics_event_idx ON public.embed_analytics USING btree (company_id, booking_slug, event_type);
CREATE INDEX embed_analytics_origin_idx ON public.embed_analytics USING btree (company_id, booking_slug, embedder_origin);
CREATE UNIQUE INDEX followup_task_uniq_key ON public.followup_tasks USING btree (company_id, kind, ref_booking_id);
CREATE INDEX followup_tasks_company_status_idx ON public.followup_tasks USING btree (company_id, status);
CREATE INDEX followup_tasks_due_idx ON public.followup_tasks USING btree (due_at) WHERE (status = 'open'::text);
CREATE INDEX idx_abuse_queue_partner_app ON public.partner_abuse_queue USING btree (partner_app_id);
CREATE INDEX idx_abuse_queue_severity ON public.partner_abuse_queue USING btree (severity);
CREATE INDEX idx_abuse_queue_status ON public.partner_abuse_queue USING btree (status);
CREATE INDEX idx_abuse_reports_by_tenant ON public.abuse_reports USING btree (tenant_id, status, created_at DESC);
CREATE INDEX idx_api_key_abuse_action ON public.api_key_abuse_log USING btree (action);
CREATE INDEX idx_api_key_abuse_api_key ON public.api_key_abuse_log USING btree (api_key_id);
CREATE INDEX idx_api_key_abuse_company ON public.api_key_abuse_log USING btree (company_id);
CREATE INDEX idx_api_key_usage_company_id ON public.api_key_usage USING btree (company_id);
CREATE INDEX idx_api_key_usage_created_at ON public.api_key_usage USING btree (created_at DESC);
CREATE INDEX idx_api_key_usage_key_id ON public.api_key_usage USING btree (api_key_id);
CREATE INDEX idx_blocklists_domain_lookup ON public.tenant_blocklists USING btree (lower(entry_value)) WHERE (entry_type = 'domain'::text);
CREATE INDEX idx_blocklists_email_lookup ON public.tenant_blocklists USING btree (lower(entry_value)) WHERE (entry_type = 'email'::text);
CREATE INDEX idx_builder_documents_owner ON public.builder_documents USING btree (owner_id);
CREATE INDEX idx_builder_documents_site ON public.builder_documents USING btree (site_id);
CREATE INDEX idx_builder_sites_owner ON public.builder_sites USING btree (owner_id);
CREATE INDEX idx_builder_versions_doc ON public.builder_versions USING btree (document_id, version_number DESC);
CREATE INDEX idx_cwh_deliveries_company ON public.customer_webhook_deliveries USING btree (company_id);
CREATE INDEX idx_cwh_deliveries_next_retry ON public.customer_webhook_deliveries USING btree (next_retry_at) WHERE (next_retry_at IS NOT NULL);
CREATE INDEX idx_cwh_deliveries_status ON public.customer_webhook_deliveries USING btree (status) WHERE (status = 'pending'::text);
CREATE INDEX idx_cwh_deliveries_sub ON public.customer_webhook_deliveries USING btree (subscription_id);
CREATE INDEX idx_cwh_subs_company ON public.customer_webhook_subscriptions USING btree (company_id);
CREATE INDEX idx_cwh_subs_enabled ON public.customer_webhook_subscriptions USING btree (enabled) WHERE (enabled = true);
CREATE INDEX idx_drill_results_started ON public.drill_results USING btree (started_at DESC);
CREATE INDEX idx_drill_results_status ON public.drill_results USING btree (status);
CREATE INDEX idx_drill_results_type_tier ON public.drill_results USING btree (drill_type, tier);
CREATE INDEX idx_ecf_staff ON public.external_calendar_feeds USING btree (staff_id);
CREATE INDEX idx_erasure_requests_status ON public.erasure_requests USING btree (status);
CREATE INDEX idx_erasure_requests_tenant ON public.erasure_requests USING btree (tenant_id);
CREATE INDEX idx_erasure_requests_token ON public.erasure_requests USING btree (confirm_token) WHERE (confirm_token IS NOT NULL);
CREATE INDEX idx_integration_health_circuit ON public.integration_health_status USING btree (circuit_state) WHERE (circuit_state <> 'closed'::text);
CREATE INDEX idx_integration_health_company ON public.integration_health_status USING btree (company_id);
CREATE INDEX idx_integration_health_status ON public.integration_health_status USING btree (status);
CREATE INDEX idx_invite_tokens_company_created ON public.invite_tokens USING btree (company_id, created_at DESC);
CREATE INDEX idx_invite_tokens_email ON public.invite_tokens USING btree (email);
CREATE INDEX idx_invite_tokens_unconsumed ON public.invite_tokens USING btree (company_id) WHERE ((consumed = false) AND (revoked = false));
CREATE INDEX idx_mfa_secrets_user_active ON public.mfa_secrets USING btree (user_id, active);
CREATE INDEX idx_newsletter_company ON public.newsletter_subscribers USING btree (company_id, status);
CREATE INDEX idx_newsletter_token ON public.newsletter_subscribers USING btree (unsubscribe_token);
CREATE INDEX idx_oauth_tokens_access_hash ON public.oauth_tokens USING btree (access_token_hash);
CREATE INDEX idx_oauth_tokens_partner_app ON public.oauth_tokens USING btree (partner_app_id);
CREATE INDEX idx_partner_apps_client_id ON public.partner_apps USING btree (client_id);
CREATE INDEX idx_partner_apps_partner_id ON public.partner_apps USING btree (partner_id);
CREATE INDEX idx_partner_apps_status ON public.partner_apps USING btree (status);
CREATE INDEX idx_payment_attempts_card_fingerprint ON public.payment_attempts USING btree (card_fingerprint, created_at DESC) WHERE (card_fingerprint IS NOT NULL);
CREATE INDEX idx_payment_attempts_company_created ON public.payment_attempts USING btree (company_id, created_at DESC);
CREATE INDEX idx_payment_attempts_customer_email ON public.payment_attempts USING btree (customer_email, created_at DESC);
CREATE INDEX idx_payment_attempts_customer_ip ON public.payment_attempts USING btree (customer_ip, created_at DESC);
CREATE INDEX idx_payment_disputes_company_created ON public.payment_disputes USING btree (company_id, created_at DESC);
CREATE INDEX idx_payment_disputes_status ON public.payment_disputes USING btree (company_id, status) WHERE (status = ANY (ARRAY['needs_response'::text, 'warning_needs_response'::text]));
CREATE INDEX idx_recovery_codes_user_unused ON public.recovery_codes USING btree (user_id, used) WHERE (used = false);
CREATE INDEX idx_revision_reviews_merchant_conv ON public.support_revision_reviews USING btree (merchant_id, conversation_id);
CREATE INDEX idx_revision_reviews_merchant_status ON public.support_revision_reviews USING btree (merchant_id, status, created_at DESC);
CREATE INDEX idx_security_events_correlation ON public.security_events USING btree (correlation) WHERE (correlation IS NOT NULL);
CREATE INDEX idx_security_events_event ON public.security_events USING btree (event);
CREATE INDEX idx_security_events_tenant_created ON public.security_events USING btree (tenant_id, created_at DESC);
CREATE INDEX idx_staff_hour_overrides_lookup ON public.staff_hour_overrides USING btree (staff_id, override_date);
CREATE INDEX idx_step_up_user ON public.step_up_confirmations USING btree (user_id, expires_at DESC);
CREATE INDEX idx_user_sessions_active ON public.user_sessions USING btree (user_id) WHERE (revoked = false);
CREATE INDEX idx_user_sessions_user ON public.user_sessions USING btree (user_id, created_at DESC);
CREATE INDEX idx_webhook_deliveries_next_retry ON public.webhook_deliveries USING btree (next_retry_at) WHERE ((next_retry_at IS NOT NULL) AND (dead_lettered_at IS NULL));
CREATE INDEX idx_webhook_deliveries_webhook_id ON public.webhook_deliveries USING btree (webhook_id);
CREATE INDEX job_queue_due_idx ON public.job_queue USING btree (queue, run_at) WHERE (completed_at IS NULL);
CREATE INDEX locations_company_id_idx ON public.locations USING btree (company_id);
CREATE INDEX marketing_leads_created_at_idx ON public.marketing_leads USING btree (created_at DESC);
CREATE INDEX marketing_leads_email_idx ON public.marketing_leads USING btree (email);
CREATE INDEX marketplace_payouts_seller_idx ON public.marketplace_payouts USING btree (seller_merchant_id);
CREATE INDEX meetings_company_time_idx ON public.meetings USING btree (company_id, scheduled_at DESC);
CREATE INDEX navigation_company_position_idx ON public.navigation USING btree (company_id, "position");
CREATE INDEX notification_log_booking_idx ON public.notification_log USING btree (booking_id);
CREATE INDEX observability_prune_log_ran_at_idx ON public.observability_prune_log USING btree (ran_at DESC);
CREATE INDEX page_versions_page_idx ON public.page_versions USING btree (page_id);
CREATE INDEX pages_company_idx ON public.pages USING btree (company_id);
CREATE INDEX pages_published_version_idx ON public.pages USING btree (published_version_id);
CREATE INDEX pages_status_idx ON public.pages USING btree (status) WHERE (status = 'published'::text);
CREATE INDEX payment_methods_merchant_idx ON public.payment_methods USING btree (merchant_id);
CREATE INDEX phone_numbers_company_idx ON public.phone_numbers USING btree (company_id);
CREATE INDEX phone_numbers_e164_idx ON public.phone_numbers USING btree (e164);
CREATE INDEX platform_errors_level_idx ON public.platform_errors USING btree (level);
CREATE INDEX platform_errors_occurred_at_idx ON public.platform_errors USING btree (occurred_at DESC);
CREATE INDEX reminders_booking_idx ON public.reminders USING btree (booking_id);
CREATE INDEX reminders_company_idx ON public.reminders USING btree (company_id);
CREATE INDEX reminders_due_idx ON public.reminders USING btree (scheduled_at) WHERE (status = 'pending'::text);
CREATE INDEX reviews_company_id_idx ON public.reviews USING btree (company_id);
CREATE INDEX reviews_customer_id_idx ON public.reviews USING btree (customer_id);
CREATE UNIQUE INDEX seo_settings_platform_singleton ON public.seo_settings USING btree (((company_id IS NULL))) WHERE (company_id IS NULL);
CREATE INDEX staff_availability_staff_idx ON public.staff_availability USING btree (staff_id, weekday);
CREATE INDEX support_tickets_status_idx ON public.support_tickets USING btree (status, created_at DESC);
CREATE INDEX support_tickets_user_idx ON public.support_tickets USING btree (user_id);
CREATE INDEX system_updates_status_idx ON public.system_updates USING btree (status, created_at) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));
CREATE UNIQUE INDEX tenant_blocklists_unique ON public.tenant_blocklists USING btree (tenant_id, scope, entry_type, lower(entry_value));
CREATE INDEX tenant_domains_company_idx ON public.tenant_domains USING btree (company_id);
CREATE INDEX tenant_domains_due_idx ON public.tenant_domains USING btree (status, check_attempts, last_checked_at NULLS FIRST);
CREATE UNIQUE INDEX tenant_domains_one_primary_per_company ON public.tenant_domains USING btree (company_id) WHERE is_primary;
CREATE INDEX tenant_domains_status_idx ON public.tenant_domains USING btree (status);
CREATE INDEX voice_call_schedules_due_idx ON public.voice_call_schedules USING btree (next_attempt_at) WHERE (status = 'scheduled'::text);
CREATE INDEX wallet_ledger_company_idx ON public.wallet_ledger USING btree (company_id, created_at DESC);
CREATE UNIQUE INDEX wallet_ledger_provider_kind_external_ref_uidx ON public.wallet_ledger USING btree (provider, kind, external_ref) WHERE (external_ref IS NOT NULL);
CREATE INDEX webhook_deliveries_retry_idx ON public.webhook_deliveries USING btree (next_retry_at) WHERE (delivered_at IS NULL);
CREATE INDEX workflow_runs_due_idx ON public.workflow_runs USING btree (status, scheduled_for) WHERE (status = 'pending'::text);
CREATE TRIGGER bookings_touch BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER checkout_sessions_touch BEFORE UPDATE ON public.checkout_sessions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER cms_posts_touch_updated_at BEFORE UPDATE ON public.cms_posts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER companies_touch BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER company_holidays_touch BEFORE UPDATE ON public.company_holidays FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER company_secrets_touch BEFORE UPDATE ON public.company_secrets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER erasure_requests_updated_at BEFORE UPDATE ON public.erasure_requests FOR EACH ROW EXECUTE FUNCTION public.update_erasure_requests_updated_at();
CREATE TRIGGER experiments_touch_updated_at BEFORE UPDATE ON public.experiments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER forms_touch BEFORE UPDATE ON public.forms FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER guard_super_admin_insert BEFORE INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.guard_super_admin_assignment();
CREATE TRIGGER guard_super_admin_update BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.guard_super_admin_update();
CREATE TRIGGER job_queue_touch_updated_at BEFORE UPDATE ON public.job_queue FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER locations_set_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER meetings_touch BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER navigation_touch_updated_at BEFORE UPDATE ON public.navigation FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER newsletter_touch_updated BEFORE UPDATE ON public.newsletter_subscribers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER outbound_webhooks_touch BEFORE UPDATE ON public.outbound_webhooks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER pages_touch_updated_at BEFORE UPDATE ON public.pages FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER payment_accounts_touch BEFORE UPDATE ON public.payment_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER platform_payment_settings_touch BEFORE UPDATE ON public.platform_payment_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER platform_settings_touch BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER reviews_set_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER routing_forms_touch BEFORE UPDATE ON public.routing_forms FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER seo_redirects_touch BEFORE UPDATE ON public.seo_redirects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER seo_settings_touch BEFORE UPDATE ON public.seo_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER services_touch BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER staff_availability_touch BEFORE UPDATE ON public.staff_availability FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER staff_time_off_touch BEFORE UPDATE ON public.staff_time_off FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER staff_touch BEFORE UPDATE ON public.staff_members FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER support_tickets_touch BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tenant_domains_force_pending BEFORE INSERT ON public.tenant_domains FOR EACH ROW EXECUTE FUNCTION public.tenant_domains_force_pending_insert();
CREATE TRIGGER tenant_domains_guard BEFORE UPDATE ON public.tenant_domains FOR EACH ROW EXECUTE FUNCTION public.tenant_domains_guard_privileged_columns();
CREATE TRIGGER tenant_domains_touch BEFORE UPDATE ON public.tenant_domains FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER tg_staff_hour_overrides_updated BEFORE UPDATE ON public.staff_hour_overrides FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_customer_accounts BEFORE UPDATE ON public.customer_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_feature_flags BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_notification_templates BEFORE UPDATE ON public.notification_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_plans BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_tenant_tickets BEFORE UPDATE ON public.tenant_tickets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_builder_documents_updated BEFORE UPDATE ON public.builder_documents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_builder_sites_updated BEFORE UPDATE ON public.builder_sites FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_builder_templates_updated BEFORE UPDATE ON public.builder_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_custom_roles_updated BEFORE UPDATE ON public.custom_roles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_ecf_updated_at BEFORE UPDATE ON public.external_calendar_feeds FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER waitlist_touch BEFORE UPDATE ON public.waitlist FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER workflows_touch BEFORE UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE ONLY public.api_key_abuse_log
    ADD CONSTRAINT api_key_abuse_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.api_key_usage
    ADD CONSTRAINT api_key_usage_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.appointees
    ADD CONSTRAINT appointees_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.appointees
    ADD CONSTRAINT appointees_phone_number_id_fkey FOREIGN KEY (phone_number_id) REFERENCES public.phone_numbers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_customer_account_id_fkey FOREIGN KEY (customer_account_id) REFERENCES public.customer_accounts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_recurrence_parent_id_fkey FOREIGN KEY (recurrence_parent_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.builder_documents
    ADD CONSTRAINT builder_documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.builder_documents
    ADD CONSTRAINT builder_documents_current_version_fk FOREIGN KEY (current_version_id) REFERENCES public.builder_versions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.builder_documents
    ADD CONSTRAINT builder_documents_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.builder_documents
    ADD CONSTRAINT builder_documents_published_version_fk FOREIGN KEY (published_version_id) REFERENCES public.builder_versions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.builder_documents
    ADD CONSTRAINT builder_documents_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.builder_sites(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.builder_sites
    ADD CONSTRAINT builder_sites_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.builder_sites
    ADD CONSTRAINT builder_sites_home_doc_fk FOREIGN KEY (home_document_id) REFERENCES public.builder_documents(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.builder_sites
    ADD CONSTRAINT builder_sites_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.builder_templates
    ADD CONSTRAINT builder_templates_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.builder_versions
    ADD CONSTRAINT builder_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.builder_versions
    ADD CONSTRAINT builder_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.builder_documents(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.carding_velocity_config
    ADD CONSTRAINT carding_velocity_config_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.checkout_sessions
    ADD CONSTRAINT checkout_sessions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.checkout_sessions
    ADD CONSTRAINT checkout_sessions_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.checkout_sessions
    ADD CONSTRAINT checkout_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.cms_post_versions
    ADD CONSTRAINT cms_post_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.cms_post_versions
    ADD CONSTRAINT cms_post_versions_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.cms_posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.cms_posts
    ADD CONSTRAINT cms_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.cms_regen_jobs
    ADD CONSTRAINT cms_regen_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.company_holidays
    ADD CONSTRAINT company_holidays_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.company_secrets
    ADD CONSTRAINT company_secrets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.custom_role_permissions
    ADD CONSTRAINT custom_role_permissions_custom_role_id_fkey FOREIGN KEY (custom_role_id) REFERENCES public.custom_roles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.custom_role_permissions
    ADD CONSTRAINT custom_role_permissions_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES public.permissions(key) ON DELETE CASCADE;
ALTER TABLE ONLY public.custom_roles
    ADD CONSTRAINT custom_roles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.custom_roles
    ADD CONSTRAINT custom_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.customer_accounts
    ADD CONSTRAINT customer_accounts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_accounts
    ADD CONSTRAINT customer_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_webhook_deliveries
    ADD CONSTRAINT customer_webhook_deliveries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_webhook_deliveries
    ADD CONSTRAINT customer_webhook_deliveries_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.customer_webhook_subscriptions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_webhook_subscriptions
    ADD CONSTRAINT customer_webhook_subscriptions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.domain_audit_log
    ADD CONSTRAINT domain_audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.embed_allowlist
    ADD CONSTRAINT embed_allowlist_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.embed_analytics
    ADD CONSTRAINT embed_analytics_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.experiments
    ADD CONSTRAINT experiments_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.external_calendar_feeds
    ADD CONSTRAINT external_calendar_feeds_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.external_calendar_feeds
    ADD CONSTRAINT external_calendar_feeds_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.followup_tasks
    ADD CONSTRAINT followup_tasks_assignee_staff_id_fkey FOREIGN KEY (assignee_staff_id) REFERENCES public.staff_members(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.followup_tasks
    ADD CONSTRAINT followup_tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.followup_tasks
    ADD CONSTRAINT followup_tasks_ref_booking_id_fkey FOREIGN KEY (ref_booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.followup_tasks
    ADD CONSTRAINT followup_tasks_ref_staff_id_fkey FOREIGN KEY (ref_staff_id) REFERENCES public.staff_members(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.gallery_items
    ADD CONSTRAINT gallery_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.integration_health_status
    ADD CONSTRAINT integration_health_status_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.invite_tokens
    ADD CONSTRAINT invite_tokens_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.marketplace_payouts
    ADD CONSTRAINT marketplace_payouts_seller_merchant_id_fkey FOREIGN KEY (seller_merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_host_staff_id_fkey FOREIGN KEY (host_staff_id) REFERENCES public.staff_members(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.mfa_secrets
    ADD CONSTRAINT mfa_secrets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.navigation
    ADD CONSTRAINT navigation_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.navigation
    ADD CONSTRAINT navigation_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.navigation(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.oauth_tokens
    ADD CONSTRAINT oauth_tokens_partner_app_id_fkey FOREIGN KEY (partner_app_id) REFERENCES public.partner_apps(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.outbound_webhooks
    ADD CONSTRAINT outbound_webhooks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.page_versions
    ADD CONSTRAINT page_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.page_versions
    ADD CONSTRAINT page_versions_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.pages(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_published_version_fk FOREIGN KEY (published_version_id) REFERENCES public.page_versions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.partner_abuse_queue
    ADD CONSTRAINT partner_abuse_queue_partner_app_id_fkey FOREIGN KEY (partner_app_id) REFERENCES public.partner_apps(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.partner_apps
    ADD CONSTRAINT partner_apps_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.payment_accounts
    ADD CONSTRAINT payment_accounts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.payment_attempts
    ADD CONSTRAINT payment_attempts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.payment_disputes
    ADD CONSTRAINT payment_disputes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.phone_numbers
    ADD CONSTRAINT phone_numbers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.platform_observability
    ADD CONSTRAINT platform_observability_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.recovery_codes
    ADD CONSTRAINT recovery_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_recipient_staff_id_fkey FOREIGN KEY (recipient_staff_id) REFERENCES public.staff_members(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES public.permissions(key) ON DELETE CASCADE;
ALTER TABLE ONLY public.routing_forms
    ADD CONSTRAINT routing_forms_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.routing_submissions
    ADD CONSTRAINT routing_submissions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.routing_submissions
    ADD CONSTRAINT routing_submissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.routing_submissions
    ADD CONSTRAINT routing_submissions_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.routing_forms(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.routing_submissions
    ADD CONSTRAINT routing_submissions_matched_service_id_fkey FOREIGN KEY (matched_service_id) REFERENCES public.services(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.routing_submissions
    ADD CONSTRAINT routing_submissions_matched_staff_id_fkey FOREIGN KEY (matched_staff_id) REFERENCES public.staff_members(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.seo_keywords
    ADD CONSTRAINT seo_keywords_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.seo_redirects
    ADD CONSTRAINT seo_redirects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.seo_settings
    ADD CONSTRAINT seo_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.sso_configs
    ADD CONSTRAINT sso_configs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.staff_availability
    ADD CONSTRAINT staff_availability_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.staff_calendar_connections
    ADD CONSTRAINT staff_calendar_connections_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.staff_calendar_connections
    ADD CONSTRAINT staff_calendar_connections_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.staff_hour_overrides
    ADD CONSTRAINT staff_hour_overrides_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.staff_hour_overrides
    ADD CONSTRAINT staff_hour_overrides_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.staff_time_off
    ADD CONSTRAINT staff_time_off_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.support_revision_reviews
    ADD CONSTRAINT support_revision_reviews_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.system_updates
    ADD CONSTRAINT system_updates_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.tenant_domains
    ADD CONSTRAINT tenant_domains_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tenant_tickets
    ADD CONSTRAINT tenant_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.tenant_tickets
    ADD CONSTRAINT tenant_tickets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tenant_tickets
    ADD CONSTRAINT tenant_tickets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.theme_assets
    ADD CONSTRAINT theme_assets_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.store_themes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_custom_roles
    ADD CONSTRAINT user_custom_roles_custom_role_id_fkey FOREIGN KEY (custom_role_id) REFERENCES public.custom_roles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_custom_roles
    ADD CONSTRAINT user_custom_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.voice_call_schedules
    ADD CONSTRAINT voice_call_schedules_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.voice_call_schedules
    ADD CONSTRAINT voice_call_schedules_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff_members(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES public.payouts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.outbound_webhooks(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;
CREATE POLICY "Active locations of published companies are viewable" ON public.locations FOR SELECT USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = locations.company_id) AND (c.is_published = true))))));
CREATE POLICY "Admins insert audit log" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Admins manage plans" ON public.plans TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Admins update all companies" ON public.companies FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Admins view all companies" ON public.companies FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Admins view audit log" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Admins view backup runs" ON public.backup_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Anyone can read enabled experiments" ON public.experiments FOR SELECT USING (((enabled = true) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "Anyone can submit a marketing lead" ON public.marketing_leads FOR INSERT TO authenticated, anon WITH CHECK (((email IS NOT NULL) AND (char_length(email) <= 320) AND (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)));
CREATE POLICY "Anyone can subscribe" ON public.newsletter_subscribers FOR INSERT TO authenticated, anon WITH CHECK (((company_id IS NOT NULL) AND (email IS NOT NULL) AND (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)));
CREATE POLICY "Company members can delete locations" ON public.locations FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.company_members cm
  WHERE ((cm.company_id = locations.company_id) AND (cm.user_id = auth.uid())))));
CREATE POLICY "Company members can delete subscribers" ON public.newsletter_subscribers FOR DELETE TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "Company members can insert locations" ON public.locations FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.company_members cm
  WHERE ((cm.company_id = locations.company_id) AND (cm.user_id = auth.uid())))));
CREATE POLICY "Company members can manage subscribers" ON public.newsletter_subscribers FOR UPDATE TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "Company members can update locations" ON public.locations FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.company_members cm
  WHERE ((cm.company_id = locations.company_id) AND (cm.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.company_members cm
  WHERE ((cm.company_id = locations.company_id) AND (cm.user_id = auth.uid())))));
CREATE POLICY "Company members can update reviews on their company" ON public.reviews FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.company_members cm
  WHERE ((cm.company_id = reviews.company_id) AND (cm.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.company_members cm
  WHERE ((cm.company_id = reviews.company_id) AND (cm.user_id = auth.uid())))));
CREATE POLICY "Company members can view subscribers" ON public.newsletter_subscribers FOR SELECT TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "Company members can view their company reviews" ON public.reviews FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.company_members cm
  WHERE ((cm.company_id = reviews.company_id) AND (cm.user_id = auth.uid())))));
CREATE POLICY "Company members can view their locations" ON public.locations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.company_members cm
  WHERE ((cm.company_id = locations.company_id) AND (cm.user_id = auth.uid())))));
CREATE POLICY "Company members manage staff overrides" ON public.staff_hour_overrides TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Customers can create a review for their booking" ON public.reviews FOR INSERT TO authenticated WITH CHECK (((customer_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.bookings b
  WHERE ((b.id = reviews.booking_id) AND (b.company_id = reviews.company_id) AND (lower(b.customer_email) = lower((auth.jwt() ->> 'email'::text))) AND (b.status = ANY (ARRAY['completed'::public.booking_status, 'confirmed'::public.booking_status])))))));
CREATE POLICY "Customers can delete their own review" ON public.reviews FOR DELETE TO authenticated USING ((customer_id = auth.uid()));
CREATE POLICY "Customers can update their own review" ON public.reviews FOR UPDATE TO authenticated USING ((customer_id = auth.uid())) WITH CHECK ((customer_id = auth.uid()));
CREATE POLICY "Customers can view their own reviews" ON public.reviews FOR SELECT TO authenticated USING ((customer_id = auth.uid()));
CREATE POLICY "Holidays readable for published companies" ON public.company_holidays FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = company_holidays.company_id) AND c.is_published))) OR public.is_company_member(company_id, auth.uid())));
CREATE POLICY "Members can delete holidays" ON public.company_holidays FOR DELETE TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Members can insert holidays" ON public.company_holidays FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Members can update holidays" ON public.company_holidays FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Members manage their company appointees" ON public.appointees TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.bookings b
  WHERE ((b.id = appointees.booking_id) AND public.is_company_member(b.company_id, auth.uid())))) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "Members manage their company follow-ups" ON public.followup_tasks TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "Members manage their company phone numbers" ON public.phone_numbers TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "Members manage time off" ON public.staff_time_off TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_members s
  WHERE ((s.id = staff_time_off.staff_id) AND public.is_company_member(s.company_id, auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_members s
  WHERE ((s.id = staff_time_off.staff_id) AND public.is_company_member(s.company_id, auth.uid())))));
CREATE POLICY "Members view their company call schedules" ON public.voice_call_schedules TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "Members view their company log" ON public.notification_log FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "Members view their company reminders" ON public.reminders FOR SELECT TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "Owners manage staff calendar connections" ON public.staff_calendar_connections TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = staff_calendar_connections.company_id) AND (c.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = staff_calendar_connections.company_id) AND (c.owner_id = auth.uid())))));
CREATE POLICY "Plans are public" ON public.plans FOR SELECT USING (true);
CREATE POLICY "Public can read published testimonials" ON public.testimonials FOR SELECT USING ((is_published = true));
CREATE POLICY "Public can read staff overrides for booking" ON public.staff_hour_overrides FOR SELECT USING (true);
CREATE POLICY "Public can resolve published companies by domain" ON public.companies FOR SELECT TO anon USING ((is_published = true));
CREATE POLICY "Published reviews are viewable by anyone" ON public.reviews FOR SELECT USING ((is_published = true));
CREATE POLICY "Super admin manages testimonials" ON public.testimonials TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Super admins can delete marketing leads" ON public.marketing_leads FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Super admins can read marketing leads" ON public.marketing_leads FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Super admins can view job queue" ON public.job_queue FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Super admins manage experiments" ON public.experiments TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Time off readable for published companies" ON public.staff_time_off FOR SELECT USING (((EXISTS ( SELECT 1
   FROM (public.staff_members s
     JOIN public.companies c ON ((c.id = s.company_id)))
  WHERE ((s.id = staff_time_off.staff_id) AND c.is_published))) OR (EXISTS ( SELECT 1
   FROM public.staff_members s
  WHERE ((s.id = staff_time_off.staff_id) AND public.is_company_member(s.company_id, auth.uid()))))));
CREATE POLICY abuse_queue_insert_system ON public.partner_abuse_queue FOR INSERT WITH CHECK (true);
CREATE POLICY abuse_queue_select_admin ON public.partner_abuse_queue FOR SELECT USING ((auth.uid() IN ( SELECT user_roles.user_id
   FROM public.user_roles
  WHERE (user_roles.role = 'super_admin'::public.app_role))));
CREATE POLICY abuse_queue_update_admin ON public.partner_abuse_queue FOR UPDATE USING ((auth.uid() IN ( SELECT user_roles.user_id
   FROM public.user_roles
  WHERE (user_roles.role = 'super_admin'::public.app_role))));
ALTER TABLE public.abuse_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY abuse_reports_super_admin ON public.abuse_reports TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admins manage tickets" ON public.support_tickets TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "anyone can create ticket" ON public.support_tickets FOR INSERT TO authenticated, anon WITH CHECK ((((auth.uid() IS NULL) AND (user_id IS NULL) AND (contact_email IS NOT NULL)) OR (user_id = auth.uid())));
CREATE POLICY "anyone can report errors" ON public.platform_errors FOR INSERT TO authenticated, anon WITH CHECK (((user_id IS NULL) OR (user_id = auth.uid())));
ALTER TABLE public.api_key_abuse_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_key_abuse_log: company members can read" ON public.api_key_abuse_log FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.company_members
  WHERE ((company_members.company_id = api_key_abuse_log.company_id) AND (company_members.user_id = auth.uid())))));
CREATE POLICY "api_key_abuse_log: only service role can insert" ON public.api_key_abuse_log FOR INSERT WITH CHECK (false);
ALTER TABLE public.appointees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY article_revisions_tenant ON public.article_revisions TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.articles a
  WHERE ((a.id = article_revisions.article_id) AND (public.is_merchant_member(a.merchant_id) OR public.is_platform_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.articles a
  WHERE ((a.id = article_revisions.article_id) AND (public.is_merchant_member(a.merchant_id) OR public.is_platform_admin())))));
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "availability owner manage" ON public.staff_availability TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.staff_members s
     JOIN public.companies c ON ((c.id = s.company_id)))
  WHERE ((s.id = staff_availability.staff_id) AND (c.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.staff_members s
     JOIN public.companies c ON ((c.id = s.company_id)))
  WHERE ((s.id = staff_availability.staff_id) AND (c.owner_id = auth.uid())))));
CREATE POLICY "availability public read" ON public.staff_availability FOR SELECT USING (true);
CREATE POLICY "availability self manage" ON public.staff_availability TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_members s
  WHERE ((s.id = staff_availability.staff_id) AND (s.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_members s
  WHERE ((s.id = staff_availability.staff_id) AND (s.user_id = auth.uid())))));
ALTER TABLE public.backup_health_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY backup_health_config_service_read ON public.backup_health_config FOR SELECT TO service_role USING (true);
CREATE POLICY backup_health_config_super_admin_all ON public.backup_health_config TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY blocklists_super_admin ON public.tenant_blocklists TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings anon create" ON public.bookings FOR INSERT TO authenticated, anon WITH CHECK (((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = bookings.company_id) AND c.is_published))) AND ((service_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.services s
  WHERE ((s.id = bookings.service_id) AND (s.company_id = bookings.company_id))))) AND ((staff_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.staff_members st
  WHERE ((st.id = bookings.staff_id) AND (st.company_id = bookings.company_id)))))));
CREATE POLICY "bookings company delete" ON public.bookings FOR DELETE TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "bookings company manage" ON public.bookings FOR UPDATE TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "bookings company read" ON public.bookings FOR SELECT TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "bookings staff read" ON public.bookings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_members s
  WHERE ((s.id = bookings.staff_id) AND (s.user_id = auth.uid())))));
CREATE POLICY "bookings staff update" ON public.bookings FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.staff_members s
  WHERE ((s.id = bookings.staff_id) AND (s.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.staff_members s
  WHERE ((s.id = bookings.staff_id) AND (s.user_id = auth.uid())))));
ALTER TABLE public.builder_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_template_seo ENABLE ROW LEVEL SECURITY;
CREATE POLICY builder_template_seo_public_read ON public.builder_template_seo FOR SELECT USING (true);
CREATE POLICY builder_template_seo_tenant_write ON public.builder_template_seo TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin())) WITH CHECK ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));
ALTER TABLE public.builder_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carding_velocity_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkout anon insert" ON public.checkout_sessions FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "checkout anon update by session" ON public.checkout_sessions FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "checkout tenant + super read" ON public.checkout_sessions FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.is_company_member(tenant_id, auth.uid())));
ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cms editors read all" ON public.cms_posts FOR SELECT TO authenticated USING (public.can_edit_cms(auth.uid()));
CREATE POLICY "cms editors write" ON public.cms_posts TO authenticated USING (public.can_edit_cms(auth.uid())) WITH CHECK (public.can_edit_cms(auth.uid()));
CREATE POLICY "cms public read published" ON public.cms_posts FOR SELECT USING ((published = true));
CREATE POLICY "cms versions read" ON public.cms_post_versions FOR SELECT TO authenticated USING (public.can_edit_cms(auth.uid()));
CREATE POLICY "cms versions write" ON public.cms_post_versions FOR INSERT TO authenticated WITH CHECK (public.can_edit_cms(auth.uid()));
ALTER TABLE public.cms_post_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_regen_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies owner delete" ON public.companies FOR DELETE TO authenticated USING (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "companies owner insert" ON public.companies FOR INSERT TO authenticated WITH CHECK ((auth.uid() = owner_id));
CREATE POLICY "companies owner update" ON public.companies FOR UPDATE TO authenticated USING (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "companies public read" ON public.companies FOR SELECT USING ((is_published OR (auth.uid() = owner_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crp managed by company owner" ON public.custom_role_permissions TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.custom_roles cr
     JOIN public.companies c ON ((c.id = cr.company_id)))
  WHERE ((cr.id = custom_role_permissions.custom_role_id) AND ((c.owner_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.custom_roles cr
     JOIN public.companies c ON ((c.id = cr.company_id)))
  WHERE ((cr.id = custom_role_permissions.custom_role_id) AND ((c.owner_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))))));
CREATE POLICY "crp read by company members" ON public.custom_role_permissions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.custom_roles cr
  WHERE ((cr.id = custom_role_permissions.custom_role_id) AND (public.is_company_member(cr.company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))))));
ALTER TABLE public.custom_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_roles managed by company owner" ON public.custom_roles TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = custom_roles.company_id) AND (c.owner_id = auth.uid())))) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = custom_roles.company_id) AND (c.owner_id = auth.uid())))) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "custom_roles read by company members" ON public.custom_roles FOR SELECT TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "customer manages own" ON public.customer_accounts TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "customer reads own" ON public.customer_accounts FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_company_member(company_id, auth.uid())));
CREATE POLICY "customer reads own bookings by email" ON public.bookings FOR SELECT TO authenticated USING ((customer_email = (auth.jwt() ->> 'email'::text)));
ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_webhook_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cwh_deliveries: company members can read" ON public.customer_webhook_deliveries FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.company_members
  WHERE ((company_members.company_id = customer_webhook_deliveries.company_id) AND (company_members.user_id = auth.uid())))));
CREATE POLICY "cwh_deliveries: service role only" ON public.customer_webhook_deliveries FOR INSERT WITH CHECK (false);
CREATE POLICY "cwh_subs: company members can read" ON public.customer_webhook_subscriptions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.company_members
  WHERE ((company_members.company_id = customer_webhook_subscriptions.company_id) AND (company_members.user_id = auth.uid())))));
CREATE POLICY "cwh_subs: service role only" ON public.customer_webhook_subscriptions FOR INSERT WITH CHECK (false);
CREATE POLICY "docs owner manage" ON public.builder_documents TO authenticated USING (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "docs public read published" ON public.builder_documents FOR SELECT USING (((status = 'published'::text) OR (auth.uid() = owner_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
ALTER TABLE public.domain_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drill_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY drill_results_anon_deny ON public.drill_results FOR SELECT TO anon USING (false);
CREATE POLICY drill_results_super_admin_all ON public.drill_results TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
ALTER TABLE public.embed_allowlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY embed_allowlist_read_members ON public.embed_allowlist FOR SELECT USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY embed_allowlist_write_service ON public.embed_allowlist USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
ALTER TABLE public.embed_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY embed_analytics_insert_anon ON public.embed_analytics FOR INSERT WITH CHECK (true);
CREATE POLICY embed_analytics_read_members ON public.embed_analytics FOR SELECT USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY embed_analytics_write_service ON public.embed_analytics USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));
ALTER TABLE public.erasure_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erasure_requests anon deny" ON public.erasure_requests FOR SELECT USING (false);
CREATE POLICY "erasure_requests super_admin only" ON public.erasure_requests USING ((EXISTS ( SELECT 1
   FROM (public.company_members cm
     JOIN public.companies c ON ((c.id = cm.company_id)))
  WHERE ((cm.user_id = auth.uid()) AND (c.is_super_admin = true)))));
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_calendar_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feature_flags member manage" ON public.feature_flags TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "feature_flags public read" ON public.feature_flags FOR SELECT USING (true);
CREATE POLICY "feeds: members delete" ON public.external_calendar_feeds FOR DELETE TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "feeds: members read" ON public.external_calendar_feeds FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "feeds: members update" ON public.external_calendar_feeds FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "feeds: members write" ON public.external_calendar_feeds FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));
ALTER TABLE public.followup_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forms members manage" ON public.forms TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "forms public read active" ON public.forms FOR SELECT USING ((is_active = true));
CREATE POLICY "gallery owner manage" ON public.gallery_items TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = gallery_items.company_id) AND (c.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = gallery_items.company_id) AND (c.owner_id = auth.uid())))));
CREATE POLICY "gallery public read" ON public.gallery_items FOR SELECT USING (true);
ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY integration_connections_tenant_read ON public.integration_connections FOR SELECT TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));
CREATE POLICY integration_health_insert ON public.integration_health_status FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = integration_health_status.company_id) AND ((companies.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.company_members
          WHERE ((company_members.company_id = companies.id) AND (company_members.user_id = auth.uid()) AND (company_members.role = ANY (ARRAY['admin'::public.app_role, 'owner'::public.app_role]))))))))));
ALTER TABLE public.integration_health_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY integration_health_update ON public.integration_health_status FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = integration_health_status.company_id) AND ((companies.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.company_members
          WHERE ((company_members.company_id = companies.id) AND (company_members.user_id = auth.uid()) AND (company_members.role = ANY (ARRAY['admin'::public.app_role, 'owner'::public.app_role]))))))))));
CREATE POLICY integration_health_view ON public.integration_health_status FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.company_members
  WHERE ((company_members.company_id = integration_health_status.company_id) AND (company_members.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.companies
  WHERE ((companies.id = integration_health_status.company_id) AND (companies.owner_id = auth.uid()))))));
ALTER TABLE public.integration_probes ENABLE ROW LEVEL SECURITY;
CREATE POLICY integration_probes_tenant ON public.integration_probes TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.integration_connections c
  WHERE ((c.id = integration_probes.connection_id) AND (public.is_merchant_member(c.merchant_id) OR public.is_platform_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.integration_connections c
  WHERE ((c.id = integration_probes.connection_id) AND (public.is_merchant_member(c.merchant_id) OR public.is_platform_admin())))));
ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY locations_public_read ON public.locations FOR SELECT USING (true);
ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY marketplace_payouts_tenant ON public.marketplace_payouts USING (public.is_merchant_member(seller_merchant_id));
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members delete company secrets" ON public.company_secrets FOR DELETE TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "members manage company meetings" ON public.meetings TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "members manage payment accounts" ON public.payment_accounts TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "members manage routing forms" ON public.routing_forms TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "members manage waitlist" ON public.waitlist TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "members manage webhooks" ON public.outbound_webhooks TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "members manage workflows" ON public.workflows TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "members owner manage" ON public.company_members TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = company_members.company_id) AND (c.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = company_members.company_id) AND (c.owner_id = auth.uid())))));
CREATE POLICY "members read company secrets" ON public.company_secrets FOR SELECT TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "members read deliveries" ON public.webhook_deliveries FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.outbound_webhooks w
  WHERE ((w.id = webhook_deliveries.webhook_id) AND public.is_company_member(w.company_id, auth.uid())))));
CREATE POLICY "members read domain audit" ON public.domain_audit_log FOR SELECT TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "members read ledger" ON public.wallet_ledger FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "members read routing submissions" ON public.routing_submissions FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "members read workflow runs" ON public.workflow_runs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.workflows w
  WHERE ((w.id = workflow_runs.workflow_id) AND public.is_company_member(w.company_id, auth.uid())))));
CREATE POLICY "members self read" ON public.company_members FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = company_members.company_id) AND (c.owner_id = auth.uid()))))));
CREATE POLICY "members update company secrets" ON public.company_secrets FOR UPDATE TO authenticated USING ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "members write company secrets" ON public.company_secrets FOR INSERT TO authenticated WITH CHECK ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "members write domain audit" ON public.domain_audit_log FOR INSERT TO authenticated WITH CHECK ((public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY mfa_recovery_owner ON public.mfa_recovery_codes TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
ALTER TABLE public.mfa_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY mfa_secrets_insert_own ON public.mfa_secrets FOR INSERT WITH CHECK ((user_id = auth.uid()));
CREATE POLICY mfa_secrets_read_own ON public.mfa_secrets FOR SELECT USING ((user_id = auth.uid()));
CREATE POLICY mfa_secrets_update_own ON public.mfa_secrets FOR UPDATE USING ((user_id = auth.uid()));
ALTER TABLE public.navigation ENABLE ROW LEVEL SECURITY;
CREATE POLICY navigation_anon_select ON public.navigation FOR SELECT TO anon USING (true);
CREATE POLICY navigation_auth_select ON public.navigation FOR SELECT TO authenticated USING (true);
CREATE POLICY navigation_member_write ON public.navigation TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY navigation_public_read ON public.navigation FOR SELECT USING (true);
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_templates member manage" ON public.notification_templates TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "notification_templates public read" ON public.notification_templates FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = notification_templates.company_id) AND c.is_published))));
ALTER TABLE public.oauth_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observability_prune_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY page_revisions_tenant ON public.page_revisions TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.storefront_pages p
  WHERE ((p.id = page_revisions.page_id) AND (public.is_merchant_member(p.merchant_id) OR public.is_platform_admin()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.storefront_pages p
  WHERE ((p.id = page_revisions.page_id) AND (public.is_merchant_member(p.merchant_id) OR public.is_platform_admin())))));
ALTER TABLE public.page_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY page_versions_anon_select_published ON public.page_versions FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM public.pages p
  WHERE ((p.id = page_versions.page_id) AND (p.status = 'published'::text) AND (p.published_version_id = page_versions.id)))));
CREATE POLICY page_versions_auth_select ON public.page_versions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pages p
  WHERE ((p.id = page_versions.page_id) AND (((p.status = 'published'::text) AND (p.published_version_id = page_versions.id)) OR public.is_company_member(p.company_id, auth.uid()))))));
CREATE POLICY page_versions_member_insert ON public.page_versions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pages p
  WHERE ((p.id = page_versions.page_id) AND public.is_company_member(p.company_id, auth.uid())))));
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY pages_anon_select_published ON public.pages FOR SELECT TO anon USING (((status = 'published'::text) AND (published_version_id IS NOT NULL)));
CREATE POLICY pages_auth_select_published_or_member ON public.pages FOR SELECT TO authenticated USING ((((status = 'published'::text) AND (published_version_id IS NOT NULL)) OR public.is_company_member(company_id, auth.uid())));
CREATE POLICY pages_member_delete ON public.pages FOR DELETE TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY pages_member_insert ON public.pages FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY pages_member_update ON public.pages FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY pages_public_read ON public.pages FOR SELECT USING (true);
ALTER TABLE public.partner_abuse_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY partner_apps_insert_admin ON public.partner_apps FOR INSERT WITH CHECK ((auth.uid() IN ( SELECT user_roles.user_id
   FROM public.user_roles
  WHERE (user_roles.role = 'super_admin'::public.app_role))));
CREATE POLICY partner_apps_select_admin ON public.partner_apps FOR SELECT USING ((auth.uid() IN ( SELECT user_roles.user_id
   FROM public.user_roles
  WHERE (user_roles.role = ANY (ARRAY['owner'::public.app_role, 'super_admin'::public.app_role])))));
CREATE POLICY partner_apps_update_admin ON public.partner_apps FOR UPDATE USING ((auth.uid() IN ( SELECT user_roles.user_id
   FROM public.user_roles
  WHERE (user_roles.role = 'super_admin'::public.app_role))));
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY partners_insert_admin ON public.partners FOR INSERT WITH CHECK ((auth.uid() IN ( SELECT user_roles.user_id
   FROM public.user_roles
  WHERE (user_roles.role = 'super_admin'::public.app_role))));
CREATE POLICY partners_select_public ON public.partners FOR SELECT USING (true);
CREATE POLICY partners_update_admin ON public.partners FOR UPDATE USING ((auth.uid() IN ( SELECT user_roles.user_id
   FROM public.user_roles
  WHERE (user_roles.role = 'super_admin'::public.app_role))));
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_methods_tenant ON public.payment_methods USING (public.is_merchant_member(merchant_id));
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions managed by super_admin" ON public.permissions TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "permissions readable to all" ON public.permissions FOR SELECT USING (true);
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans public read" ON public.plans FOR SELECT USING (true);
ALTER TABLE public.platform_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_observability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_snapshot_restores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prune log super admin read" ON public.observability_prune_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "public can join waitlist" ON public.waitlist FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "public read enabled routing forms" ON public.routing_forms FOR SELECT TO authenticated, anon USING ((enabled = true));
CREATE POLICY "public submit routing" ON public.routing_submissions FOR INSERT TO authenticated, anon WITH CHECK ((form_id IS NOT NULL));
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read settings" ON public.platform_payment_settings FOR SELECT TO authenticated USING (true);
ALTER TABLE public.recovery_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY recovery_codes_delete_own ON public.recovery_codes FOR DELETE USING ((user_id = auth.uid()));
CREATE POLICY recovery_codes_insert_own ON public.recovery_codes FOR INSERT WITH CHECK ((user_id = auth.uid()));
CREATE POLICY recovery_codes_read_own ON public.recovery_codes FOR SELECT USING ((user_id = auth.uid()));
CREATE POLICY recovery_codes_update_own ON public.recovery_codes FOR UPDATE USING ((user_id = auth.uid()));
CREATE POLICY "regen jobs insert" ON public.cms_regen_jobs FOR INSERT TO authenticated WITH CHECK (public.can_edit_cms(auth.uid()));
CREATE POLICY "regen jobs read" ON public.cms_regen_jobs FOR SELECT TO authenticated USING (public.can_edit_cms(auth.uid()));
CREATE POLICY "regen jobs update" ON public.cms_regen_jobs FOR UPDATE TO authenticated USING (public.can_edit_cms(auth.uid())) WITH CHECK (public.can_edit_cms(auth.uid()));
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_perms managed by super_admin" ON public.role_permissions TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "role_perms readable to authenticated" ON public.role_permissions FOR SELECT TO authenticated USING (true);
ALTER TABLE public.routing_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY security_events_super_admin_read ON public.security_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY security_events_super_admin_write ON public.security_events TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
ALTER TABLE public.seo_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seo_keywords super admin manage" ON public.seo_keywords TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "seo_keywords tenants manage" ON public.seo_keywords TO authenticated USING (((company_id IS NOT NULL) AND public.is_company_member(company_id, auth.uid()))) WITH CHECK (((company_id IS NOT NULL) AND public.is_company_member(company_id, auth.uid())));
ALTER TABLE public.seo_not_found_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY seo_not_found_log_tenant ON public.seo_not_found_log TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin())) WITH CHECK ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));
ALTER TABLE public.seo_redirects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seo_redirects public read" ON public.seo_redirects FOR SELECT USING (true);
CREATE POLICY "seo_redirects super admin manage" ON public.seo_redirects TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "seo_redirects tenants manage" ON public.seo_redirects TO authenticated USING (((company_id IS NOT NULL) AND public.is_company_member(company_id, auth.uid()))) WITH CHECK (((company_id IS NOT NULL) AND public.is_company_member(company_id, auth.uid())));
ALTER TABLE public.seo_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seo_settings public read" ON public.seo_settings FOR SELECT USING (true);
CREATE POLICY "seo_settings super admin manage" ON public.seo_settings TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "seo_settings tenants manage" ON public.seo_settings TO authenticated USING (((company_id IS NOT NULL) AND public.is_company_member(company_id, auth.uid()))) WITH CHECK (((company_id IS NOT NULL) AND public.is_company_member(company_id, auth.uid())));
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services owner manage" ON public.services TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = services.company_id) AND (c.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = services.company_id) AND (c.owner_id = auth.uid())))));
CREATE POLICY "services public read" ON public.services FOR SELECT USING (true);
CREATE POLICY "sites owner manage" ON public.builder_sites TO authenticated USING (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK (((auth.uid() = owner_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "sites public read published" ON public.builder_sites FOR SELECT USING ((is_published OR (auth.uid() = owner_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
ALTER TABLE public.sso_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff owner manage" ON public.staff_members TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = staff_members.company_id) AND (c.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.companies c
  WHERE ((c.id = staff_members.company_id) AND (c.owner_id = auth.uid())))));
CREATE POLICY "staff public read" ON public.staff_members FOR SELECT USING (true);
CREATE POLICY "staff self read" ON public.staff_members FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "staff self update" ON public.staff_members FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
ALTER TABLE public.staff_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_hour_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_up_confirmations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin read observability" ON public.platform_observability FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "super admin reads errors" ON public.platform_errors FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "super admin reads platform settings" ON public.platform_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "super admin write observability" ON public.platform_observability TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "super admin writes platform settings" ON public.platform_settings TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "super admin writes settings" ON public.platform_payment_settings TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "super admins manage platform settings" ON public.platform_settings USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "super_admin enqueues updates" ON public.system_updates FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "super_admin reads updates" ON public.system_updates FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
ALTER TABLE public.support_revision_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_revision_reviews_tenant_read ON public.support_revision_reviews FOR SELECT USING (public.is_merchant_member(merchant_id, auth.uid()));
CREATE POLICY support_revision_reviews_tenant_write ON public.support_revision_reviews USING (public.is_merchant_admin(merchant_id, auth.uid())) WITH CHECK (public.is_merchant_admin(merchant_id, auth.uid()));
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates read system or own" ON public.builder_templates FOR SELECT USING ((is_system OR (auth.uid() = owner_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "templates write own" ON public.builder_templates TO authenticated USING ((((NOT is_system) AND (auth.uid() = owner_id)) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))) WITH CHECK ((((NOT is_system) AND (auth.uid() = owner_id)) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "tenant ticket member access" ON public.tenant_tickets TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
ALTER TABLE public.tenant_blocklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_domains_delete_member ON public.tenant_domains FOR DELETE TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY tenant_domains_insert_member ON public.tenant_domains FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));
CREATE POLICY tenant_domains_select_member ON public.tenant_domains FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY tenant_domains_super_admin_all ON public.tenant_domains TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY tenant_domains_update_member ON public.tenant_domains FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid())) WITH CHECK (public.is_company_member(company_id, auth.uid()));
ALTER TABLE public.tenant_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY theme_assets_public_read ON public.theme_assets FOR SELECT TO authenticated, anon USING (public.is_public_merchant(merchant_id));
CREATE POLICY theme_assets_tenant_write ON public.theme_assets TO authenticated USING ((public.is_merchant_member(merchant_id) OR public.is_platform_admin())) WITH CHECK ((public.is_merchant_member(merchant_id) OR public.is_platform_admin()));
CREATE POLICY "ucr managed by company owner" ON public.user_custom_roles TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.custom_roles cr
     JOIN public.companies c ON ((c.id = cr.company_id)))
  WHERE ((cr.id = user_custom_roles.custom_role_id) AND ((c.owner_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.custom_roles cr
     JOIN public.companies c ON ((c.id = cr.company_id)))
  WHERE ((cr.id = user_custom_roles.custom_role_id) AND ((c.owner_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))))));
CREATE POLICY "ucr read self or company owner" ON public.user_custom_roles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM (public.custom_roles cr
     JOIN public.companies c ON ((c.id = cr.company_id)))
  WHERE ((cr.id = user_custom_roles.custom_role_id) AND (c.owner_id = auth.uid()))))));
ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles deny write" ON public.user_roles TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "user_roles self read" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own tickets" ON public.support_tickets FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)));
CREATE POLICY "users update own ticket" ON public.support_tickets FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "versions read for accessible docs" ON public.builder_versions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.builder_documents d
  WHERE ((d.id = builder_versions.document_id) AND ((d.status = 'published'::text) OR (d.owner_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))))));
CREATE POLICY "versions write for owner" ON public.builder_versions TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.builder_documents d
  WHERE ((d.id = builder_versions.document_id) AND ((d.owner_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.builder_documents d
  WHERE ((d.id = builder_versions.document_id) AND ((d.owner_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role))))));
ALTER TABLE public.voice_call_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wal_archive_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY wal_archive_state_service_all ON public.wal_archive_state TO service_role USING (true) WITH CHECK (true);
CREATE POLICY wal_archive_state_super_admin_all ON public.wal_archive_state TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.abuse_reports TO anon;
GRANT ALL ON TABLE public.abuse_reports TO authenticated;
GRANT ALL ON TABLE public.abuse_reports TO service_role;
GRANT ALL ON TABLE public.abuse_reports TO supabase_auth_admin;
GRANT ALL ON TABLE public.api_key_abuse_log TO anon;
GRANT ALL ON TABLE public.api_key_abuse_log TO authenticated;
GRANT ALL ON TABLE public.api_key_abuse_log TO service_role;
GRANT ALL ON TABLE public.api_key_abuse_log TO supabase_auth_admin;
GRANT ALL ON TABLE public.api_key_usage TO anon;
GRANT ALL ON TABLE public.api_key_usage TO authenticated;
GRANT ALL ON TABLE public.api_key_usage TO service_role;
GRANT ALL ON TABLE public.api_key_usage TO supabase_auth_admin;
GRANT ALL ON SEQUENCE public.api_key_usage_id_seq TO anon;
GRANT ALL ON SEQUENCE public.api_key_usage_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.api_key_usage_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.api_key_usage_id_seq TO supabase_auth_admin;
GRANT ALL ON TABLE public.appointees TO anon;
GRANT ALL ON TABLE public.appointees TO authenticated;
GRANT ALL ON TABLE public.appointees TO service_role;
GRANT ALL ON TABLE public.appointees TO supabase_auth_admin;
GRANT ALL ON TABLE public.article_revisions TO postgres;
GRANT ALL ON TABLE public.article_revisions TO anon;
GRANT ALL ON TABLE public.article_revisions TO authenticated;
GRANT ALL ON TABLE public.article_revisions TO service_role;
GRANT ALL ON TABLE public.audit_log TO anon;
GRANT ALL ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;
GRANT ALL ON TABLE public.audit_log TO supabase_auth_admin;
GRANT ALL ON TABLE public.backup_health_config TO anon;
GRANT ALL ON TABLE public.backup_health_config TO authenticated;
GRANT ALL ON TABLE public.backup_health_config TO service_role;
GRANT ALL ON TABLE public.backup_health_config TO supabase_auth_admin;
GRANT ALL ON TABLE public.backup_runs TO anon;
GRANT ALL ON TABLE public.backup_runs TO authenticated;
GRANT ALL ON TABLE public.backup_runs TO service_role;
GRANT ALL ON TABLE public.backup_runs TO supabase_auth_admin;
GRANT ALL ON TABLE public.bookings TO anon;
GRANT ALL ON TABLE public.bookings TO authenticated;
GRANT ALL ON TABLE public.bookings TO service_role;
GRANT ALL ON TABLE public.bookings TO supabase_auth_admin;
GRANT ALL ON TABLE public.builder_documents TO anon;
GRANT ALL ON TABLE public.builder_documents TO authenticated;
GRANT ALL ON TABLE public.builder_documents TO service_role;
GRANT ALL ON TABLE public.builder_documents TO supabase_auth_admin;
GRANT ALL ON TABLE public.builder_sites TO anon;
GRANT ALL ON TABLE public.builder_sites TO authenticated;
GRANT ALL ON TABLE public.builder_sites TO service_role;
GRANT ALL ON TABLE public.builder_sites TO supabase_auth_admin;
GRANT ALL ON TABLE public.builder_template_seo TO postgres;
GRANT ALL ON TABLE public.builder_template_seo TO anon;
GRANT ALL ON TABLE public.builder_template_seo TO authenticated;
GRANT ALL ON TABLE public.builder_template_seo TO service_role;
GRANT ALL ON TABLE public.builder_templates TO anon;
GRANT ALL ON TABLE public.builder_templates TO authenticated;
GRANT ALL ON TABLE public.builder_templates TO service_role;
GRANT ALL ON TABLE public.builder_templates TO supabase_auth_admin;
GRANT ALL ON TABLE public.builder_versions TO anon;
GRANT ALL ON TABLE public.builder_versions TO authenticated;
GRANT ALL ON TABLE public.builder_versions TO service_role;
GRANT ALL ON TABLE public.builder_versions TO supabase_auth_admin;
GRANT ALL ON TABLE public.carding_velocity_config TO authenticated;
GRANT ALL ON TABLE public.carding_velocity_config TO service_role;
GRANT ALL ON TABLE public.carding_velocity_config TO supabase_auth_admin;
GRANT SELECT ON TABLE public.carding_velocity_config TO anon;
GRANT ALL ON TABLE public.checkout_sessions TO anon;
GRANT ALL ON TABLE public.checkout_sessions TO authenticated;
GRANT ALL ON TABLE public.checkout_sessions TO service_role;
GRANT ALL ON TABLE public.checkout_sessions TO supabase_auth_admin;
GRANT ALL ON TABLE public.cms_post_versions TO anon;
GRANT ALL ON TABLE public.cms_post_versions TO authenticated;
GRANT ALL ON TABLE public.cms_post_versions TO service_role;
GRANT ALL ON TABLE public.cms_post_versions TO supabase_auth_admin;
GRANT ALL ON TABLE public.cms_posts TO anon;
GRANT ALL ON TABLE public.cms_posts TO authenticated;
GRANT ALL ON TABLE public.cms_posts TO service_role;
GRANT ALL ON TABLE public.cms_posts TO supabase_auth_admin;
GRANT ALL ON TABLE public.cms_regen_jobs TO anon;
GRANT ALL ON TABLE public.cms_regen_jobs TO authenticated;
GRANT ALL ON TABLE public.cms_regen_jobs TO service_role;
GRANT ALL ON TABLE public.cms_regen_jobs TO supabase_auth_admin;
GRANT ALL ON TABLE public.companies TO anon;
GRANT ALL ON TABLE public.companies TO authenticated;
GRANT ALL ON TABLE public.companies TO service_role;
GRANT ALL ON TABLE public.companies TO supabase_auth_admin;
GRANT ALL ON TABLE public.company_holidays TO anon;
GRANT ALL ON TABLE public.company_holidays TO authenticated;
GRANT ALL ON TABLE public.company_holidays TO service_role;
GRANT ALL ON TABLE public.company_holidays TO supabase_auth_admin;
GRANT ALL ON TABLE public.company_members TO anon;
GRANT ALL ON TABLE public.company_members TO authenticated;
GRANT ALL ON TABLE public.company_members TO service_role;
GRANT ALL ON TABLE public.company_members TO supabase_auth_admin;
GRANT ALL ON TABLE public.company_secrets TO anon;
GRANT ALL ON TABLE public.company_secrets TO authenticated;
GRANT ALL ON TABLE public.company_secrets TO service_role;
GRANT ALL ON TABLE public.company_secrets TO supabase_auth_admin;
GRANT ALL ON TABLE public.company_settings TO authenticated;
GRANT ALL ON TABLE public.company_settings TO service_role;
GRANT ALL ON TABLE public.company_settings TO supabase_auth_admin;
GRANT SELECT ON TABLE public.company_settings TO anon;
GRANT ALL ON TABLE public.custom_role_permissions TO anon;
GRANT ALL ON TABLE public.custom_role_permissions TO authenticated;
GRANT ALL ON TABLE public.custom_role_permissions TO service_role;
GRANT ALL ON TABLE public.custom_role_permissions TO supabase_auth_admin;
GRANT ALL ON TABLE public.custom_roles TO anon;
GRANT ALL ON TABLE public.custom_roles TO authenticated;
GRANT ALL ON TABLE public.custom_roles TO service_role;
GRANT ALL ON TABLE public.custom_roles TO supabase_auth_admin;
GRANT ALL ON TABLE public.customer_accounts TO anon;
GRANT ALL ON TABLE public.customer_accounts TO authenticated;
GRANT ALL ON TABLE public.customer_accounts TO service_role;
GRANT ALL ON TABLE public.customer_accounts TO supabase_auth_admin;
GRANT ALL ON TABLE public.customer_webhook_deliveries TO anon;
GRANT ALL ON TABLE public.customer_webhook_deliveries TO authenticated;
GRANT ALL ON TABLE public.customer_webhook_deliveries TO service_role;
GRANT ALL ON TABLE public.customer_webhook_deliveries TO supabase_auth_admin;
GRANT ALL ON TABLE public.customer_webhook_subscriptions TO anon;
GRANT ALL ON TABLE public.customer_webhook_subscriptions TO authenticated;
GRANT ALL ON TABLE public.customer_webhook_subscriptions TO service_role;
GRANT ALL ON TABLE public.customer_webhook_subscriptions TO supabase_auth_admin;
GRANT ALL ON TABLE public.domain_audit_log TO anon;
GRANT ALL ON TABLE public.domain_audit_log TO authenticated;
GRANT ALL ON TABLE public.domain_audit_log TO service_role;
GRANT ALL ON TABLE public.domain_audit_log TO supabase_auth_admin;
GRANT ALL ON TABLE public.drill_results TO anon;
GRANT ALL ON TABLE public.drill_results TO authenticated;
GRANT ALL ON TABLE public.drill_results TO service_role;
GRANT ALL ON TABLE public.drill_results TO supabase_auth_admin;
GRANT ALL ON TABLE public.embed_allowlist TO anon;
GRANT ALL ON TABLE public.embed_allowlist TO authenticated;
GRANT ALL ON TABLE public.embed_allowlist TO service_role;
GRANT ALL ON TABLE public.embed_allowlist TO supabase_auth_admin;
GRANT ALL ON TABLE public.embed_analytics TO anon;
GRANT ALL ON TABLE public.embed_analytics TO authenticated;
GRANT ALL ON TABLE public.embed_analytics TO service_role;
GRANT ALL ON TABLE public.embed_analytics TO supabase_auth_admin;
GRANT ALL ON TABLE public.erasure_requests TO anon;
GRANT ALL ON TABLE public.erasure_requests TO authenticated;
GRANT ALL ON TABLE public.erasure_requests TO service_role;
GRANT ALL ON TABLE public.erasure_requests TO supabase_auth_admin;
GRANT ALL ON TABLE public.experiments TO anon;
GRANT ALL ON TABLE public.experiments TO authenticated;
GRANT ALL ON TABLE public.experiments TO service_role;
GRANT ALL ON TABLE public.experiments TO supabase_auth_admin;
GRANT ALL ON TABLE public.external_calendar_feeds TO anon;
GRANT ALL ON TABLE public.external_calendar_feeds TO authenticated;
GRANT ALL ON TABLE public.external_calendar_feeds TO service_role;
GRANT ALL ON TABLE public.external_calendar_feeds TO supabase_auth_admin;
GRANT ALL ON TABLE public.feature_flags TO anon;
GRANT ALL ON TABLE public.feature_flags TO authenticated;
GRANT ALL ON TABLE public.feature_flags TO service_role;
GRANT ALL ON TABLE public.feature_flags TO supabase_auth_admin;
GRANT ALL ON TABLE public.followup_tasks TO anon;
GRANT ALL ON TABLE public.followup_tasks TO authenticated;
GRANT ALL ON TABLE public.followup_tasks TO service_role;
GRANT ALL ON TABLE public.followup_tasks TO supabase_auth_admin;
GRANT ALL ON TABLE public.forms TO anon;
GRANT ALL ON TABLE public.forms TO authenticated;
GRANT ALL ON TABLE public.forms TO service_role;
GRANT ALL ON TABLE public.forms TO supabase_auth_admin;
GRANT ALL ON TABLE public.gallery_items TO anon;
GRANT ALL ON TABLE public.gallery_items TO authenticated;
GRANT ALL ON TABLE public.gallery_items TO service_role;
GRANT ALL ON TABLE public.gallery_items TO supabase_auth_admin;
GRANT ALL ON TABLE public.inbound_webhook_events TO anon;
GRANT ALL ON TABLE public.inbound_webhook_events TO authenticated;
GRANT ALL ON TABLE public.inbound_webhook_events TO service_role;
GRANT ALL ON TABLE public.inbound_webhook_events TO supabase_auth_admin;
GRANT ALL ON TABLE public.integration_connections TO postgres;
GRANT ALL ON TABLE public.integration_connections TO anon;
GRANT ALL ON TABLE public.integration_connections TO authenticated;
GRANT ALL ON TABLE public.integration_connections TO service_role;
GRANT ALL ON TABLE public.integration_health_status TO anon;
GRANT ALL ON TABLE public.integration_health_status TO authenticated;
GRANT ALL ON TABLE public.integration_health_status TO service_role;
GRANT ALL ON TABLE public.integration_health_status TO supabase_auth_admin;
GRANT ALL ON TABLE public.integration_probes TO postgres;
GRANT ALL ON TABLE public.integration_probes TO anon;
GRANT ALL ON TABLE public.integration_probes TO authenticated;
GRANT ALL ON TABLE public.integration_probes TO service_role;
GRANT ALL ON TABLE public.invite_tokens TO service_role;
GRANT ALL ON TABLE public.invite_tokens TO supabase_auth_admin;
GRANT SELECT ON TABLE public.invite_tokens TO authenticated;
GRANT SELECT ON TABLE public.invite_tokens TO anon;
GRANT ALL ON TABLE public.job_queue TO anon;
GRANT ALL ON TABLE public.job_queue TO authenticated;
GRANT ALL ON TABLE public.job_queue TO service_role;
GRANT ALL ON TABLE public.job_queue TO supabase_auth_admin;
GRANT ALL ON TABLE public.locations TO anon;
GRANT ALL ON TABLE public.locations TO authenticated;
GRANT ALL ON TABLE public.locations TO service_role;
GRANT ALL ON TABLE public.locations TO supabase_auth_admin;
GRANT ALL ON TABLE public.marketing_leads TO anon;
GRANT ALL ON TABLE public.marketing_leads TO authenticated;
GRANT ALL ON TABLE public.marketing_leads TO service_role;
GRANT ALL ON TABLE public.marketing_leads TO supabase_auth_admin;
GRANT ALL ON TABLE public.marketplace_payouts TO postgres;
GRANT ALL ON TABLE public.marketplace_payouts TO anon;
GRANT ALL ON TABLE public.marketplace_payouts TO authenticated;
GRANT ALL ON TABLE public.marketplace_payouts TO service_role;
GRANT ALL ON TABLE public.meetings TO anon;
GRANT ALL ON TABLE public.meetings TO authenticated;
GRANT ALL ON TABLE public.meetings TO service_role;
GRANT ALL ON TABLE public.meetings TO supabase_auth_admin;
GRANT ALL ON TABLE public.mfa_recovery_codes TO postgres;
GRANT ALL ON TABLE public.mfa_recovery_codes TO anon;
GRANT ALL ON TABLE public.mfa_recovery_codes TO authenticated;
GRANT ALL ON TABLE public.mfa_recovery_codes TO service_role;
GRANT ALL ON TABLE public.mfa_secrets TO anon;
GRANT ALL ON TABLE public.mfa_secrets TO authenticated;
GRANT ALL ON TABLE public.mfa_secrets TO service_role;
GRANT ALL ON TABLE public.mfa_secrets TO supabase_auth_admin;
GRANT ALL ON TABLE public.navigation TO anon;
GRANT ALL ON TABLE public.navigation TO authenticated;
GRANT ALL ON TABLE public.navigation TO service_role;
GRANT ALL ON TABLE public.navigation TO supabase_auth_admin;
GRANT ALL ON TABLE public.newsletter_subscribers TO anon;
GRANT ALL ON TABLE public.newsletter_subscribers TO authenticated;
GRANT ALL ON TABLE public.newsletter_subscribers TO service_role;
GRANT ALL ON TABLE public.newsletter_subscribers TO supabase_auth_admin;
GRANT ALL ON TABLE public.notification_log TO anon;
GRANT ALL ON TABLE public.notification_log TO authenticated;
GRANT ALL ON TABLE public.notification_log TO service_role;
GRANT ALL ON TABLE public.notification_log TO supabase_auth_admin;
GRANT ALL ON TABLE public.notification_templates TO anon;
GRANT ALL ON TABLE public.notification_templates TO authenticated;
GRANT ALL ON TABLE public.notification_templates TO service_role;
GRANT ALL ON TABLE public.notification_templates TO supabase_auth_admin;
GRANT ALL ON TABLE public.oauth_state TO anon;
GRANT ALL ON TABLE public.oauth_state TO authenticated;
GRANT ALL ON TABLE public.oauth_state TO service_role;
GRANT ALL ON TABLE public.oauth_state TO supabase_auth_admin;
GRANT ALL ON TABLE public.oauth_tokens TO anon;
GRANT ALL ON TABLE public.oauth_tokens TO authenticated;
GRANT ALL ON TABLE public.oauth_tokens TO service_role;
GRANT ALL ON TABLE public.oauth_tokens TO supabase_auth_admin;
GRANT ALL ON TABLE public.observability_prune_log TO anon;
GRANT ALL ON TABLE public.observability_prune_log TO authenticated;
GRANT ALL ON TABLE public.observability_prune_log TO service_role;
GRANT ALL ON TABLE public.observability_prune_log TO supabase_auth_admin;
GRANT ALL ON TABLE public.outbound_webhooks TO anon;
GRANT ALL ON TABLE public.outbound_webhooks TO authenticated;
GRANT ALL ON TABLE public.outbound_webhooks TO service_role;
GRANT ALL ON TABLE public.outbound_webhooks TO supabase_auth_admin;
GRANT ALL ON TABLE public.page_revisions TO postgres;
GRANT ALL ON TABLE public.page_revisions TO anon;
GRANT ALL ON TABLE public.page_revisions TO authenticated;
GRANT ALL ON TABLE public.page_revisions TO service_role;
GRANT ALL ON TABLE public.page_versions TO anon;
GRANT ALL ON TABLE public.page_versions TO authenticated;
GRANT ALL ON TABLE public.page_versions TO service_role;
GRANT ALL ON TABLE public.page_versions TO supabase_auth_admin;
GRANT ALL ON TABLE public.pages TO anon;
GRANT ALL ON TABLE public.pages TO authenticated;
GRANT ALL ON TABLE public.pages TO service_role;
GRANT ALL ON TABLE public.pages TO supabase_auth_admin;
GRANT ALL ON TABLE public.partner_abuse_queue TO anon;
GRANT ALL ON TABLE public.partner_abuse_queue TO authenticated;
GRANT ALL ON TABLE public.partner_abuse_queue TO service_role;
GRANT ALL ON TABLE public.partner_abuse_queue TO supabase_auth_admin;
GRANT ALL ON TABLE public.partner_apps TO anon;
GRANT ALL ON TABLE public.partner_apps TO authenticated;
GRANT ALL ON TABLE public.partner_apps TO service_role;
GRANT ALL ON TABLE public.partner_apps TO supabase_auth_admin;
GRANT ALL ON TABLE public.partners TO anon;
GRANT ALL ON TABLE public.partners TO authenticated;
GRANT ALL ON TABLE public.partners TO service_role;
GRANT ALL ON TABLE public.partners TO supabase_auth_admin;
GRANT ALL ON TABLE public.payment_accounts TO anon;
GRANT ALL ON TABLE public.payment_accounts TO authenticated;
GRANT ALL ON TABLE public.payment_accounts TO service_role;
GRANT ALL ON TABLE public.payment_accounts TO supabase_auth_admin;
GRANT ALL ON TABLE public.payment_attempts TO service_role;
GRANT ALL ON TABLE public.payment_attempts TO supabase_auth_admin;
GRANT SELECT ON TABLE public.payment_attempts TO authenticated;
GRANT SELECT ON TABLE public.payment_attempts TO anon;
GRANT ALL ON TABLE public.payment_disputes TO service_role;
GRANT ALL ON TABLE public.payment_disputes TO supabase_auth_admin;
GRANT SELECT ON TABLE public.payment_disputes TO authenticated;
GRANT SELECT ON TABLE public.payment_disputes TO anon;
GRANT ALL ON TABLE public.payment_methods TO postgres;
GRANT ALL ON TABLE public.payment_methods TO anon;
GRANT ALL ON TABLE public.payment_methods TO authenticated;
GRANT ALL ON TABLE public.payment_methods TO service_role;
GRANT ALL ON TABLE public.permissions TO anon;
GRANT ALL ON TABLE public.permissions TO authenticated;
GRANT ALL ON TABLE public.permissions TO service_role;
GRANT ALL ON TABLE public.permissions TO supabase_auth_admin;
GRANT ALL ON TABLE public.phone_numbers TO anon;
GRANT ALL ON TABLE public.phone_numbers TO authenticated;
GRANT ALL ON TABLE public.phone_numbers TO service_role;
GRANT ALL ON TABLE public.phone_numbers TO supabase_auth_admin;
GRANT ALL ON TABLE public.plans TO anon;
GRANT ALL ON TABLE public.plans TO authenticated;
GRANT ALL ON TABLE public.plans TO service_role;
GRANT ALL ON TABLE public.plans TO supabase_auth_admin;
GRANT ALL ON TABLE public.platform_errors TO anon;
GRANT ALL ON TABLE public.platform_errors TO authenticated;
GRANT ALL ON TABLE public.platform_errors TO service_role;
GRANT ALL ON TABLE public.platform_errors TO supabase_auth_admin;
GRANT ALL ON TABLE public.platform_observability TO anon;
GRANT ALL ON TABLE public.platform_observability TO authenticated;
GRANT ALL ON TABLE public.platform_observability TO service_role;
GRANT ALL ON TABLE public.platform_observability TO supabase_auth_admin;
GRANT ALL ON TABLE public.platform_payment_settings TO anon;
GRANT ALL ON TABLE public.platform_payment_settings TO authenticated;
GRANT ALL ON TABLE public.platform_payment_settings TO service_role;
GRANT ALL ON TABLE public.platform_payment_settings TO supabase_auth_admin;
GRANT ALL ON TABLE public.platform_settings TO anon;
GRANT ALL ON TABLE public.platform_settings TO authenticated;
GRANT ALL ON TABLE public.platform_settings TO service_role;
GRANT ALL ON TABLE public.platform_settings TO supabase_auth_admin;
GRANT ALL ON TABLE public.platform_snapshot_restores TO postgres;
GRANT ALL ON TABLE public.platform_snapshot_restores TO anon;
GRANT ALL ON TABLE public.platform_snapshot_restores TO authenticated;
GRANT ALL ON TABLE public.platform_snapshot_restores TO service_role;
GRANT ALL ON TABLE public.platform_snapshots TO postgres;
GRANT ALL ON TABLE public.platform_snapshots TO anon;
GRANT ALL ON TABLE public.platform_snapshots TO authenticated;
GRANT ALL ON TABLE public.platform_snapshots TO service_role;
GRANT ALL ON TABLE public.rate_limits TO anon;
GRANT ALL ON TABLE public.rate_limits TO authenticated;
GRANT ALL ON TABLE public.rate_limits TO service_role;
GRANT ALL ON TABLE public.rate_limits TO supabase_auth_admin;
GRANT ALL ON TABLE public.recovery_codes TO anon;
GRANT ALL ON TABLE public.recovery_codes TO authenticated;
GRANT ALL ON TABLE public.recovery_codes TO service_role;
GRANT ALL ON TABLE public.recovery_codes TO supabase_auth_admin;
GRANT ALL ON TABLE public.reminders TO anon;
GRANT ALL ON TABLE public.reminders TO authenticated;
GRANT ALL ON TABLE public.reminders TO service_role;
GRANT ALL ON TABLE public.reminders TO supabase_auth_admin;
GRANT ALL ON TABLE public.reviews TO anon;
GRANT ALL ON TABLE public.reviews TO authenticated;
GRANT ALL ON TABLE public.reviews TO service_role;
GRANT ALL ON TABLE public.reviews TO supabase_auth_admin;
GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;
GRANT ALL ON TABLE public.user_roles TO supabase_auth_admin;
GRANT ALL ON TABLE public.role_assignments_view TO anon;
GRANT ALL ON TABLE public.role_assignments_view TO authenticated;
GRANT ALL ON TABLE public.role_assignments_view TO service_role;
GRANT ALL ON TABLE public.role_assignments_view TO supabase_auth_admin;
GRANT ALL ON TABLE public.role_permissions TO anon;
GRANT ALL ON TABLE public.role_permissions TO authenticated;
GRANT ALL ON TABLE public.role_permissions TO service_role;
GRANT ALL ON TABLE public.role_permissions TO supabase_auth_admin;
GRANT ALL ON TABLE public.routing_forms TO anon;
GRANT ALL ON TABLE public.routing_forms TO authenticated;
GRANT ALL ON TABLE public.routing_forms TO service_role;
GRANT ALL ON TABLE public.routing_forms TO supabase_auth_admin;
GRANT ALL ON TABLE public.routing_submissions TO anon;
GRANT ALL ON TABLE public.routing_submissions TO authenticated;
GRANT ALL ON TABLE public.routing_submissions TO service_role;
GRANT ALL ON TABLE public.routing_submissions TO supabase_auth_admin;
GRANT ALL ON TABLE public.schema_migration_files TO postgres;
GRANT ALL ON TABLE public.schema_migration_files TO anon;
GRANT ALL ON TABLE public.schema_migration_files TO authenticated;
GRANT ALL ON TABLE public.schema_migration_files TO service_role;
GRANT ALL ON TABLE public.security_events TO authenticated;
GRANT ALL ON TABLE public.security_events TO service_role;
GRANT ALL ON TABLE public.security_events TO supabase_auth_admin;
GRANT SELECT ON TABLE public.security_events TO anon;
GRANT ALL ON TABLE public.seo_keywords TO anon;
GRANT ALL ON TABLE public.seo_keywords TO authenticated;
GRANT ALL ON TABLE public.seo_keywords TO service_role;
GRANT ALL ON TABLE public.seo_keywords TO supabase_auth_admin;
GRANT ALL ON TABLE public.seo_not_found_log TO postgres;
GRANT ALL ON TABLE public.seo_not_found_log TO anon;
GRANT ALL ON TABLE public.seo_not_found_log TO authenticated;
GRANT ALL ON TABLE public.seo_not_found_log TO service_role;
GRANT ALL ON TABLE public.seo_redirects TO anon;
GRANT ALL ON TABLE public.seo_redirects TO authenticated;
GRANT ALL ON TABLE public.seo_redirects TO service_role;
GRANT ALL ON TABLE public.seo_redirects TO supabase_auth_admin;
GRANT ALL ON TABLE public.seo_settings TO anon;
GRANT ALL ON TABLE public.seo_settings TO authenticated;
GRANT ALL ON TABLE public.seo_settings TO service_role;
GRANT ALL ON TABLE public.seo_settings TO supabase_auth_admin;
GRANT ALL ON TABLE public.services TO anon;
GRANT ALL ON TABLE public.services TO authenticated;
GRANT ALL ON TABLE public.services TO service_role;
GRANT ALL ON TABLE public.services TO supabase_auth_admin;
GRANT ALL ON TABLE public.sso_configs TO anon;
GRANT ALL ON TABLE public.sso_configs TO authenticated;
GRANT ALL ON TABLE public.sso_configs TO service_role;
GRANT ALL ON TABLE public.sso_configs TO supabase_auth_admin;
GRANT ALL ON TABLE public.staff_availability TO anon;
GRANT ALL ON TABLE public.staff_availability TO authenticated;
GRANT ALL ON TABLE public.staff_availability TO service_role;
GRANT ALL ON TABLE public.staff_availability TO supabase_auth_admin;
GRANT ALL ON TABLE public.staff_calendar_connections TO anon;
GRANT ALL ON TABLE public.staff_calendar_connections TO authenticated;
GRANT ALL ON TABLE public.staff_calendar_connections TO service_role;
GRANT ALL ON TABLE public.staff_calendar_connections TO supabase_auth_admin;
GRANT ALL ON TABLE public.staff_hour_overrides TO anon;
GRANT ALL ON TABLE public.staff_hour_overrides TO authenticated;
GRANT ALL ON TABLE public.staff_hour_overrides TO service_role;
GRANT ALL ON TABLE public.staff_hour_overrides TO supabase_auth_admin;
GRANT ALL ON TABLE public.staff_members TO anon;
GRANT ALL ON TABLE public.staff_members TO authenticated;
GRANT ALL ON TABLE public.staff_members TO service_role;
GRANT ALL ON TABLE public.staff_members TO supabase_auth_admin;
GRANT ALL ON TABLE public.staff_time_off TO anon;
GRANT ALL ON TABLE public.staff_time_off TO authenticated;
GRANT ALL ON TABLE public.staff_time_off TO service_role;
GRANT ALL ON TABLE public.staff_time_off TO supabase_auth_admin;
GRANT ALL ON TABLE public.step_up_confirmations TO service_role;
GRANT ALL ON TABLE public.step_up_confirmations TO supabase_auth_admin;
GRANT SELECT ON TABLE public.step_up_confirmations TO authenticated;
GRANT SELECT ON TABLE public.step_up_confirmations TO anon;
GRANT ALL ON TABLE public.support_revision_reviews TO anon;
GRANT ALL ON TABLE public.support_revision_reviews TO authenticated;
GRANT ALL ON TABLE public.support_revision_reviews TO service_role;
GRANT ALL ON TABLE public.support_revision_reviews TO supabase_auth_admin;
GRANT ALL ON TABLE public.support_tickets TO anon;
GRANT ALL ON TABLE public.support_tickets TO authenticated;
GRANT ALL ON TABLE public.support_tickets TO service_role;
GRANT ALL ON TABLE public.support_tickets TO supabase_auth_admin;
GRANT ALL ON TABLE public.system_updates TO anon;
GRANT ALL ON TABLE public.system_updates TO authenticated;
GRANT ALL ON TABLE public.system_updates TO service_role;
GRANT ALL ON TABLE public.system_updates TO supabase_auth_admin;
GRANT UPDATE(status) ON TABLE public.system_updates TO service_role;
GRANT UPDATE(started_at) ON TABLE public.system_updates TO service_role;
GRANT UPDATE(finished_at) ON TABLE public.system_updates TO service_role;
GRANT UPDATE(error) ON TABLE public.system_updates TO service_role;
GRANT UPDATE(previous_tag) ON TABLE public.system_updates TO service_role;
GRANT UPDATE(log) ON TABLE public.system_updates TO service_role;
GRANT UPDATE(progress) ON TABLE public.system_updates TO service_role;
GRANT ALL ON TABLE public.tenant_blocklists TO anon;
GRANT ALL ON TABLE public.tenant_blocklists TO authenticated;
GRANT ALL ON TABLE public.tenant_blocklists TO service_role;
GRANT ALL ON TABLE public.tenant_blocklists TO supabase_auth_admin;
GRANT ALL ON TABLE public.tenant_domains TO anon;
GRANT ALL ON TABLE public.tenant_domains TO authenticated;
GRANT ALL ON TABLE public.tenant_domains TO service_role;
GRANT ALL ON TABLE public.tenant_domains TO supabase_auth_admin;
GRANT ALL ON TABLE public.tenant_tickets TO anon;
GRANT ALL ON TABLE public.tenant_tickets TO authenticated;
GRANT ALL ON TABLE public.tenant_tickets TO service_role;
GRANT ALL ON TABLE public.tenant_tickets TO supabase_auth_admin;
GRANT ALL ON TABLE public.testimonials TO anon;
GRANT ALL ON TABLE public.testimonials TO authenticated;
GRANT ALL ON TABLE public.testimonials TO service_role;
GRANT ALL ON TABLE public.testimonials TO supabase_auth_admin;
GRANT ALL ON TABLE public.theme_assets TO postgres;
GRANT ALL ON TABLE public.theme_assets TO anon;
GRANT ALL ON TABLE public.theme_assets TO authenticated;
GRANT ALL ON TABLE public.theme_assets TO service_role;
GRANT ALL ON TABLE public.user_custom_roles TO anon;
GRANT ALL ON TABLE public.user_custom_roles TO authenticated;
GRANT ALL ON TABLE public.user_custom_roles TO service_role;
GRANT ALL ON TABLE public.user_custom_roles TO supabase_auth_admin;
GRANT ALL ON TABLE public.user_sessions TO service_role;
GRANT ALL ON TABLE public.user_sessions TO supabase_auth_admin;
GRANT SELECT ON TABLE public.user_sessions TO authenticated;
GRANT SELECT ON TABLE public.user_sessions TO anon;
GRANT ALL ON TABLE public.voice_call_schedules TO anon;
GRANT ALL ON TABLE public.voice_call_schedules TO authenticated;
GRANT ALL ON TABLE public.voice_call_schedules TO service_role;
GRANT ALL ON TABLE public.voice_call_schedules TO supabase_auth_admin;
GRANT ALL ON TABLE public.waitlist TO anon;
GRANT ALL ON TABLE public.waitlist TO authenticated;
GRANT ALL ON TABLE public.waitlist TO service_role;
GRANT ALL ON TABLE public.waitlist TO supabase_auth_admin;
GRANT ALL ON TABLE public.wal_archive_state TO anon;
GRANT ALL ON TABLE public.wal_archive_state TO authenticated;
GRANT ALL ON TABLE public.wal_archive_state TO service_role;
GRANT ALL ON TABLE public.wal_archive_state TO supabase_auth_admin;
GRANT ALL ON TABLE public.wallet_ledger TO anon;
GRANT ALL ON TABLE public.wallet_ledger TO authenticated;
GRANT ALL ON TABLE public.wallet_ledger TO service_role;
GRANT ALL ON TABLE public.wallet_ledger TO supabase_auth_admin;
GRANT ALL ON TABLE public.webhook_deliveries TO anon;
GRANT ALL ON TABLE public.webhook_deliveries TO authenticated;
GRANT ALL ON TABLE public.webhook_deliveries TO service_role;
GRANT ALL ON TABLE public.webhook_deliveries TO supabase_auth_admin;
GRANT ALL ON TABLE public.workflow_runs TO anon;
GRANT ALL ON TABLE public.workflow_runs TO authenticated;
GRANT ALL ON TABLE public.workflow_runs TO service_role;
GRANT ALL ON TABLE public.workflow_runs TO supabase_auth_admin;
GRANT ALL ON TABLE public.workflows TO anon;
GRANT ALL ON TABLE public.workflows TO authenticated;
GRANT ALL ON TABLE public.workflows TO service_role;
GRANT ALL ON TABLE public.workflows TO supabase_auth_admin;
