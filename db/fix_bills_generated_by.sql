-- ============================================================================
-- Fix: settling a table never saved its bill (no payment mode recorded)
-- ============================================================================
--
-- record_bill() and the "Paid by → Save" correction both write the signed-in
-- user into bills.generated_by (auth.uid()). That column pointed at
-- staff_users, which is empty — logins live in auth.users, not staff_users —
-- so every insert failed with:
--
--   insert or update on table "bills" violates foreign key constraint
--   "bills_generated_by_fkey"
--
-- The till treats a rejected bill as non-fatal (the table is still settled),
-- so the failure went unseen: every bill in the database came from the
-- backdated Sales Entry, which leaves generated_by empty. Payments then shows
-- "N settled bills carry no payment record".
--
-- generated_by means "the login that settled it", so it now references
-- auth.users. Every existing value is NULL, so the new constraint validates.
-- Nothing in the app reads this column.
--
-- Safe to run more than once. Run in the Supabase SQL Editor.
-- ============================================================================

ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_generated_by_fkey;

ALTER TABLE public.bills
  ADD CONSTRAINT bills_generated_by_fkey
  FOREIGN KEY (generated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
