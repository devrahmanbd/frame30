ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.tenants FOR ALL USING (merchant_id = auth.uid());
