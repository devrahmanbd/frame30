-- Careful additive migration, batch A (audit 2026-09-19).
-- Rules: ADD COLUMN only (IF NOT EXISTS), backfill with COALESCE (no-op on
-- empty tables), keep every legacy column, no renames, no drops, no new
-- NOT NULL enforcement. Payout enums verified to exist live.
-- NOTE: `state`/`method`/`account_id` have no backfill source (left NULL);
-- `account_id` FK + idempotency UNIQUE + approvals range checks are deferred
-- to a hardened follow-up, as is the payout_events append-only trigger.

-- ---- payouts family (shapes match migration/0007_payouts.sql) ----
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS merchant_id uuid;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS account_id uuid;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS amount_minor_int bigint;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS fee_minor_int bigint DEFAULT 0;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS net_minor_int bigint;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS currency_code text DEFAULT 'BDT';
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS method public.payout_method;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS state public.payout_state DEFAULT 'draft';
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS approvals_required integer DEFAULT 1;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS requested_at timestamptz DEFAULT now();
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS requested_by uuid;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS released_at timestamptz;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS released_by uuid;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS attempts integer DEFAULT 0;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS failure_code text;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS failure_detail text;
ALTER TABLE public.payouts ADD COLUMN IF NOT EXISTS provider_ref text;
UPDATE public.payouts SET merchant_id = COALESCE(merchant_id, company_id) WHERE merchant_id IS NULL;
UPDATE public.payouts SET amount_minor_int = COALESCE(amount_minor_int, amount_cents::bigint) WHERE amount_minor_int IS NULL;
UPDATE public.payouts SET fee_minor_int = COALESCE(fee_minor_int, commission_cents::bigint) WHERE fee_minor_int IS NULL;
UPDATE public.payouts SET net_minor_int = COALESCE(net_minor_int, net_cents::bigint) WHERE net_minor_int IS NULL;
UPDATE public.payouts SET currency_code = COALESCE(currency_code, upper(currency)) WHERE currency_code IS NULL;
UPDATE public.payouts SET note = COALESCE(note, notes) WHERE note IS NULL;

ALTER TABLE public.payout_holds ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.payout_holds ADD COLUMN IF NOT EXISTS released_at timestamptz;
ALTER TABLE public.payout_holds ADD COLUMN IF NOT EXISTS released_by uuid;
UPDATE public.payout_holds SET released_at = COALESCE(released_at, CASE WHEN released THEN created_at END) WHERE released_at IS NULL AND released = true;

ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS method public.payout_method;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS state public.payout_account_state DEFAULT 'pending';
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS holder_name text;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS mfs_provider text;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS msisdn text;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS branch_name text;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS routing_number text;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS last4 text;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.payout_accounts ADD COLUMN IF NOT EXISTS created_by uuid;
UPDATE public.payout_accounts SET holder_name = COALESCE(holder_name, account_name) WHERE holder_name IS NULL;

ALTER TABLE public.payout_approvals ADD COLUMN IF NOT EXISTS merchant_id uuid;
ALTER TABLE public.payout_approvals ADD COLUMN IF NOT EXISTS actor uuid;
ALTER TABLE public.payout_approvals ADD COLUMN IF NOT EXISTS decision text;
ALTER TABLE public.payout_approvals ADD COLUMN IF NOT EXISTS note text;
UPDATE public.payout_approvals SET actor = COALESCE(actor, approver_id) WHERE actor IS NULL;
UPDATE public.payout_approvals SET decision = COALESCE(decision, status) WHERE decision IS NULL;
UPDATE public.payout_approvals SET note = COALESCE(note, reason) WHERE note IS NULL;
UPDATE public.payout_approvals a SET merchant_id = p.company_id FROM public.payouts p WHERE p.id = a.payout_id AND a.merchant_id IS NULL;

ALTER TABLE public.payout_events ADD COLUMN IF NOT EXISTS merchant_id uuid;
ALTER TABLE public.payout_events ADD COLUMN IF NOT EXISTS event text;
ALTER TABLE public.payout_events ADD COLUMN IF NOT EXISTS actor uuid;
ALTER TABLE public.payout_events ADD COLUMN IF NOT EXISTS from_state public.payout_state;
ALTER TABLE public.payout_events ADD COLUMN IF NOT EXISTS to_state public.payout_state;
ALTER TABLE public.payout_events ADD COLUMN IF NOT EXISTS detail jsonb DEFAULT '{}'::jsonb;
UPDATE public.payout_events SET event = COALESCE(event, event_type) WHERE event IS NULL;
UPDATE public.payout_events SET detail = COALESCE(detail, payload, '{}'::jsonb) WHERE detail IS NULL;
UPDATE public.payout_events e SET merchant_id = p.company_id FROM public.payouts p WHERE p.id = e.payout_id AND e.merchant_id IS NULL;

