-- =====================================================================
-- Phase 2.5 — Billing, Platform Charges & Gift Cards Routines
-- =====================================================================

-- Ensure platform_charges table exists
create table if not exists public.platform_charges (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  method text not null,
  amount_minor_int bigint not null,
  currency_code text not null default 'BDT',
  status text not null default 'created',
  attempt integer not null default 1,
  idempotency_key text not null unique,
  provider_reference text,
  return_nonce text not null default encode(gen_random_bytes(16), 'hex'),
  failure_code text,
  receipt_number text,
  expires_at timestamp with time zone not null default (now() + interval '30 minutes'),
  settled_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index if not exists idx_platform_charges_invoice on public.platform_charges(invoice_id);
create index if not exists idx_platform_charges_merchant on public.platform_charges(merchant_id);

-- 1. platform_charge_open
create or replace function public.platform_charge_open(
  _merchant_id uuid,
  _invoice_id uuid,
  _method text,
  _idempotency_key text,
  _ttl_seconds integer default 1800
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing record;
  v_invoice record;
  v_attempt int;
  v_charge record;
begin
  select * into v_existing from public.platform_charges where idempotency_key = _idempotency_key;
  if v_existing.id is not null then
    return to_jsonb(v_existing);
  end if;

  select * into v_invoice from public.invoices where id = _invoice_id and merchant_id = _merchant_id;
  if v_invoice.id is null then
    raise exception 'platform.invoice_not_found' using errcode = 'P0002';
  end if;

  if v_invoice.status = 'paid' then
    raise exception 'platform.invoice_already_paid' using errcode = '23505';
  end if;

  if v_invoice.status <> 'open' then
    raise exception 'platform.invoice_not_chargeable' using errcode = '22023';
  end if;

  select count(*) into v_attempt from public.platform_charges where invoice_id = _invoice_id;
  v_attempt := v_attempt + 1;

  if v_attempt > 10 then
    raise exception 'platform.attempts_exhausted' using errcode = '22023';
  end if;

  insert into public.platform_charges (
    merchant_id, invoice_id, method, amount_minor_int, currency_code,
    status, attempt, idempotency_key, expires_at
  ) values (
    _merchant_id, _invoice_id, _method, v_invoice.total_minor_int, v_invoice.currency_code,
    'created', v_attempt, _idempotency_key, now() + (_ttl_seconds || ' seconds')::interval
  )
  returning * into v_charge;

  return to_jsonb(v_charge);
end $$;

-- 2. platform_charge_settle
create or replace function public.platform_charge_settle(
  _charge_id uuid,
  _status text,
  _provider_reference text default null,
  _failure_code text default null,
  _actor text default 'system',
  _receipt_number text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_charge record;
begin
  select * into v_charge from public.platform_charges where id = _charge_id for update;
  if v_charge.id is null then
    raise exception 'platform.charge_not_found' using errcode = 'P0002';
  end if;

  -- Terminal state idempotency
  if v_charge.status in ('paid', 'cancelled', 'expired') and _status <> v_charge.status then
    return to_jsonb(v_charge);
  end if;

  update public.platform_charges
     set status = _status,
         provider_reference = coalesce(_provider_reference, provider_reference),
         failure_code = coalesce(_failure_code, failure_code),
         receipt_number = coalesce(_receipt_number, receipt_number),
         settled_at = (case when _status in ('paid', 'failed', 'cancelled', 'expired') then now() else settled_at end),
         updated_at = now()
   where id = _charge_id
  returning * into v_charge;

  if _status = 'paid' then
    update public.invoices
       set status = 'paid', paid_at = now(), updated_at = now()
     where id = v_charge.invoice_id;

    update public.subscriptions
       set status = 'active',
           current_period_start = to_char(now(), 'YYYY-MM-DD'),
           next_billing_at = now() + interval '30 days',
           past_due_since = null,
           dunning_stage = 0,
           updated_at = now()
     where merchant_id = v_charge.merchant_id;
  end if;

  return to_jsonb(v_charge);
end $$;

-- 3. billing_vat_bp() -> integer
create or replace function public.billing_vat_bp()
returns integer language sql stable security definer set search_path = public as $$
  select 500; -- 5% VAT
$$;

-- 4. billing_plan_preview
create or replace function public.billing_plan_preview(
  _merchant_id uuid,
  _target public.billing_plan
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sub record;
  v_plan record;
  v_vat_bp int := 500;
  v_subtotal bigint;
  v_vat bigint;
  v_total bigint;
begin
  select * into v_sub from public.subscriptions where merchant_id = _merchant_id;
  if v_sub.id is null then
    raise exception 'no_subscription' using errcode = 'P0002';
  end if;

  if v_sub.status = 'cancelled' then
    raise exception 'subscription_cancelled' using errcode = '22023';
  end if;

  if _target = 'enterprise'::public.billing_plan then
    raise exception 'contact_sales' using errcode = '22023';
  end if;

  select * into v_plan from public.plan_definitions where plan = _target;
  if v_plan.plan is null then
    raise exception 'plan_unavailable' using errcode = 'P0002';
  end if;

  v_subtotal := coalesce(v_plan.price_minor_int, 0);
  v_vat := (v_subtotal * v_vat_bp) / 10000;
  v_total := v_subtotal + v_vat;

  return jsonb_build_object(
    'plan', _target,
    'currency_code', v_plan.currency_code,
    'subtotal_minor_int', v_subtotal,
    'vat_rate_basis_points', v_vat_bp,
    'vat_minor_int', v_vat,
    'total_minor_int', v_total,
    'products_limit', v_plan.products_limit,
    'staff_limit', v_plan.staff_limit,
    'effective_at', now()
  );
end $$;

-- 5. billing_plan_change
create or replace function public.billing_plan_change(
  _merchant_id uuid,
  _target public.billing_plan,
  _actor text default 'owner'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_preview jsonb;
  v_sub record;
  v_inv_id uuid;
  v_inv_num text;
begin
  v_preview := public.billing_plan_preview(_merchant_id, _target);
  select * into v_sub from public.subscriptions where merchant_id = _merchant_id;

  if _target = v_sub.plan then
    return jsonb_build_object('kind', 'unchanged', 'plan', _target);
  end if;

  -- Upgrade immediately
  v_inv_num := 'INV-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
  insert into public.invoices (
    merchant_id, invoice_number, plan, period_start, period_end,
    subtotal_minor_int, vat_minor_int, vat_rate_basis_points, total_minor_int,
    currency_code, status, idempotency_key
  ) values (
    _merchant_id, v_inv_num, _target, to_char(now(), 'YYYY-MM-DD'), to_char(now() + interval '30 days', 'YYYY-MM-DD'),
    (v_preview->>'subtotal_minor_int')::bigint, (v_preview->>'vat_minor_int')::bigint,
    (v_preview->>'vat_rate_basis_points')::bigint, (v_preview->>'total_minor_int')::bigint,
    v_preview->>'currency_code', 'open', 'inv_plan_change_' || _merchant_id || '_' || encode(gen_random_bytes(8), 'hex')
  )
  returning id into v_inv_id;

  update public.subscriptions
     set plan = _target,
         scheduled_plan = null,
         scheduled_plan_at = null,
         updated_at = now()
   where merchant_id = _merchant_id;

  update public.tenant_limits
     set products_limit = (v_preview->>'products_limit')::bigint,
         staff_limit = (v_preview->>'staff_limit')::bigint,
         updated_at = now()
   where merchant_id = _merchant_id;

  return jsonb_build_object(
    'kind', 'upgraded',
    'plan', _target,
    'invoice_id', v_inv_id,
    'total_minor_int', (v_preview->>'total_minor_int')::bigint
  );
end $$;

-- 6. billing_trial_claim
create or replace function public.billing_trial_claim(
  _merchant_id uuid,
  _fingerprint text,
  _actor text default 'owner'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sub record;
begin
  if _fingerprint is null or trim(_fingerprint) = '' then
    raise exception 'fingerprint_required' using errcode = '22023';
  end if;

  select * into v_sub from public.subscriptions where merchant_id = _merchant_id;
  if v_sub.id is null then
    raise exception 'no_subscription' using errcode = 'P0002';
  end if;

  if v_sub.trial_fingerprint is not null then
    raise exception 'already_claimed' using errcode = '23505';
  end if;

  update public.subscriptions
     set trial_fingerprint = trim(_fingerprint),
         trial_started_at = now(),
         trial_ends_at = now() + interval '14 days',
         status = 'trial',
         updated_at = now()
   where merchant_id = _merchant_id;

  return jsonb_build_object(
    'ok', true,
    'trial_ends_at', now() + interval '14 days'
  );
end $$;

-- 7. billing_sweep() -> jsonb
create or replace function public.billing_sweep()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_expired_trials int;
  v_expired_charges int;
begin
  -- Expire past due trials
  update public.subscriptions
     set status = 'past_due',
         past_due_since = coalesce(past_due_since, to_char(now(), 'YYYY-MM-DD')),
         updated_at = now()
   where status = 'trial'
     and trial_ends_at is not null
     and trial_ends_at < now();
  get diagnostics v_expired_trials = row_count;

  -- Expire pending charges past expires_at
  update public.platform_charges
     set status = 'expired',
         settled_at = now(),
         failure_code = 'charge_expired',
         updated_at = now()
   where status in ('created', 'pending')
     and expires_at < now();
  get diagnostics v_expired_charges = row_count;

  return jsonb_build_object(
    'swept', true,
    'expired_trials', v_expired_trials,
    'expired_charges', v_expired_charges
  );
end $$;

-- 8. gift_card_issue
create or replace function public.gift_card_issue(
  _merchant_id uuid,
  _code text,
  _amount_minor bigint,
  _currency text default 'BDT',
  _expires_at timestamp with time zone default null,
  _email text default null,
  _phone text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_clean_code text;
begin
  v_clean_code := upper(trim(_code));
  if v_clean_code = '' then
    raise exception 'code_required' using errcode = '22023';
  end if;

  insert into public.gift_cards (
    merchant_id, code, initial_minor_int, balance_minor_int, currency_code,
    expires_at, recipient_email, recipient_phone, status, issued_by
  ) values (
    _merchant_id, v_clean_code, _amount_minor, _amount_minor, coalesce(_currency, 'BDT'),
    _expires_at, nullif(trim(_email), ''), nullif(trim(_phone), ''), 'active', auth.uid()
  )
  returning id into v_id;

  insert into public.gift_card_entries (
    merchant_id, gift_card_id, amount_minor_int, balance_after_minor_int,
    currency_code, kind, actor, idempotency_key
  ) values (
    _merchant_id, v_id, _amount_minor, _amount_minor, coalesce(_currency, 'BDT'),
    'issued', coalesce(auth.uid()::text, 'system'), 'issue_' || v_id
  );

  return jsonb_build_object(
    'id', v_id,
    'code', v_clean_code,
    'balance_minor_int', _amount_minor
  );
end $$;

-- 9. gift_card_redeem
create or replace function public.gift_card_redeem(
  _merchant_id uuid,
  _code text,
  _amount_minor bigint,
  _order_id uuid default null,
  _idempotency_key text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_key text;
  v_entry record;
  v_card record;
  v_deduct bigint;
  v_new_balance bigint;
begin
  v_key := coalesce(_idempotency_key, 'gc_redeem_' || encode(gen_random_bytes(16), 'hex'));

  select * into v_entry
    from public.gift_card_entries
   where merchant_id = _merchant_id and idempotency_key = v_key;

  if v_entry.id is not null then
    return jsonb_build_object(
      'replayed', true,
      'applied_minor_int', v_entry.amount_minor_int,
      'balance_minor_int', v_entry.balance_after_minor_int,
      'currency_code', v_entry.currency_code
    );
  end if;

  select * into v_card
    from public.gift_cards
   where merchant_id = _merchant_id
     and upper(code) = upper(trim(_code))
   for update;

  if v_card.id is null then
    raise exception 'gift_card_not_found' using errcode = 'P0002';
  end if;

  if v_card.status <> 'active' then
    raise exception 'gift_card_inactive: card is not active' using errcode = '22023';
  end if;

  if v_card.expires_at is not null and v_card.expires_at < now() then
    raise exception 'gift_card_expired' using errcode = '22023';
  end if;

  if v_card.balance_minor_int <= 0 then
    raise exception 'gift_card_empty' using errcode = '22023';
  end if;

  v_deduct := least(v_card.balance_minor_int, _amount_minor);
  v_new_balance := v_card.balance_minor_int - v_deduct;

  update public.gift_cards
     set balance_minor_int = v_new_balance,
         status = (case when v_new_balance = 0 then 'redeemed'::public.gift_card_status else status end),
         updated_at = now()
   where id = v_card.id;

  insert into public.gift_card_entries (
    merchant_id, gift_card_id, amount_minor_int, balance_after_minor_int,
    currency_code, kind, order_id, actor, idempotency_key
  ) values (
    _merchant_id, v_card.id, v_deduct, v_new_balance,
    v_card.currency_code, 'redeemed', _order_id, coalesce(auth.uid()::text, 'system'), v_key
  );

  return jsonb_build_object(
    'replayed', false,
    'applied_minor_int', v_deduct,
    'balance_minor_int', v_new_balance,
    'currency_code', v_card.currency_code
  );
end $$;

-- Grants
GRANT EXECUTE ON FUNCTION public.platform_charge_open(uuid, uuid, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_charge_settle(uuid, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_vat_bp() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_plan_preview(uuid, public.billing_plan) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_plan_change(uuid, public.billing_plan, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_trial_claim(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_sweep() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gift_card_issue(uuid, text, bigint, text, timestamp with time zone, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gift_card_redeem(uuid, text, bigint, uuid, text) TO authenticated, service_role;
