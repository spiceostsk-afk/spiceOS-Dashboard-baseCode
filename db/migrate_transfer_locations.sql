-- =============================================================================
-- Spice OS — a managed list of transfer locations
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- =============================================================================
-- Transfers currently take a typed FROM and TO. Typing a place name every time
-- is how "Southx", "South X" and "southx" become three different destinations
-- that no report can add together — the same drift that made a Unit Master
-- necessary for "Kg" and "kg".
--
-- These are the restaurant's OWN units — a factory, another branch — not
-- suppliers, so they get their own list rather than being mixed into Suppliers.
-- A supplier is who you buy from; a location is where your stock goes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.transfer_locations (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL DEFAULT public.current_restaurant_id()
                  REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  note          text,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transfer_locations_pkey PRIMARY KEY (id),
  CONSTRAINT transfer_locations_name_key UNIQUE (restaurant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_transfer_locations_rest
  ON public.transfer_locations (restaurant_id, is_active, sort_order);

ALTER TABLE public.transfer_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.transfer_locations;
CREATE POLICY tenant_isolation ON public.transfer_locations
  FOR ALL TO authenticated
  USING (restaurant_id = (SELECT public.current_restaurant_id())
         OR (SELECT public.is_platform_admin()))
  WITH CHECK (restaurant_id = (SELECT public.current_restaurant_id())
         OR (SELECT public.is_platform_admin()));

-- ----------------------------------------------------------------------------
-- Wali Baba's units
-- ----------------------------------------------------------------------------
INSERT INTO public.transfer_locations (restaurant_id, name, sort_order)
VALUES
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Baba Factory',           1),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Southx',                 2),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Yashoda Nagar',          3),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Cawnpore Foods Parade',  4),
  ('b88e5c07-24d7-4386-8c47-e48f4cab23ee', 'Zsquare',                5)
ON CONFLICT (restaurant_id, name) DO NOTHING;

-- Anything already typed into a past transfer becomes a location too, so the
-- dropdown starts out knowing every place stock has actually gone.
INSERT INTO public.transfer_locations (restaurant_id, name, sort_order)
SELECT DISTINCT t.restaurant_id, btrim(x.label), 90
FROM public.stock_transfers t
CROSS JOIN LATERAL (VALUES (t.from_label), (t.to_label)) AS x(label)
WHERE btrim(COALESCE(x.label, '')) <> ''
ON CONFLICT (restaurant_id, name) DO NOTHING;

-- =============================================================================
-- VERIFY
-- =============================================================================
SELECT jsonb_pretty(jsonb_build_object(
  'locations', (
    SELECT COALESCE(jsonb_agg(name ORDER BY sort_order, name), '[]'::jsonb)
    FROM public.transfer_locations
    WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'),
  'count', (SELECT count(*) FROM public.transfer_locations
             WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee')
)) AS result;
