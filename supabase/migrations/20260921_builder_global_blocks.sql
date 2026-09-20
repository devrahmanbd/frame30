-- Phase 14 global blocks: the table `global-blocks.server.ts` reads/writes
-- never shipped with a migration, so every list call threw
-- `global_block.read_failed` ("table not in schema cache") and broke the
-- theme studio's globals surface. Creates it now, idempotently.
--
-- Columns mirror exactly what the server layer selects/inserts/updates:
-- id, merchant_id, theme_id, name, nodes, revision, created_by, updated_by,
-- created_at, updated_at.

CREATE TABLE IF NOT EXISTS public.builder_global_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  theme_id uuid NULL,
  name text NOT NULL,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Name uniqueness is per (merchant, theme scope): one partial index per
-- scope, since NULL theme_ids never compare equal to each other.
CREATE UNIQUE INDEX IF NOT EXISTS builder_global_blocks_merchant_name_uniq
  ON public.builder_global_blocks (merchant_id, lower(name))
  WHERE theme_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS builder_global_blocks_merchant_theme_name_uniq
  ON public.builder_global_blocks (merchant_id, theme_id, lower(name))
  WHERE theme_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS builder_global_blocks_merchant_updated_idx
  ON public.builder_global_blocks (merchant_id, updated_at DESC);

-- Keep updated_at meaningful: the server layer never sets it explicitly
-- and the list orders by it.
CREATE OR REPLACE FUNCTION public.builder_global_blocks_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS builder_global_blocks_touch ON public.builder_global_blocks;
CREATE TRIGGER builder_global_blocks_touch
  BEFORE UPDATE ON public.builder_global_blocks
  FOR EACH ROW EXECUTE FUNCTION public.builder_global_blocks_touch();

ALTER TABLE public.builder_global_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS builder_global_blocks_tenant_rw ON public.builder_global_blocks;
CREATE POLICY builder_global_blocks_tenant_rw ON public.builder_global_blocks
  FOR ALL TO authenticated
  USING (public.is_merchant_member(merchant_id))
  WITH CHECK (public.is_merchant_member(merchant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.builder_global_blocks TO authenticated;
GRANT ALL ON public.builder_global_blocks TO service_role;
