-- Harden theme_assets public reads to active merchants.
--
-- theme_assets_public_read was USING(true): any anonymous client could
-- enumerate EVERY tenant's theme CSS. Every sibling public-read policy in
-- the codebase scopes to public.is_public_merchant(merchant_id) (active
-- merchants only); theme assets join that convention here. Draft assets of
-- an active merchant stay readable (preview + storefront both need them);
-- assets of inactive merchants stop leaking. Tenant writes are untouched.
-- Additive and backward-compatible: no column, grant, or API change.
DROP POLICY IF EXISTS theme_assets_public_read ON public.theme_assets;
CREATE POLICY theme_assets_public_read ON public.theme_assets
  FOR SELECT TO anon, authenticated
  USING (public.is_public_merchant(merchant_id));