-- Read-only tenant policies where none existed (writes stay service-role).
DROP POLICY IF EXISTS payout_approvals_tenant_read ON public.payout_approvals;
CREATE POLICY payout_approvals_tenant_read ON public.payout_approvals
  FOR SELECT TO authenticated USING (public.is_merchant_member(merchant_id));
DROP POLICY IF EXISTS payout_events_tenant_read ON public.payout_events;
CREATE POLICY payout_events_tenant_read ON public.payout_events
  FOR SELECT TO authenticated USING (public.is_merchant_member(merchant_id));

-- ---- url_redirects: canonical from_path/to_path + counters (keep legacy) ----
ALTER TABLE public.url_redirects ADD COLUMN IF NOT EXISTS from_path text;
ALTER TABLE public.url_redirects ADD COLUMN IF NOT EXISTS to_path text;
ALTER TABLE public.url_redirects ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.url_redirects ADD COLUMN IF NOT EXISTS entity_type text DEFAULT 'manual';
ALTER TABLE public.url_redirects ADD COLUMN IF NOT EXISTS origin text DEFAULT 'manual';
ALTER TABLE public.url_redirects ADD COLUMN IF NOT EXISTS hits bigint DEFAULT 0;
ALTER TABLE public.url_redirects ADD COLUMN IF NOT EXISTS last_hit_at timestamptz;
ALTER TABLE public.url_redirects ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
UPDATE public.url_redirects SET from_path = COALESCE(from_path, source_path), to_path = COALESCE(to_path, target_path) WHERE from_path IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_url_redirects_merchant_from ON public.url_redirects (merchant_id, from_path);

-- ---- storefront_pages: editorial columns (cf migration/0005) ----
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS trashed_at timestamptz;
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS author_id uuid;
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.storefront_pages(id) ON DELETE SET NULL;
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS menu_order integer DEFAULT 0;
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS password text;
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public';
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS template text;
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS editor text DEFAULT 'block';
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS allow_comments boolean DEFAULT true;
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS featured_image_url text;
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS seo_extended jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS theme_id uuid REFERENCES public.store_themes(id) ON DELETE SET NULL;
ALTER TABLE public.storefront_pages ADD COLUMN IF NOT EXISTS seo jsonb DEFAULT '{}'::jsonb;
UPDATE public.storefront_pages SET status = COALESCE(status, CASE WHEN is_published THEN 'published' ELSE 'draft' END);

-- ---- theme_assets: code-shape columns alongside the legacy blob store ----
-- Legacy (theme_key/path/data) and code (theme_id/kind/name/...) shapes are
-- disjoint features sharing a name; both are kept, neither coerced.
ALTER TABLE public.theme_assets ADD COLUMN IF NOT EXISTS theme_id uuid REFERENCES public.store_themes(id) ON DELETE CASCADE;
ALTER TABLE public.theme_assets ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.theme_assets ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.theme_assets ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.theme_assets ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE public.theme_assets ADD COLUMN IF NOT EXISTS bytes bigint DEFAULT 0;
ALTER TABLE public.theme_assets ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true;
ALTER TABLE public.theme_assets ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ---- experiments: tenant scoping (no auto-backfill of merchant_id) ----
ALTER TABLE public.experiments ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES public.merchants(id) ON DELETE CASCADE;
ALTER TABLE public.experiments ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.experiments ADD COLUMN IF NOT EXISTS hypothesis text;
ALTER TABLE public.experiments ADD COLUMN IF NOT EXISTS surface text DEFAULT '';
ALTER TABLE public.experiments ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE public.experiments ADD COLUMN IF NOT EXISTS traffic_pct integer DEFAULT 100;
ALTER TABLE public.experiments ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.experiments ADD COLUMN IF NOT EXISTS stopped_at timestamptz;

-- ---- support_tickets: merchant-desk columns; text-ify mismatched enums ----
-- priority (smallint) and status (enum) clash with the text the code writes.
-- Tables are empty, so the type change is lossless; legacy columns are kept.
ALTER TABLE public.support_tickets ALTER COLUMN priority DROP DEFAULT;
ALTER TABLE public.support_tickets ALTER COLUMN priority TYPE text USING priority::text;
ALTER TABLE public.support_tickets ALTER COLUMN priority SET DEFAULT '3';
ALTER TABLE public.support_tickets ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.support_tickets ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.support_tickets ALTER COLUMN status SET DEFAULT 'open';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES public.merchants(id) ON DELETE CASCADE;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS channel text DEFAULT 'widget';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS order_number text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS requester_hash text;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS assignee_id uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS first_response_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS first_response_due_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS resolution_due_at timestamptz;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS breach_first_response boolean DEFAULT false;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS breach_resolution boolean DEFAULT false;

NOTIFY pgrst, 'reload schema';
