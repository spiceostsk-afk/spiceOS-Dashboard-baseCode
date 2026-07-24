-- ============================================================
-- Lumiere Bistro POS — Supabase Schema Migration
-- Run this in Supabase SQL Editor after verifying no data loss
-- ============================================================

-- 1. STAFF TABLE
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('manager', 'staff')),
  pin TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. RESTAURANT SETTINGS TABLE
CREATE TABLE IF NOT EXISTS restaurant_settings (
  key TEXT PRIMARY KEY,
  value JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. METADATA JSONB COLUMN ON customer_sessions
ALTER TABLE customer_sessions
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 4. ADD CHECK CONSTRAINTS ON EXISTING TABLES (safe, IF NOT equivalent)
ALTER TABLE customer_sessions
  DROP CONSTRAINT IF EXISTS customer_sessions_session_status_check,
  ADD CONSTRAINT customer_sessions_session_status_check
  CHECK (session_status IN ('active', 'hold', 'billing', 'completed', 'void'));

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_order_status_check,
  ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN ('pending', 'preparing', 'ready', 'served', 'cancelled'));

ALTER TABLE restaurant_tables
  DROP CONSTRAINT IF EXISTS restaurant_tables_status_check,
  ADD CONSTRAINT restaurant_tables_status_check
  CHECK (status IN ('available', 'occupied', 'billing', 'cleaning'));

-- 5. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_customer_sessions_status ON customer_sessions(session_status);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_ended_at ON customer_sessions(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_table_id ON customer_sessions(table_id);

CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);

CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON menu_items(category_id);

-- 6. ENABLE ROW LEVEL SECURITY (required for anon key usage)
ALTER TABLE restaurant_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;

-- 7. RLS POLICIES — Allow full access for anon key (temporary until auth is implemented)
-- Replace these with proper per-role policies when auth is added
DO $$
DECLARE
  tables_list TEXT[] := ARRAY['restaurant_sections', 'restaurant_tables', 'customer_sessions', 'orders', 'order_items', 'menu_categories', 'menu_items', 'staff', 'restaurant_settings'];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_list
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS anon_all_%I ON %I', t, t);
    EXECUTE format('CREATE POLICY anon_all_%I ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- 8. REALTIME — Enable for tables that need realtime subscriptions
-- (Only restaurant_tables is currently subscribed in the app)
ALTER PUBLICATION supabase_realtime ADD TABLE restaurant_tables;
