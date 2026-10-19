-- =============================================================================
-- Wali Baba — return the stock of tables voided as "BASEMENT BILL"
-- Run AFTER db/migrate_void_stock_return.sql. Safe to re-run (lines already
-- returned are skipped).
-- =============================================================================
-- Those tables were voided to move them, then rung up again in the night's
-- combined basement bill, so every dish on them was deducted twice. E.g. 16
-- Oct: G1 voided 21:10 "BASEMENT" (3 Fish Fry, 2 Afghani Barra...) and the same
-- dishes are on the 02:01 G1 basement bill. That void is the whole gap on
-- Fish Semi (15 of 25 pcs) and Barra Semi (8 pcs).
--
-- Setting stock_returned posts each line's ingredients back, dated at its
-- order, so the return lands on the right day. Any closing count already
-- submitted for that day is kept (trg_stock_movements_reapply_count), so
-- tomorrow still opens at the count; only Consumption and Variance change.
--
-- STEP 1 — PREVIEW. Check every row is a basement move, not a real void.
-- STEP 2 — run the UPDATE.
-- STEP 3 (optional) — the two G8 Fish Fry lines double-tapped on 16 Oct.
-- =============================================================================

-- STEP 1 — preview
SELECT to_char(s.started_at AT TIME ZONE 'Asia/Kolkata', 'DD-Mon-YYYY HH24:MI') AS opened,
       rt.table_number, s.metadata->>'voidReason' AS reason,
       mi.item_name, oi.quantity
FROM public.customer_sessions s
JOIN public.orders o            ON o.session_id = s.id
JOIN public.order_items oi      ON oi.order_id = o.id
JOIN public.menu_items mi       ON mi.id = oi.menu_item_id
LEFT JOIN public.restaurant_tables rt ON rt.id = s.table_id
WHERE s.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
  AND s.session_status = 'void'
  AND s.metadata->>'voidReason' ILIKE '%basement%'
  AND NOT oi.stock_returned
ORDER BY s.started_at, mi.item_name;

-- STEP 2 — return the stock
UPDATE public.order_items oi
   SET stock_returned = true
  FROM public.orders o
  JOIN public.customer_sessions s ON s.id = o.session_id
 WHERE oi.order_id = o.id
   AND s.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
   AND s.session_status = 'void'
   AND s.metadata->>'voidReason' ILIKE '%basement%'
   AND NOT oi.stock_returned;

-- STEP 3 (optional) — G8, 16 Oct 20:46, two Fish Fry voided in the same minute
-- they were punched, reason "UY". Run only if the client confirms they were
-- never cooked.
-- UPDATE public.order_items SET stock_returned = true
--  WHERE restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
--    AND order_id IN ('1eaeb6a5-430b-4125-bb40-0f675755d9cd',
--                     '350505a0-93f1-4c40-b64b-556c071fe4d4')
--    AND is_cancelled AND NOT stock_returned;

-- VERIFY — 16 Oct business day consumption. Expect Fish Semi 125 (115 after
-- STEP 3) and Barra Semi 40.
SELECT inv.item_name, -SUM(m.delta) AS consumed
FROM public.stock_movements m
JOIN public.inventory_items inv ON inv.id = m.inventory_item_id
WHERE m.restaurant_id = 'b88e5c07-24d7-4386-8c47-e48f4cab23ee'
  AND m.movement_type = 'consumption'
  AND inv.item_name IN ('Fish Semi', 'Barra Semi')
  AND m.created_at >= '2026-10-16 04:00:00+05:30'
  AND m.created_at <  '2026-10-17 04:00:00+05:30'
GROUP BY inv.item_name;
