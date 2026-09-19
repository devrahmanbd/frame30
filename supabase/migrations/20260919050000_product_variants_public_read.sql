-- Public storefronts must read variants of live products. Without this,
-- anonymous shoppers join zero variants: every price renders 0.00 and every
-- product shows out of stock (Sept 2026 night-shift incident).
-- Tenant write path is untouched; only active products of active merchants
-- are visible publicly.
DROP POLICY IF EXISTS product_variants_public_read ON public.product_variants;
CREATE POLICY product_variants_public_read ON public.product_variants
  FOR SELECT TO public, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.products p
      JOIN public.merchants m ON m.id = p.merchant_id
      WHERE p.id = product_variants.product_id
        AND p.status = 'active'
        AND m.status = 'active'
    )
  );
GRANT SELECT ON public.product_variants TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
