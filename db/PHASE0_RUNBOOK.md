



# Phase 0 Runbook — Multi-Tenant Foundation

Everything here is done **by you** in the Supabase dashboard / your shell. I can't
create projects or run SQL against your account. Follow top to bottom; each step
says where it runs.

**Old project (single-tenant, all 3 panels currently point here):**
`pzseofankkdyigtbpjqy.supabase.co`
**New project:** you create it in step 1.

---

## 0. Before you touch anything — back up the old project

Dashboard → old project → **Database → Backups**, or from your shell:

```bash
# get the connection string from: old project → Project Settings → Database → Connection string (URI)
pg_dump "postgresql://postgres:[PASSWORD]@db.pzseofankkdyigtbpjqy.supabase.co:5432/postgres" \
  --no-owner --no-privileges > spiceos_old_full_backup.sql
```

Keep this file. It's your rollback.

---

## 1. Create the new project

1. supabase.com → **New project**. Region: closest to your restaurants (Mumbai/`ap-south-1` for India).
2. Save the DB password.
3. **Upgrade to Pro now if this project will take real restaurants** (see handoff §6). For
   building/testing Phase 0 alone, Free is fine.

---

## 2. Run the schema

New project → **SQL Editor** → paste all of [`schema.sql`](./schema.sql) → **Run**.
Should complete with no errors. This creates 4 tenant tables + 14 domain tables,
all indexes, all RLS policies, the tenant helpers, and the access-token hook function.

Sanity check (SQL Editor):
```sql
select count(*) from information_schema.tables where table_schema='public';  -- expect 18
select proname from pg_proc where proname in
  ('current_restaurant_id','is_platform_admin','custom_access_token_hook');   -- expect 3 rows
```

---

## 3. Enable the access-token hook

Dashboard → **Authentication → Hooks** → **Customize Access Token (JWT) Claims** →
enable → select `public.custom_access_token_hook` → save.

Without this, JWTs won't carry `restaurant_id`, `current_restaurant_id()` returns null,
and RLS blocks everything. It's the switch that makes the whole model live.

---

## 4. Migrate the existing data (test tenant)

You picked "migrate data," so we copy the old rows under one restaurant.

**Step A** — New project SQL Editor: run **part 1** of
[`migrate_test_tenant.sql`](./migrate_test_tenant.sql) (everything down to the
`>>> Now run STEP B <<<` marker). This creates the test tenant restaurant and
temporarily points the `restaurant_id` defaults at it.

**Step B** — Shell: dump the 14 domain tables from OLD, load into NEW. The dump
omits `restaurant_id` (old tables don't have it), so the default from Step A fills it.

```bash
OLD="postgresql://postgres:[OLD_PW]@db.pzseofankkdyigtbpjqy.supabase.co:5432/postgres"
NEW="postgresql://postgres:[NEW_PW]@db.[NEW_REF].supabase.co:5432/postgres"

pg_dump "$OLD" --data-only --no-owner --disable-triggers \
  -t public.staff_users -t public.staff -t public.restaurant_sections \
  -t public.restaurant_tables -t public.customer_sessions -t public.waiter_calls \
  -t public.menu_categories -t public.menu_items -t public.orders \
  -t public.order_items -t public.waiting_list -t public.bills \
  -t public.shift_reports -t public.restaurant_settings \
  > test_tenant_data.sql

psql "$NEW" -f test_tenant_data.sql
```

Notes:
- If the OLD project doesn't actually have `staff`, `restaurant_settings`, or the
  `metadata` column, drop those `-t` flags / ignore the COPY errors for missing
  tables — the schema still has them for the app going forward.
- `--disable-triggers` avoids FK-order failures during the bulk load.
- If `psql` complains about RLS on load, uncomment the DISABLE/ENABLE lines in
  the migration (A3/C2) and re-run.

**Step C** — New project SQL Editor: run **part 2** of `migrate_test_tenant.sql`
(from the `STEP C` marker). This restores the JWT-based defaults and prints a
verification table. **Every `null_rid` must be 0.**

---

## 5. Create your first users

Still no login UI (that's Phase 1) — seed users by hand so you can test RLS.

```sql
-- after creating a user in Dashboard → Authentication → Users → Add user,
-- grab their id and link them to the test tenant:
insert into public.restaurant_members (user_id, restaurant_id, role)
values ('[AUTH_USER_UUID]', '00000000-0000-0000-0000-000000000000', 'owner');

-- make yourself a platform (super) admin for the future admin panel:
insert into public.platform_admins (user_id) values ('[YOUR_AUTH_USER_UUID]');
```

Have the user sign out/in (or mint a fresh token) so the hook stamps the new claims.

---

## 6. Verify tenant isolation (the point of all this)

In SQL Editor, **Run as** a specific user (SQL Editor role selector) or test from
the app once Phase 1 login exists. Quick check with the impersonation helper:

```sql
-- simulate a request carrying the test tenant's claim:
select set_config('request.jwt.claims',
  '{"restaurant_id":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
select count(*) from public.orders;         -- sees test tenant orders

-- simulate a DIFFERENT tenant:
select set_config('request.jwt.claims',
  '{"restaurant_id":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select count(*) from public.orders;         -- MUST be 0
```

If the second count is anything but 0, stop — isolation is broken, do not proceed
to Phase 1. (Run these with a non-superuser role; the SQL Editor's default role
bypasses RLS, which would mask the test.)

---

## 7. Re-point the three apps (do NOT deploy yet — Phase 1 wires auth)

Update the Supabase URL + anon key to the NEW project in:

| Panel | File | What to change |
|---|---|---|
| MenuDashboard | `.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| captain-paqnel | `.env` | same two vars |
| menuCustomerPanel | `menu/js/supabase-client.js:5-6` | **hardcoded** URL + key → move to config, and **rotate** the old key |

The apps won't fully work until Phase 1 (they have no login, so no JWT, so RLS
returns empty). That's expected. Phase 0's deliverable is a correct, isolated
schema — not a running app.

---

## 8. Phase 0 done-checklist

- [ ] Old project backed up (§0)
- [ ] New project created, Pro decided (§1)
- [ ] `schema.sql` ran clean; 18 tables, 3 functions present (§2)
- [ ] Access-token hook enabled (§3)
- [ ] Data migrated; verification `null_rid = 0` everywhere (§4)
- [ ] Owner + platform-admin users seeded (§5)
- [ ] **Cross-tenant isolation test passes: other-tenant count = 0 (§6)** ← the gate
- [ ] Old hardcoded anon key rotated (§7)

When the isolation test in §6 passes, Phase 0 is complete and Phase 1 (auth wiring
+ login UIs + the anon QR-token path for diners) can begin.

---

## What I need from you to keep moving

1. **Run this and tell me the §6 result.** That's the real acceptance test.
2. Confirm whether the OLD project actually has `staff`, `restaurant_settings`, and
   `customer_sessions.metadata` — CONTEXT.md says they were planned; if they were
   never actually created, the §4 dump flags adjust. If you can run
   `select table_name from information_schema.tables where table_schema='public'`
   on the old project and paste it, I'll tighten the migration to match reality.
