create table if not exists public.marketplace_reviews (comment text, created_at timestamptz default now() not null, id uuid default gen_random_uuid() not null, install_id uuid not null, merchant_id uuid not null, moderation_status text default '' not null, rating bigint not null, updated_at timestamptz default now() not null, primary key (id));
alter table public.marketplace_reviews add constraint marketplace_reviews_install_id_fkey foreign key (install_id) references public.marketplace_installs(id) on delete cascade;
alter table public.marketplace_reviews add constraint marketplace_reviews_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create table if not exists public.order_amendments (actor_id uuid, after_totals jsonb not null, before_totals jsonb not null, created_at timestamptz default now() not null, currency_code text not null, delta_minor_int bigint not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, order_id uuid not null, reason text not null, primary key (id));
alter table public.order_amendments add constraint order_amendments_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.order_amendments add constraint order_amendments_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
create table if not exists public.order_events (created_at timestamptz default now() not null, event_type text not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, note text, order_id uuid not null, primary key (id));
alter table public.order_events add constraint order_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.order_events add constraint order_events_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
create table if not exists public.order_invoices (business_bin text, created_at timestamptz default now() not null, currency_code text default 'BDT' not null, discount_minor_int bigint default 0 not null, id uuid default gen_random_uuid() not null, invoice_number text not null, issued_at timestamptz default now() not null, merchant_id uuid not null, order_id uuid not null, sequence_no bigint not null, sequence_year bigint not null, shipping_minor_int bigint default 0 not null, subtotal_minor_int bigint not null, total_minor_int bigint not null, vat_minor_int bigint default 0 not null, vat_rate_basis_points bigint default 0 not null, primary key (id));
alter table public.order_invoices add constraint order_invoices_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.order_invoices add constraint order_invoices_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
create table if not exists public.payments (amount_minor_int bigint default 0 not null, created_at timestamptz default now() not null, currency_code text default 'BDT' not null, id uuid default gen_random_uuid() not null, idempotency_key text not null, merchant_id uuid not null, order_id uuid not null, payment_provider text not null, payment_status text default '' not null, provider_reference text, updated_at timestamptz default now() not null, primary key (id));
alter table public.payments add constraint payments_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.payments add constraint payments_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
create table if not exists public.pos_orders (address_line text, auth_code text, captured_at timestamptz default now() not null, city text, client_id uuid not null, created_at timestamptz default now() not null, currency_code text default 'BDT' not null, customer_name text, customer_phone text, discount_minor_int bigint default 0 not null, id uuid default gen_random_uuid() not null, items jsonb default '{}'::jsonb not null, merchant_id uuid not null, order_id uuid, origin public.pos_origin default 'offline'::public.pos_origin not null, payment_method public.pos_payment_method default 'cash'::public.pos_payment_method not null, session_id uuid, status public.pos_order_status default 'local_pending'::public.pos_order_status not null, subtotal_minor_int bigint default 0 not null, total_minor_int bigint default 0 not null, updated_at timestamptz default now() not null, primary key (id));
alter table public.pos_orders add constraint pos_orders_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.pos_orders add constraint pos_orders_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
alter table public.pos_orders add constraint pos_orders_session_id_fkey foreign key (session_id) references public.pos_sessions(id) on delete set null;
create table if not exists public.product_bundles (active boolean default false not null, created_at timestamptz default now() not null, currency_code text default 'BDT' not null, fixed_price_minor_int bigint, id uuid default gen_random_uuid() not null, merchant_id uuid not null, percent_off bigint default 0 not null, pricing_mode text default '' not null, product_id uuid not null, updated_at timestamptz default now() not null, primary key (id));
alter table public.product_bundles add constraint product_bundles_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.product_bundles add constraint product_bundles_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;
create table if not exists public.product_reviews (author_name text default '' not null, body text default '' not null, created_at timestamptz default now() not null, customer_id uuid, id uuid default gen_random_uuid() not null, merchant_id uuid not null, moderation_note text, product_id uuid not null, published_at timestamptz, rating bigint not null, status public.review_status default 'pending'::public.review_status not null, title text default '' not null, updated_at timestamptz default now() not null, verified_purchase boolean default false not null, primary key (id));
alter table public.product_reviews add constraint product_reviews_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete set null;
alter table public.product_reviews add constraint product_reviews_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.product_reviews add constraint product_reviews_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;
create table if not exists public.product_variants (barcode text, compare_at_amount_minor_int bigint, created_at timestamptz default now() not null, currency_code text default 'BDT' not null, deleted_at timestamptz, id uuid default gen_random_uuid() not null, merchant_id uuid not null, name text default '' not null, position bigint default 0 not null, price_amount_minor_int bigint default 0 not null, product_id uuid not null, sku text, stock_quantity bigint default 0 not null, updated_at timestamptz default now() not null, primary key (id));
alter table public.product_variants add constraint product_variants_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.product_variants add constraint product_variants_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;
create table if not exists public.refunds (amount_minor_int bigint not null, attempt bigint default 0 not null, created_at timestamptz default now() not null, currency_code text default 'BDT' not null, failure_code text, id uuid default gen_random_uuid() not null, merchant_id uuid not null, method public.payment_method, order_id uuid not null, payment_provider text, provider_reference text, reason text, refund_key text not null, requested_by uuid, settled_at timestamptz, status text default '' not null, updated_at timestamptz default now() not null, primary key (id));
alter table public.refunds add constraint refunds_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.refunds add constraint refunds_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
create table if not exists public.service_offerings (advance_booking_days bigint default 0 not null, buffer_minutes bigint default 0 not null, cancellation_hours bigint default 0 not null, capacity_per_slot bigint default 0 not null, created_at timestamptz default now() not null, duration_minutes bigint default 0 not null, id uuid default gen_random_uuid() not null, location_kind text default '' not null, merchant_id uuid not null, product_id uuid not null, updated_at timestamptz default now() not null, primary key (id));
alter table public.service_offerings add constraint service_offerings_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.service_offerings add constraint service_offerings_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;
create table if not exists public.shipment_quotes (amount_minor_int bigint default 0 not null, breakdown jsonb default '{}'::jsonb not null, carrier_code text not null, cod_fee_minor_int bigint default 0 not null, created_at timestamptz default now() not null, currency_code text default 'BDT' not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, order_id uuid, rule_id uuid, stale boolean default false not null, weight_grams bigint default 0 not null, zone_id uuid, primary key (id));
alter table public.shipment_quotes add constraint shipment_quotes_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.shipment_quotes add constraint shipment_quotes_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
alter table public.shipment_quotes add constraint shipment_quotes_rule_id_fkey foreign key (rule_id) references public.shipping_rate_rules(id) on delete set null;
alter table public.shipment_quotes add constraint shipment_quotes_zone_id_fkey foreign key (zone_id) references public.shipping_zones(id) on delete set null;
create table if not exists public.store_themes (created_at timestamptz default now() not null, id uuid default gen_random_uuid() not null, is_active boolean default false not null, merchant_id uuid not null, name text not null, published_version_id uuid, source_install_id uuid, source_listing_id uuid, source_listing_slug text, source_version text, updated_at timestamptz default now() not null, primary key (id));
alter table public.store_themes add constraint store_themes_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.store_themes add constraint store_themes_published_version_id_fkey foreign key (published_version_id) references public.theme_versions(id) on delete set null;
alter table public.store_themes add constraint store_themes_source_install_id_fkey foreign key (source_install_id) references public.marketplace_installs(id) on delete set null;
create table if not exists public.webhook_events (amount_minor_int bigint, attempt bigint default 0 not null, created_at timestamptz default now() not null, currency_code text default 'BDT' not null, event_type text not null, id uuid default gen_random_uuid() not null, merchant_id uuid, order_id uuid, payload jsonb default '{}'::jsonb not null, processed_at timestamptz, provider text not null, reason text, received_at timestamptz default now() not null, redelivery_count bigint default 0 not null, result jsonb default '{}'::jsonb not null, status text default '' not null, updated_at timestamptz default now() not null, webhook_id uuid not null, primary key (id));
alter table public.webhook_events add constraint webhook_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete set null;
alter table public.webhook_events add constraint webhook_events_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
create table if not exists public.ai_messages (body text not null, conversation_id uuid not null, created_at timestamptz default now() not null, flagged boolean default false not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, role public.ai_message_role not null, primary key (id));
alter table public.ai_messages add constraint ai_messages_conversation_id_fkey foreign key (conversation_id) references public.ai_conversations(id) on delete cascade;
alter table public.ai_messages add constraint ai_messages_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create table if not exists public.bundle_items (bundle_id uuid not null, created_at timestamptz default now() not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, quantity bigint default 0 not null, variant_id uuid not null, primary key (id));
alter table public.bundle_items add constraint bundle_items_bundle_id_fkey foreign key (bundle_id) references public.product_bundles(id) on delete cascade;
alter table public.bundle_items add constraint bundle_items_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.bundle_items add constraint bundle_items_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete cascade;
create table if not exists public.carrier_shipments (address_line text, attempt_count bigint default 0 not null, awb text, cancelled_at timestamptz, carrier_code text not null, carrier_id uuid, city text, cod_amount_minor_int bigint default 0 not null, created_at timestamptz default now() not null, currency_code text default 'BDT' not null, delivered_at timestamptz, id uuid default gen_random_uuid() not null, is_cod boolean default false not null, last_event_at timestamptz, merchant_id uuid not null, order_id uuid, pickup_slot_end text, pickup_slot_start text, pos_order_id uuid, pudo_point text, quote_id uuid, quote_stale boolean default false not null, rate_minor_int bigint default 0 not null, signature_text text, status public.shipment_status default 'created'::public.shipment_status not null, tracking_token text default '' not null, tracking_url text, updated_at timestamptz default now() not null, weight_grams bigint default 0 not null, zone_id uuid, primary key (id));
alter table public.carrier_shipments add constraint carrier_shipments_carrier_id_fkey foreign key (carrier_id) references public.carriers(id) on delete set null;
alter table public.carrier_shipments add constraint carrier_shipments_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.carrier_shipments add constraint carrier_shipments_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
alter table public.carrier_shipments add constraint carrier_shipments_pos_order_id_fkey foreign key (pos_order_id) references public.pos_orders(id) on delete set null;
alter table public.carrier_shipments add constraint carrier_shipments_quote_id_fkey foreign key (quote_id) references public.shipment_quotes(id) on delete set null;
alter table public.carrier_shipments add constraint carrier_shipments_zone_id_fkey foreign key (zone_id) references public.shipping_zones(id) on delete set null;
create table if not exists public.charge_intent_events (created_at timestamptz default now() not null, detail jsonb default '{}'::jsonb not null, from_status text default '' not null, id uuid default gen_random_uuid() not null, intent_id uuid not null, merchant_id uuid not null, to_status public.charge_intent_status not null, primary key (id));
alter table public.charge_intent_events add constraint charge_intent_events_intent_id_fkey foreign key (intent_id) references public.charge_intents(id) on delete cascade;
alter table public.charge_intent_events add constraint charge_intent_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create table if not exists public.customer_wishlist_items (created_at timestamptz default now() not null, customer_id uuid not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, product_variant_id uuid not null, stock_alert boolean default false not null, primary key (id));
alter table public.customer_wishlist_items add constraint customer_wishlist_items_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete cascade;
alter table public.customer_wishlist_items add constraint customer_wishlist_items_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.customer_wishlist_items add constraint customer_wishlist_items_product_variant_id_fkey foreign key (product_variant_id) references public.product_variants(id) on delete cascade;
create table if not exists public.digital_assets (content_type text default '' not null, created_at timestamptz default now() not null, deleted_at timestamptz, expiry_hours bigint default 0 not null, file_name text not null, id uuid default gen_random_uuid() not null, max_downloads bigint default 0 not null, merchant_id uuid not null, product_id uuid not null, size_bytes bigint default 0 not null, storage_path text not null, updated_at timestamptz default now() not null, variant_id uuid, primary key (id));
alter table public.digital_assets add constraint digital_assets_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.digital_assets add constraint digital_assets_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;
alter table public.digital_assets add constraint digital_assets_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete set null;
create table if not exists public.dispute_events (actor text, created_at timestamptz default now() not null, dispute_id uuid not null, from_status public.dispute_status, id uuid default gen_random_uuid() not null, merchant_id uuid not null, note text, to_status public.dispute_status not null, primary key (id));
alter table public.dispute_events add constraint dispute_events_dispute_id_fkey foreign key (dispute_id) references public.disputes(id) on delete cascade;
alter table public.dispute_events add constraint dispute_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create table if not exists public.fraud_audit (action text not null, actor text, case_id uuid, created_at timestamptz default now() not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, payload jsonb default '{}'::jsonb not null, primary key (id));
alter table public.fraud_audit add constraint fraud_audit_case_id_fkey foreign key (case_id) references public.fraud_cases(id) on delete set null;
alter table public.fraud_audit add constraint fraud_audit_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create table if not exists public.inventory_levels (created_at timestamptz default now() not null, id uuid default gen_random_uuid() not null, location_id uuid not null, low_stock_threshold bigint, merchant_id uuid not null, on_hand bigint default 0 not null, reserved bigint default 0 not null, updated_at timestamptz default now() not null, variant_id uuid not null, primary key (id));
alter table public.inventory_levels add constraint inventory_levels_location_id_fkey foreign key (location_id) references public.inventory_locations(id) on delete cascade;
alter table public.inventory_levels add constraint inventory_levels_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.inventory_levels add constraint inventory_levels_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete cascade;
create table if not exists public.inventory_transfer_items (created_at timestamptz default now() not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, quantity bigint not null, transfer_id uuid not null, variant_id uuid not null, primary key (id));
alter table public.inventory_transfer_items add constraint inventory_transfer_items_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.inventory_transfer_items add constraint inventory_transfer_items_transfer_id_fkey foreign key (transfer_id) references public.inventory_transfers(id) on delete cascade;
alter table public.inventory_transfer_items add constraint inventory_transfer_items_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete cascade;
create table if not exists public.order_items (created_at timestamptz default now() not null, id uuid default gen_random_uuid() not null, line_total_minor_int bigint not null, merchant_id uuid not null, order_id uuid not null, product_title text not null, quantity bigint not null, sku text, unit_price_minor_int bigint not null, variant_id uuid, variant_name text default '' not null, primary key (id));
alter table public.order_items add constraint order_items_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.order_items add constraint order_items_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
alter table public.order_items add constraint order_items_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete set null;
create table if not exists public.pos_payments (amount_minor_int bigint not null, auth_code text, change_minor_int bigint default 0 not null, created_at timestamptz default now() not null, currency_code text default 'BDT' not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, method public.pos_payment_method not null, pos_order_id uuid not null, tendered_minor_int bigint default 0 not null, primary key (id));
alter table public.pos_payments add constraint pos_payments_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.pos_payments add constraint pos_payments_pos_order_id_fkey foreign key (pos_order_id) references public.pos_orders(id) on delete cascade;
create table if not exists public.pos_refunds (amount_minor_int bigint not null, created_at timestamptz default now() not null, currency_code text default 'BDT' not null, id uuid default gen_random_uuid() not null, idempotency_key text not null, lines jsonb default '{}'::jsonb not null, merchant_id uuid not null, method public.pos_payment_method not null, pos_order_id uuid not null, reason text, restock boolean default false not null, session_id uuid, staff_user_id uuid, primary key (id));
alter table public.pos_refunds add constraint pos_refunds_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.pos_refunds add constraint pos_refunds_pos_order_id_fkey foreign key (pos_order_id) references public.pos_orders(id) on delete cascade;
alter table public.pos_refunds add constraint pos_refunds_session_id_fkey foreign key (session_id) references public.pos_sessions(id) on delete set null;
create table if not exists public.return_requests (created_at timestamptz default now() not null, currency_code text default 'BDT' not null, customer_note text, decided_at timestamptz, decided_by uuid, id uuid default gen_random_uuid() not null, merchant_id uuid not null, order_id uuid not null, reason text not null, reference text not null, refund_id uuid, refund_minor_int bigint default 0 not null, staff_note text, status public.return_status not null, updated_at timestamptz default now() not null, primary key (id));
alter table public.return_requests add constraint return_requests_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.return_requests add constraint return_requests_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
alter table public.return_requests add constraint return_requests_refund_id_fkey foreign key (refund_id) references public.refunds(id) on delete set null;
create table if not exists public.review_replies (body text not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, published_at timestamptz default now() not null, review_id uuid not null, staff_user_id uuid not null, primary key (id));
alter table public.review_replies add constraint review_replies_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.review_replies add constraint review_replies_review_id_fkey foreign key (review_id) references public.product_reviews(id) on delete cascade;
create table if not exists public.settlement_items (created_at timestamptz default now() not null, currency_code text default 'BDT' not null, fee_minor_int bigint default 0 not null, file_id uuid not null, gross_minor_int bigint not null, id uuid default gen_random_uuid() not null, match_kind text default '' not null, merchant_id uuid not null, net_minor_int bigint not null, order_id uuid, payment_id uuid, posted boolean default false not null, settlement_ref text not null, primary key (id));
alter table public.settlement_items add constraint settlement_items_file_id_fkey foreign key (file_id) references public.settlement_files(id) on delete cascade;
alter table public.settlement_items add constraint settlement_items_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.settlement_items add constraint settlement_items_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
alter table public.settlement_items add constraint settlement_items_payment_id_fkey foreign key (payment_id) references public.payments(id) on delete set null;
create table if not exists public.stock_holds (checkout_token text not null, consumed_at timestamptz, created_at timestamptz default now() not null, expires_at timestamptz not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, order_id uuid, quantity bigint not null, released_at timestamptz, variant_id uuid not null, primary key (id));
alter table public.stock_holds add constraint stock_holds_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.stock_holds add constraint stock_holds_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
alter table public.stock_holds add constraint stock_holds_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete cascade;
create table if not exists public.subscription_terms (billing_anchor_day bigint, created_at timestamptz default now() not null, id uuid default gen_random_uuid() not null, interval_count bigint default 0 not null, interval_unit text default '' not null, merchant_id uuid not null, minimum_cycles bigint default 0 not null, trial_days bigint default 0 not null, updated_at timestamptz default now() not null, variant_id uuid not null, primary key (id));
alter table public.subscription_terms add constraint subscription_terms_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.subscription_terms add constraint subscription_terms_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete cascade;
create table if not exists public.theme_drafts (merchant_id uuid not null, revision bigint default 0 not null, templates jsonb default '{}'::jsonb not null, theme_id uuid not null, tokens jsonb default '{}'::jsonb not null, updated_at timestamptz default now() not null, updated_by uuid);
alter table public.theme_drafts add constraint theme_drafts_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.theme_drafts add constraint theme_drafts_theme_id_fkey foreign key (theme_id) references public.store_themes(id) on delete cascade;
create table if not exists public.theme_versions (ast jsonb default '{}'::jsonb not null, checksum text, created_at timestamptz default now() not null, created_by uuid, id uuid default gen_random_uuid() not null, label text, merchant_id uuid not null, note text, published_at timestamptz, rollback_of text, source_registry_key text, source_registry_version text, status text default '' not null, templates jsonb default '{}'::jsonb not null, theme_id uuid not null, tokens jsonb default '{}'::jsonb not null, version bigint not null, primary key (id));
alter table public.theme_versions add constraint theme_versions_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.theme_versions add constraint theme_versions_rollback_of_fkey foreign key (rollback_of) references public.theme_versions(id) on delete set null;
alter table public.theme_versions add constraint theme_versions_theme_id_fkey foreign key (theme_id) references public.store_themes(id) on delete cascade;
create table if not exists public.cod_settlements (carrier_code text not null, created_at timestamptz default now() not null, currency_code text default 'BDT' not null, expected_minor_int bigint default 0 not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, note text, order_id uuid, reference text, reported_minor_int bigint, resolved_at timestamptz, resolved_by uuid, shipment_id uuid not null, state public.cod_settlement_state not null, updated_at timestamptz default now() not null, primary key (id));
alter table public.cod_settlements add constraint cod_settlements_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.cod_settlements add constraint cod_settlements_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
alter table public.cod_settlements add constraint cod_settlements_shipment_id_fkey foreign key (shipment_id) references public.carrier_shipments(id) on delete cascade;
create table if not exists public.courier_labels (created_at timestamptz default now() not null, id uuid default gen_random_uuid() not null, label_url text not null, merchant_id uuid not null, printable boolean default false not null, shipment_id uuid not null, primary key (id));
alter table public.courier_labels add constraint courier_labels_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.courier_labels add constraint courier_labels_shipment_id_fkey foreign key (shipment_id) references public.carrier_shipments(id) on delete cascade;
create table if not exists public.courier_webhook_events (attempts bigint default 0 not null, carrier_code text not null, event_id uuid not null, id uuid default gen_random_uuid() not null, merchant_id uuid, next_attempt_at timestamptz, payload jsonb default '{}'::jsonb not null, processed_at timestamptz, reason text, received_at timestamptz default now() not null, shipment_id uuid, status public.courier_event_status not null, primary key (id));
alter table public.courier_webhook_events add constraint courier_webhook_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete set null;
alter table public.courier_webhook_events add constraint courier_webhook_events_shipment_id_fkey foreign key (shipment_id) references public.carrier_shipments(id) on delete set null;
create table if not exists public.delivery_events (carrier_event_id uuid, created_at timestamptz default now() not null, event_type text not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, occurred_at timestamptz default now() not null, payload jsonb default '{}'::jsonb not null, shipment_id uuid not null, source text default '' not null, primary key (id));
alter table public.delivery_events add constraint delivery_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.delivery_events add constraint delivery_events_shipment_id_fkey foreign key (shipment_id) references public.carrier_shipments(id) on delete cascade;
create table if not exists public.digital_grants (asset_id uuid not null, created_at timestamptz default now() not null, customer_id uuid, downloads_used bigint default 0 not null, expires_at timestamptz not null, id uuid default gen_random_uuid() not null, last_download_at timestamptz, max_downloads bigint default 0 not null, merchant_id uuid not null, order_id uuid, revoked_at timestamptz, token_hash text not null, primary key (id));
alter table public.digital_grants add constraint digital_grants_asset_id_fkey foreign key (asset_id) references public.digital_assets(id) on delete cascade;
alter table public.digital_grants add constraint digital_grants_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete set null;
alter table public.digital_grants add constraint digital_grants_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.digital_grants add constraint digital_grants_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
create table if not exists public.fulfilment_items (created_at timestamptz default now() not null, fulfilment_id uuid not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, order_item_id uuid not null, quantity bigint not null, primary key (id));
alter table public.fulfilment_items add constraint fulfilment_items_fulfilment_id_fkey foreign key (fulfilment_id) references public.fulfilments(id) on delete cascade;
alter table public.fulfilment_items add constraint fulfilment_items_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.fulfilment_items add constraint fulfilment_items_order_item_id_fkey foreign key (order_item_id) references public.order_items(id) on delete cascade;
create table if not exists public.return_events (actor text, created_at timestamptz default now() not null, from_status public.return_status, id uuid default gen_random_uuid() not null, merchant_id uuid not null, reason text, return_id uuid not null, to_status public.return_status not null, primary key (id));
alter table public.return_events add constraint return_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.return_events add constraint return_events_return_id_fkey foreign key (return_id) references public.return_requests(id) on delete cascade;
create table if not exists public.return_items (amount_minor_int bigint default 0 not null, created_at timestamptz default now() not null, id uuid default gen_random_uuid() not null, merchant_id uuid not null, order_item_id uuid not null, quantity bigint not null, restock boolean default false not null, return_id uuid not null, primary key (id));
alter table public.return_items add constraint return_items_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.return_items add constraint return_items_order_item_id_fkey foreign key (order_item_id) references public.order_items(id) on delete cascade;
alter table public.return_items add constraint return_items_return_id_fkey foreign key (return_id) references public.return_requests(id) on delete cascade;
create table if not exists public.settlement_variance_alerts (actual_minor_int bigint default 0 not null, created_at timestamptz default now() not null, expected_minor_int bigint default 0 not null, file_id uuid not null, id uuid default gen_random_uuid() not null, item_id uuid, kind text not null, merchant_id uuid not null, resolution_note text, resolved boolean default false not null, resolved_at timestamptz, resolved_by uuid, primary key (id));
alter table public.settlement_variance_alerts add constraint settlement_variance_alerts_file_id_fkey foreign key (file_id) references public.settlement_files(id) on delete cascade;
alter table public.settlement_variance_alerts add constraint settlement_variance_alerts_item_id_fkey foreign key (item_id) references public.settlement_items(id) on delete set null;
alter table public.settlement_variance_alerts add constraint settlement_variance_alerts_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create table if not exists public.theme_schedules (action text not null, attempts bigint default 0 not null, completed_at timestamptz, created_at timestamptz default now() not null, created_by uuid, id uuid default gen_random_uuid() not null, last_error text, merchant_id uuid not null, run_at timestamptz not null, state text default '' not null, theme_id uuid not null, version_id uuid, primary key (id));
alter table public.theme_schedules add constraint theme_schedules_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.theme_schedules add constraint theme_schedules_theme_id_fkey foreign key (theme_id) references public.store_themes(id) on delete cascade;
alter table public.theme_schedules add constraint theme_schedules_version_id_fkey foreign key (version_id) references public.theme_versions(id) on delete set null;

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

