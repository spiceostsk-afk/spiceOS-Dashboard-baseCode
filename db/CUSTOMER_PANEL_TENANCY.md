# Customer Panel — Tenancy & Session Design

> The diner has no login. We must scope them to exactly one restaurant + table,
> stop them ordering once they leave, and flip the QR to feedback — all without
> anything hackable in the URL.

## The core idea: static QR, server-decided behavior

The QR printed on the table **never changes** (you can't reprint every meal). So
the QR encodes only an **opaque, random table token** — not the table number, not
the restaurant. What the token *does* is decided live by the server:

```
Table QR  ──►  https://menu.<domain>/t/<table_public_token>
                         │  (random UUID, unguessable, not editable to another table)
                         ▼
             Edge Function: resolve-table
                         │
      ┌──────────────────┼─────────────────────────┐
      ▼                  ▼                          ▼
 active session     session just             no session /
 on this table      completed (paid)         table free
      │                  │                          │
   ORDER MODE        FEEDBACK MODE            "wait to be seated"
   (scoped token)    (rate your visit)        + Call Waiter only
```

Same URL every time. The **behaviour** changes with session state — that's how
"the link turns into a feedback link when the customer leaves" works, with zero
URL change and no reprinting.

---

## Problem 1 — "nothing hackable in the URL"

**Solution: opaque token, server-minted claims.**

- The QR URL carries a **random `table_public_token` (UUID)**, e.g.
  `/t/9f2c8a71-4e...`. It is NOT `?table=12` or `?r=slug`. Editing it just yields
  an invalid token → error page. You cannot reach another table without guessing
  a 122-bit random value.
- The diner's tenant identity (`restaurant_id`, `table_id`, `session_id`) is
  **never trusted from the client**. The Edge Function looks them up from the
  token server-side and mints a **short-lived signed JWT** carrying them. RLS
  reads those claims, so even a tampered client can't touch another restaurant.

> A static QR must carry *some* identifier — the win is making it an unguessable
> random token instead of a human-readable, editable one.

---

## Problem 2 — "dangerous after the customer leaves"

Two layers, so a stale browser tab can't keep ordering:

**Layer A — the token is short-lived.** The Edge Function signs the diner's JWT
with a short expiry (e.g. 3 hours). A tab left open past that simply stops working.

**Layer B — RLS gates ordering on a LIVE session (the real guarantee).**
The diner's JWT carries `session_id`. RLS on `orders` / `order_items` /
`waiter_calls` allows an anon INSERT **only while that session is still active**:

```sql
CREATE OR REPLACE FUNCTION public.is_session_active(sid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customer_sessions
    WHERE id = sid AND session_status = 'active'
  )
$$;

-- anon diner can create orders ONLY for their own, still-active session
CREATE POLICY diner_insert_orders ON public.orders
  FOR INSERT TO anon
  WITH CHECK (
    restaurant_id = (SELECT public.current_restaurant_id())
    AND session_id = (SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'session_id')::uuid)
    AND (SELECT public.is_session_active(session_id))
  );
```

The moment staff settles the bill (`session_status → 'completed'`), every further
diner insert fails — no matter how long their tab stays open. Ordering is bound to
the **live meal**, not to possession of the link.

---

## Problem 3 — "flip to a feedback link automatically"

The Edge Function returns a **mode** based on the table's session state:

| Table state on scan | Mode served |
|---|---|
| Active session | **Order** — mints scoped token, shows menu |
| Most recent session completed (within N hrs), none active | **Feedback** — rate the visit just finished |
| No session / table available | **Idle** — "please wait to be seated" + Call Waiter |

Because it keys off `customer_sessions.session_status`, the flip to feedback is
automatic the instant the bill is settled. Feedback is written to a small new
`session_feedback` table (rating + comment), scoped by the same token.

---

## What gets built

**Database (one migration):**
1. `restaurant_tables.public_token uuid UNIQUE DEFAULT gen_random_uuid()` + index.
2. `is_session_active(uuid)` helper.
3. Anon RLS policies: SELECT own restaurant's menu + own table/session; INSERT
   orders/order_items/waiter_calls only for a live session; INSERT feedback for a
   recently-completed session.
4. `session_feedback` table (restaurant_id, session_id, rating, comment).

**Edge Function `resolve-table`:**
- Input: `table_public_token`.
- Looks up table → restaurant_id, table_id, current/last session.
- Active → sign short-lived JWT `{ role: 'anon', restaurant_id, table_id, session_id, exp }`, return `{ mode: 'order', token, restaurant }`.
- Completed → `{ mode: 'feedback', session_id }`.
- Idle → `{ mode: 'idle' }`.
- Signs with the project JWT secret (HS256) — stateless, no throwaway anon users.

**Customer panel (`menu/js`):**
- Parse `table_public_token` from the path.
- Call `resolve-table`; on `order`, set the scoped token on the supabase client
  (`Authorization: Bearer <token>`), load the menu, enable ordering.
- On `feedback`, render the feedback form. On `idle`, render the wait screen.
- Remove the old localStorage table-number flow.

> Menu is still hardcoded in `menu-data.js` today. Serving it live from
> `menu_items` per restaurant is the separate Phase 3 rewrite — this design works
> with either, but real multi-tenant menus need that follow-up.

---

## Why this is the best fit

- **No editable URL** → opaque random token + server-minted claims (Problem 1).
- **Safe after leaving** → short-lived token *and* RLS bound to a live session
  (Problem 2) — belt and suspenders.
- **Auto-feedback** → server decides mode from session state, same URL (Problem 3).
- **Multi-tenant-correct** → identity is server-authoritative; a diner is
  cryptographically confined to one restaurant + one table + one meal.
- **Scales** → stateless signed tokens, no anon-user table bloat, static QRs never
  reprinted.
