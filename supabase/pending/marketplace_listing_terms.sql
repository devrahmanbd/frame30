-- ==============================================================================
-- Framique: marketplace listing term pricing (PRICING lane)
-- Status: PENDING — DO NOT APPLY YET. Code works with and without these
-- columns (feature-detected in src/lib/marketplace-install.server.ts:
-- isMissingTermColumnError / loadListingPricing / saveListing term write;
-- optimistic term write first, on missing-column failure retry without terms
-- and log a warn; term selects fall back to the base columns the same way).
--
-- Apply AFTER code deploy. No backfill: NULL means "no term price", which
-- resolves to the base price_minor_int on purchase/conversion and to the
-- install-row price on renewal — identical to pre-migration behaviour.
-- Amount validation (non-negative integers) lives in saveListing
-- (validateListingTermPrice); no CHECK constraint here so the migration
-- stays a pure additive column change.
--
-- RLS is table-level and inherited from the listing policies, so no
-- GRANT/policy change here (same as the install recurring migration
-- marketplace_install_recurring.sql).
-- ==============================================================================

alter table public.marketplace_themes
  add column if not exists price_monthly_minor_int bigint,
  add column if not exists price_annual_minor_int bigint;

alter table public.marketplace_widgets
  add column if not exists price_monthly_minor_int bigint,
  add column if not exists price_annual_minor_int bigint;
