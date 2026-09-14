-- =====================================================================
-- Phase 0 Security Hardening & Customer Isolation Migration
-- All statements are idempotent.
-- =====================================================================

-- 1. Revoke mutating permissions on platform_admins from authenticated users.
-- Only service_role can create, modify, or delete platform owners.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.platform_admins FROM authenticated;

-- 2. Add customer-scoped read policy for orders.
-- Allows authenticated shoppers to view orders linked to their own customer record.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'orders_customer_read'
  ) THEN
    CREATE POLICY orders_customer_read ON public.orders
      FOR SELECT TO authenticated
      USING (
        customer_id IN (
          SELECT id FROM public.customers
          WHERE auth_uid = auth.uid()::text AND deleted_at IS NULL
        )
      );
  END IF;
END $$;

-- 3. Index customer_id on orders for high-performance customer order lookups
CREATE INDEX IF NOT EXISTS orders_customer_idx ON public.orders USING btree (customer_id);
DROP POLICY IF EXISTS store_themes_public_read ON public.store_themes; CREATE POLICY store_themes_public_read ON public.store_themes FOR SELECT TO anon, authenticated USING (is_active = true AND public.is_public_merchant(merchant_id));
