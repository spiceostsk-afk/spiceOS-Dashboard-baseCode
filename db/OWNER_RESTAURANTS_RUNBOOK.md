# One owner, many restaurants — runbook

An owner login now lists every restaurant it belongs to and can switch between
them from the header.

## 1. Run the migration

`db/migrate_owner_restaurants.sql`, once, in the Supabase SQL Editor. Safe to
re-run. It needs `db/schema.sql` to have been run already.

**You do not need to touch the Auth hook configuration.** The migration uses
`CREATE OR REPLACE FUNCTION public.custom_access_token_hook`, so the hook the
Dashboard already points at is the one that gets updated.

**Existing sessions keep their old claim until their token refreshes** (about an
hour, or immediately on re-login). If you are testing straight after running the
migration, sign out and back in.

### Verify

```sql
-- the hook now prefers a selection; with none made it must still resolve
select public.custom_access_token_hook(
  jsonb_build_object('user_id', '<an owner user id>', 'claims', '{}'::jsonb)
) -> 'claims' -> 'restaurant_id';

-- what the dropdown will show (run as that owner, not as postgres)
select * from public.my_restaurants();
```

## 2. How switching works

The tenant is a JWT claim (`restaurant_id`), read by `current_restaurant_id()`
and enforced by RLS on every table. So switching is not a client-side toggle —
it is a token re-mint:

```
set_active_restaurant(id)     writes the choice, after verifying membership
supabase.auth.refreshSession() re-runs the access-token hook → new claim
window.location.assign('/')    full reload
```

The reload is deliberate. The IndexedDB offline cache is namespaced per tenant
(`setDbTenant` runs in `Gate`), and every mounted data hook is holding rows
fetched under the old claim. Tearing the page down is the only way to be certain
nothing from the previous restaurant survives on screen.

## 3. The security property that matters

`custom_access_token_hook` only ever selects from **this user's own**
`restaurant_members` rows:

```sql
FROM restaurant_members rm
LEFT JOIN user_active_restaurant ua ON ua.user_id = rm.user_id
WHERE rm.user_id = v_uid
ORDER BY (rm.restaurant_id = ua.restaurant_id) DESC NULLS LAST, rm.created_at ASC
```

A tampered or stale selection cannot mint a claim for a restaurant the user does
not belong to — the worst it can do is not match any row, in which case the
`ORDER BY` falls through to the oldest membership. `set_active_restaurant()`
also refuses a non-membership up front, so the bad state is unreachable from the
app as well as harmless if reached.

**`restaurants_read` was deliberately NOT widened.** The dropdown gets its names
from `my_restaurants()`, a `SECURITY DEFINER` function scoped to `auth.uid()`.
Nothing else in the app ever reads a restaurant other than the current one, so
the policy stays exactly as tight as it was.

## 4. Getting a second restaurant onto a login

Signup provisions exactly one restaurant, so without a way to add another the
dropdown could never have more than one row and the feature would be
unreachable. `create_restaurant(name, slug)` is that path — reachable from
**Add restaurant** at the bottom of the switcher.

It is narrow on purpose:

- It always makes the **caller** the owner of what it creates. It cannot be used
  to join an existing restaurant.
- It requires the caller to already be an `owner` or `admin` somewhere. A brand
  new account still goes through signup / `provision-restaurant`.
- The `restaurants` table stays platform-admin-write-only at the policy level;
  this function is the single audited exception.

New restaurants come up as `status = 'trial'`, get a default theme, and — if
`migrate_inventory_stock.sql` has been run — a default outlet from its trigger,
so they are immediately usable.

**If you would rather owners could not create restaurants themselves** (billing,
for instance), drop the function and the "Add restaurant" button; the switcher
works fine without it, and memberships can be assigned with the service role
instead:

```sql
DROP FUNCTION public.create_restaurant(text, text);
```

## 5. Two switchers in the header

There are now two levels, and they mean different things:

| Control | Scope | Shown when |
|---|---|---|
| **Restaurant** | a whole tenant — its own menu, staff, orders, stock, branding | 2+ memberships |
| **Outlet** | a branch inside one restaurant, sharing that restaurant's menu and item master | always (as before) |

A single-restaurant owner sees only the outlet control, exactly as today.
