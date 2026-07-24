# Lumiere Bistro POS — Project Context

> **Generated:** 2026-06-30  
> **Purpose:** Complete project context for any AI agent. Read this first before making changes.  
> **Location:** `C:\Users\PC\Desktop\Projects\baba admin`

---

## 1. Project Overview

| Field | Value |
|-------|-------|
| **Name** | `the-golden-saffron-dashboard` |
| **Type** | Restaurant POS Admin Dashboard |
| **Brand** | Lumiere Bistro |
| **Stack** | React 19 + Vite 8 + Supabase |
| **Routing** | react-router-dom v7 |
| **Icons** | lucide-react |
| **Styling** | Inline `<style jsx>` blocks (NOT CSS modules — styles are global despite `jsx` attribute) |
| **Auth** | Supabase anon key (set in `.env`) |
| **Build** | `npx vite build` (currently passes in ~1s) |
| **Default port** | Vite dev: `http://localhost:5173` |

### Routes

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | → redirects to `/dashboard` |
| `/dashboard` | `Dashboard.jsx` | KPIs, charts, recent activity, live orders |
| `/billing` | `Billing.jsx` | POS floor grid + bill management |
| `/billing?tab=online` | `Billing.jsx` (tab=online) | Online/Zomato/Swiggy orders |
| `/billing?tab=actions` | `Billing.jsx` (tab=actions) | Store settings, table management |
| `/menu` | `MenuCatalog.jsx` | Menu catalog with order creation |
| `/payments` | `Payments.jsx` | Payment history, summary, filters, detail modal |
| `/reports` | `Reports.jsx` | Sales reports with period filtering, daily breakdown, top items |
| `/settings` | `Settings.jsx` | Restaurant settings, tax/SC, receipt config |
| `/customers` | `Customers.jsx` | Customer list with search, detail modal |
| `/qr-management` | `QRManagement.jsx` | Table QR codes (add/edit/delete, print/download per table or bulk) |
| `/staff` | `Staff.jsx` | Staff CRUD, roles, PIN management |
| `/orders` | `Orders.jsx` | Order history, search/filter, detail modal, KOT reprint |

---

## 2. File Map

### Root config

| File | Purpose |
|------|---------|
| `package.json` | Dependencies: react 19, supabase-js, lucide-react, react-router-dom v7 |
| `vite.config.js` | Vite config |
| `.env` | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` |
| `06_General_Coding_Agent_Guide.md` | Engineering standards (25 Iron Rules) — **must follow** |
| `Untitled_Document.md` | Audit checklist — **reference before building any feature** |
| `checklist.md` | (unknown content) |

### `src/` — Application code

#### Entry
| File | Purpose |
|------|---------|
| `main.jsx` | React entry point |
| `App.jsx` | Router setup, layout (Sidebar + Header + scrollable area) |
| `App.css` | Global styles (scaffold) |
| `index.css` | CSS variables, font, base reset |

#### `src/views/` — Page-level components

| File | Lines | Description |
|------|-------|-------------|
| `Dashboard.jsx` | ~86 | Clean orchestrator for dashboard components |
| `Billing.jsx` | ~350 | Orchestrator for billing (tabs + billing details + modals) |
| `MenuCatalog.jsx` | ~380 | Menu items display + order creation (**offline-capable**) |
| `Payments.jsx` | ~280 | Payment history, summary cards, date filters, detail modal |
| `Reports.jsx` | ~200 | Sales reports with period filtering, daily breakdown, top items |
| `Settings.jsx` | ~200 | Restaurant settings: details, tax, service charge, receipt config |
| `Customers.jsx` | ~200 | Customer list with search, detail modal with visit history |
| `QRManagement.jsx` | ~260 | Table QR codes (add/edit/delete tables, print/download per table or bulk), QR Server API |
| `Staff.jsx` | ~280 | Staff management: list, add/edit/delete, roles, PIN |
| `Orders.jsx` | ~290 | Order history: search, filter (status/date), detail modal, KOT reprint |

#### `src/components/`

| Directory | Files | Description |
|-----------|-------|-------------|
| `dashboard/` | `StatCard.jsx`, `StatCardsGrid.jsx`, `SalesChart.jsx`, `RecentActivity.jsx`, `LiveOrders.jsx` | Dashboard widgets (all refactored) |
| `billing/` | `TablesWorkspace.jsx`, `RunningOrdersTab.jsx` (real data + hold/resume/reprint), `OnlineOrdersTab.jsx`, `StoreActionsTab.jsx`, `BillingDetails.jsx` (discount, SC, GST, split/partial payment), `Modals.jsx` (7 modals), `ConnectivityBanner.jsx` | Billing components (all refactored, full feature set) |
| `Header.jsx` | ~40 | Top bar with title based on route |
| `Sidebar.jsx` | ~357 | Left nav with Daily Operations group, Dashboard, Menu, Reports |

#### `src/hooks/` — Custom hooks

| File | Lines | Description |
|------|-------|-------------|
| `useDashboardData.js` | ~160 | Supabase queries for all dashboard KPIs |
| `useBillingData.js` | ~1114 | All billing state, Supabase ops, offline fallback, sync |
| `usePaymentsData.js` | — | Payments data: completed sessions, date filter, summary calc |
| `useReportsData.js` | ~120 | Reports data: period filter, sales summary, top items, daily breakdown |
| `useSettingsData.js` | ~100 | Settings CRUD via IndexedDB meta store + Supabase fallback |
| `useCustomersData.js` | — | Customer data: sessions grouped by phone, visit stats, order totals |
| `useOfflineSync.js` | ~100 | Online/offline detection, auto-sync engine |
| `useStaffData.js` | ~120 | Staff CRUD via IndexedDB meta store + Supabase fallback |
| `useOrdersData.js` | ~170 | Order history: sessions + orders query, search/filter by status/date, KOT reprint |

#### `src/lib/` — Core utilities

| File | Lines | Description |
|------|-------|-------------|
| `supabase.js` | 6 | Supabase client init (`createClient` with anon key) |
| `db.js` | ~150 | IndexedDB wrapper (open, CRUD, sync queue) |
| `sync.js` | ~140 | Sync engine (process queue, temp ID resolution, cache, exponential backoff) |

---

## 3. Architecture

### Data Flow

```
Browser
  │
  ├── Online ──► Supabase (direct reads/writes)
  │                └── results cached to IndexedDB (db.js)
  │
  └── Offline ──► IndexedDB (local reads/writes)
                   └── writes queued to sync_queue store
                        │
                   When online detected:
                        │
                        ▼
                   Sync engine (sync.js) processes FIFO:
                     INSERT → Supabase INSERT → real ID replaces temp ID
                     UPDATE → Supabase UPDATE
                     DELETE → Supabase DELETE
```

### Layer Separation

```
View (orchestrator)     Billing.jsx / Dashboard.jsx
    │
    ├── Component layer   TablesWorkspace, BillingDetails, Modals, etc.
    │                         (presentation only, props in / callbacks out)
    │
    ├── Hook layer        useBillingData, useDashboardData, useOfflineSync
    │                         (state + business logic + I/O)
    │
    └── Lib layer         supabase.js, db.js, sync.js
                              (raw data access utilities)
```

### Offline Architecture

**Trigger:** `navigator.onLine` + `online`/`offline` events

**Behavior:**
- **Reads:** Online → Supabase + cache to IndexedDB. Offline → IndexedDB only
- **Writes:** Online → Supabase directly. Offline → IndexedDB + `enqueueSync()`
- **Sync:** On reconnect → `processSyncQueue()` replays FIFO, resolves temp IDs

**Key stores in IndexedDB (`lumiere_pos_offline`, v2):**

| Store | Key | Purpose |
|-------|-----|---------|
| `tables` | `id` | Cached restaurant_tables |
| `sections` | `id` | Cached restaurant_sections |
| `menu_items` | `id` | Cached menu items |
| `menu_categories` | `id` | Cached menu categories |
| `sessions` | `id` | Customer sessions (temp + real IDs) |
| `orders` | `id` | Orders (temp + real IDs) |
| `order_items` | `id` | Order items (temp + real IDs) |
| `sync_queue` | autoIncrement | Pending sync actions |
| `meta` | `id` | Metadata (last fetch timestamps) |

**Sync queue entry:**
```js
{ id: 1, action: 'insert', table: 'customer_sessions', tempId: 'temp_...',
  data: { table_id: 5, customer_name: 'John', ... }, createdAt: '...', retries: 0 }
```

**Temp ID resolution:**
- `generateTempId()` → `temp_{timestamp}_{random}`
- On sync: INSERT returns real ID → `updateLocalId()` replaces temp ID in IndexedDB
- `resolveTempIdsInData()` replaces temp `order_id`/`session_id` in subsequent sync entries
- After all entries: `replaceTempIdsInOrders()` + `replaceTempIdsInOrderItems()` fix local references

---

## 4. Supabase Schema (discovered via queries)

| Table | Key fields |
|-------|-----------|
| `restaurant_sections` | `id`, `section_name` |
| `restaurant_tables` | `id`, `table_number`, `capacity`, `section_id`, `status` (available/occupied/billing/cleaning) |
| `customer_sessions` | `id`, `table_id`, `customer_name`, `phone_number`, `guest_count`, `session_status` (active/billing/completed), `started_at`, `ended_at` |
| `orders` | `id`, `session_id`, `table_id`, `order_status`, `subtotal`, `tax`, `total` |
| `order_items` | `id`, `order_id`, `menu_item_id`, `quantity`, `item_price`, `total_price` |
| `menu_categories` | `id`, `category_name` |
| `menu_items` | `id`, `item_name`, `price`, `description`, `category_id`, `image_url`, `is_available` |

---

## 5. Coding Conventions (from `06_General_Coding_Agent_Guide.md`)

**The 25 Iron Rules (abridged — read the full guide for details):**

1. Never trust external input — validate at boundaries
2. Validate, don't assume — null-check everything
3. No silent failures — never swallow exceptions
4. Functions do one thing — single responsibility
5. **Maximum 50 lines per function**
6. No magic numbers or strings — named constants
7. No nested ternaries or deep nesting (max depth 3)
8. Pure functions where possible
9. Immutable data by default (spread, not mutate)
10. Type hints everywhere (JSDoc at minimum)
11. Handle errors at the right level (don't catch what you can't handle)
12. **Idempotency for all write operations** (safe to retry)
13. Logs are for operators, not developers
14. No `console.log`/`print` in production
15. Configuration via env, not code
16. (DB migrations — N/A, Supabase)
17-19. (Tests — 136 tests across 5 files, vitest + testing-library)
20. Comments explain why, not what
21. No premature optimization
22. Dependencies are liability (justify new ones)
23. Backwards compatibility
24. Time is hard — use a library
25. Security is not a feature

**Additional patterns found in codebase:**
- `<style jsx>` blocks for component styles (despite `jsx` attribute, styles are NOT scoped — they're global)
- `FORMAT_CURRENCY` = `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`
- `lucide-react` icons used throughout
- All components handle loading / error / empty states
- `useCallback` + `useRef` for stable function references

---

## 6. What's Been Done (Full Audit)

### ✅ Dashboard — Fully Refactored

Original: 576-line monolithic `Dashboard.jsx`  
Refactored into:

| File | Description |
|------|-------------|
| `src/hooks/useDashboardData.js` | 7+ Supabase queries (revenue, orders, tables, customers, AOV) |
| `src/components/dashboard/StatCard.jsx` | Reusable card with loading/error/empty states |
| `src/components/dashboard/StatCardsGrid.jsx` | 9 stat cards grid |
| `src/components/dashboard/SalesChart.jsx` | Section Revenue (Graph/List) + Daily Trend (7-day) |
| `src/components/dashboard/RecentActivity.jsx` | Recent orders feed with status badges |
| `src/components/dashboard/LiveOrders.jsx` | Active orders grid |
| `src/views/Dashboard.jsx` | 86-line orchestrator |

### ✅ Billing — Fully Refactored + Offline + Complete Feature Set

Original: 2174-line monolithic `Billing.jsx`  
Refactored into:

| File | Lines | Description |
|------|-------|-------------|
| `src/hooks/useBillingData.js` | ~1114 | All billing state, Supabase ops, offline fallback, sync, temp ID handling, discount/SC/GST/hold/void/split payment, handlePrint, handleFreeTable |
| `src/hooks/useOfflineSync.js` | ~100 | Online/offline detection, auto-sync trigger |
| `src/lib/db.js` | ~150 | IndexedDB wrapper (9 stores) |
| `src/lib/sync.js` | ~140 | Sync engine with temp ID resolution |
| `src/components/billing/TablesWorkspace.jsx` | — | Floor grid with sections |
| `src/components/billing/RunningOrdersTab.jsx` | — | Real session data: active/held/completed cards with resume/reprint actions |
| `src/components/billing/OnlineOrdersTab.jsx` | — | Online aggregator orders |
| `src/components/billing/StoreActionsTab.jsx` | — | Aggregator toggles + "Free All Cleaning Tables" |
| `src/components/billing/BillingDetails.jsx` | ~450 | Bill items, invoice, discount, service charge, GST breakdown, split/partial payment, hold/void actions, manual entry (offline) |
| `src/components/billing/Modals.jsx` | — | 7 modals (Assign, Move, Merge, Split, Edit, Void, Reprint) |
| `src/components/billing/ConnectivityBanner.jsx` | — | Offline/syncing/synced status bar |
| `src/views/Billing.jsx` | ~310 | Clean orchestrator with all features wired |

### ⏳ Menu Catalog — Partially Updated

- Menu page (`MenuCatalog.jsx`) now supports offline: reads from IndexedDB cache when offline, writes offline orders with temp IDs
- Menu items/categories are pre-cached when billing page loads (`useBillingData.fetchWorkspaceData`)

### ✅ Payments — Built from Scratch

| File | Lines | Description |
|------|-------|-------------|
| `src/hooks/usePaymentsData.js` | — | Queries completed sessions, date range filter, summary calculations |
| `src/views/Payments.jsx` | ~280 | Summary cards (total revenue, orders, avg, cash/online split), filter bar (date range), payment table with status badges, detail modal |

### ✅ Reports — Built from Scratch (replaced placeholder)

| File | Lines | Description |
|------|-------|-------------|
| `src/hooks/useReportsData.js` | ~120 | Period filter (today/week/month), sales summary, daily breakdown, top items query |
| `src/views/Reports.jsx` | ~200 | 4-card summary row, period filter bar, daily sales bar chart, top items table, export/print |

### ✅ Tests — Full Test Suite (136 tests across 5 files)

| File | Tests | Scope |
|------|-------|-------|
| `src/__tests__/calculations.test.js` | 22 | Pure calc functions: discount, GST, SC, subtotal |
| `src/__tests__/db.test.js` | 9 | IndexedDB CRUD, temp ID generation, sync queue |
| `src/__tests__/components.test.jsx` | 10 | StatCard + ConnectivityBanner rendering states |
| `src/__tests__/navigation.test.jsx` | 6 | Sidebar links, Header titles, shift badge |
| `src/__tests__/full.test.jsx` | 89 | Full-app suite: calcs + DB + 7 components + edge cases |

### ❌ Not Yet Touched

- **Security** — no auth/RBAC yet

---

## 7. Key Decisions & Workarounds

1. **`<style jsx>` is NOT scoped** — despite using the `styled-jsx` syntax, there's no actual Babel plugin. Styles are global. All components use unique class names to avoid collisions.
2. **Supabase realtime subscription** — only on `restaurant_tables` table. Session/order changes require manual refresh.
3. **Offline sync uses FIFO queue order** — important: orders MUST be queued before their order_items so temp IDs resolve correctly.
4. **Temp ID format** — `temp_{timestamp}_{random6}`. Detected by `startsWith('temp_')`.
5. **Table cleanup** — after marking paid, table goes to `cleaning` status, auto-freed to `available` after 60s via `setTimeout`. "Free All" button in Store Actions tab.
6. **No service worker** — offline is in-app (IndexedDB), not via Service Worker. The app still requires the initial page load from the server.
7. **`.env` is NOT committed** — Supabase anon key is in `.env` only. `supabase.js` falls back to placeholder strings.

---

## 8. Known Issues & Gotchas

| Issue | Status |
|-------|--------|
| Menu page offline: needs at least one online load to cache data | Accepted — first load must be online |
| `styled-jsx` not actually scoped — class name collisions possible | Accepted — using unique class names |
| No user auth — any anon key user can access all data | Security risk — needs addressing |
| Reports page replaced placeholder with real data (period filter, sales summary, daily breakdown, top items) | Resolved |
| No connection retry for sync — exponential backoff added (2^retries * 1s, max 30s, up to 5 retries) | Resolved |
| Some legacy `console.error` calls remained in production code | Resolved — replaced with alerts |
| Discount/SC/Void data not stored in Supabase (no metadata column) — metadata now stored locally in IndexedDB session objects; included in sync payload but Supabase ignores extra fields | Accepted — needs `metadata` JSONB column added to `customer_sessions` for Supabase persistence |
| Comments in code exist despite guide Rule 20 | Legacy — being cleaned up gradually |

---

## 9. Build & Run

```bash
# Dev
npm run dev

# Build
npx vite build

# Preview
npx vite preview
```

**Build check:** `npx vite build` must pass with 0 errors before any commit.  
Current build time: ~1s, output: `dist/` (index.html + CSS + JS bundle ~725KB gzip ~182KB).

**Test commands:**

```bash
npm test           # Run all tests once (136 tests across 5 files)
npm run test:watch # Watch mode for development
npm run test:coverage  # Run with coverage report
```

**Test files:**

| File | Tests | Scope |
|------|-------|-------|
| `src/__tests__/calculations.test.js` | 22 | Pure calc functions: discount, GST, SC, subtotal |
| `src/__tests__/db.test.js` | 9 | IndexedDB CRUD, temp ID generation, sync queue |
| `src/__tests__/components.test.jsx` | 10 | StatCard + ConnectivityBanner rendering states |
| `src/__tests__/navigation.test.jsx` | 6 | Sidebar links, Header titles, shift badge |
| `src/__tests__/full.test.jsx` | 89 | Full-app suite: calcs + DB + 7 components + edge cases |

---

## 10. Session Log

### Session 1 — Initial Refactor + Offline System (2026-06-29/30)

| # | Change | Files |
|---|--------|-------|
| 1 | **Dashboard refactor** — split 576-line monolith into `useDashboardData` hook + 6 components | `useDashboardData.js`, `StatCard.jsx`, `StatCardsGrid.jsx`, `SalesChart.jsx`, `RecentActivity.jsx`, `LiveOrders.jsx`, `Dashboard.jsx` |
| 2 | **Billing refactor** — split 2174-line monolith into `useBillingData` hook + 7 components + 5 modals | `useBillingData.js`, `TablesWorkspace.jsx`, `RunningOrdersTab.jsx`, `OnlineOrdersTab.jsx`, `StoreActionsTab.jsx`, `BillingDetails.jsx`, `Modals.jsx` |
| 3 | **IndexedDB wrapper** — create/open DB, CRUD for 9 stores, `generateTempId()`, `enqueueSync()` | `src/lib/db.js` |
| 4 | **Sync engine** — `processSyncQueue()` FIFO replay, temp ID resolution via `resolveTempIdsInData()`, `updateLocalId()`, `replaceTempIdsInOrders/OrderItems()` | `src/lib/sync.js` |
| 5 | **Offline hook** — online/offline detection, auto-sync on reconnect, syncNow trigger | `src/hooks/useOfflineSync.js` |
| 6 | **Connectivity banner** — orange (offline), blue (syncing), green (synced) | `src/components/billing/ConnectivityBanner.jsx` |
| 7 | **Billing wired for offline** — all Supabase calls wrapped with offline fallback, writes queued to `sync_queue`, temp IDs generated for new records | `src/hooks/useBillingData.js` |
| 8 | **Menu offline support** — MenuCatalog reads from IndexedDB cache when offline, order creation generates temp IDs + sync queue entries | `src/views/MenuCatalog.jsx` |
| 9 | **Blank menu screen fixed** — added `menu_categories` to IndexedDB store names, bumped DB to version 2 | `src/lib/db.js` |
| 10 | **Post-sync auto-refresh** — `useEffect` watches `isOnline` + `lastSyncResult`, re-fetches workspace, resolves temp IDs in URL | `src/hooks/useBillingData.js` |
| 11 | **Manual order entry (offline)** — yellow form in BillingDetails: item name, qty, price → creates offline order + sync queue | `src/components/billing/BillingDetails.jsx`, `useBillingData.js` |
| 12 | **Menu pre-caching** — when billing page loads (online), also fetches+caches `menu_categories` and `menu_items` | `src/hooks/useBillingData.js` |
| 13 | **Auto table cleanup (60s)** — after settle bill, `setTimeout` flips table from cleaning → available after 60s | `src/hooks/useBillingData.js` |
| 14 | **Free All Cleaning Tables** — button in Store Actions tab, batch frees all cleaning tables (online + offline) | `src/hooks/useBillingData.js`, `src/components/billing/StoreActionsTab.jsx` |
| 15 | **This context file** — created CONTEXT.md with full project scope | `CONTEXT.md` |

### Session 2 — Payments Module (2026-06-30)

| # | Change | Files |
|---|--------|-------|
| 1 | **Payments hook** — `usePaymentsData` queries completed sessions, date range filter, summary totals (revenue, orders, avg, cash/online split) | `src/hooks/usePaymentsData.js` |
| 2 | **Payments view** — summary cards + filter bar (from/to) + payment table with status badges + detail modal | `src/views/Payments.jsx` |
| 3 | **Route wiring** — added `/payments` to router, sidebar nav link, header title | `App.jsx`, `Sidebar.jsx`, `Header.jsx` |
| 4 | **CONTEXT.md** — updated routes, file map, hooks, session log | `CONTEXT.md` |
| 5 | **Payments N+1 fix** — batched orders query: 2 queries instead of N+1 | `usePaymentsData.js` |

### Session 3 — Billing Complete (Discount, GST, Service Charge, Hold/Void, Split/Partial Payment) + Offline (2026-06-30)

| # | Change | Files |
|---|--------|-------|
| 1 | **Discount** — percentage/flat discount on bill, stored in uiState, applied to calculations, synced offline | `useBillingData.js`, `BillingDetails.jsx` |
| 2 | **Service Charge** — toggle + percentage input, applied to calculations, synced offline | `useBillingData.js`, `BillingDetails.jsx` |
| 3 | **GST Breakdown** — 10% split into CGST (5%) + SGST (5%) in invoice preview | `useBillingData.js`, `BillingDetails.jsx` |
| 4 | **Hold/Resume Bill** — hold sets session_status → 'hold', frees table; resume re-occupies table. Running Orders tab shows held bills | `useBillingData.js`, `RunningOrdersTab.jsx` |
| 5 | **Void Bill** — void with reason, modal with textarea, sets session_status → 'void', frees table | `useBillingData.js`, `Modals.jsx`, `Billing.jsx` |
| 6 | **Split Payment** — multiple payment methods (cash/card/UPI) with amounts, partial settle button | `useBillingData.js`, `BillingDetails.jsx`, `Billing.jsx` |
| 7 | **Partial Payment** — pay less than total, session stays as 'billing' status, balance tracked | `useBillingData.js`, `BillingDetails.jsx` |
| 8 | **Reprint Bill** — ReprintBillModal in completed section, shows session summary + status | `Modals.jsx`, `RunningOrdersTab.jsx`, `Billing.jsx` |
| 9 | **Running Orders Tab** — real data: active/held/completed session cards with resume/reprint actions | `RunningOrdersTab.jsx` |
| 10 | **Session Header** — added Hold + Void action buttons | `BillingDetails.jsx` |
| 11 | **All features offline-capable** — discount, SC, hold, void, partial payment all work offline with sync queue | `useBillingData.js` |
| 12 | **CONTEXT.md** — updated | `CONTEXT.md` |

### Session 4 — White Screen Bug Fix (2026-06-30)

| # | Change | Files |
|---|--------|-------|
| 1 | **Bug fix: TDZ crash on `/billing`** — `handleMarkAsPaid` `useCallback` referenced `total` (defined on line 1045) in its dependency array on line 551. JavaScript temporal dead zone threw `ReferenceError: Cannot access 'total' before initialization`. No error boundary → entire `<Billing>` component unmounted → white screen. Fix: compute `curTotal` inline inside the callback. | `useBillingData.js` |

### Session 5 — Reports Module (2026-06-30)

| # | Change | Files |
|---|--------|-------|
| 1 | **Reports hook** — `useReportsData` queries completed sessions + orders + order_items filtered by period (today/week/month), computes summary (sales, orders, avg, tax), top items, daily breakdown | `src/hooks/useReportsData.js` |
| 2 | **Reports view** — Rewrote placeholder with SummaryRow (4 cards), FilterBar (Today/Week/Month + Export Print), DailySalesChart (bar chart), TopItemsTable | `src/views/Reports.jsx` |
| 3 | **CONTEXT.md** — updated file map, session log, known issues | `CONTEXT.md` |
| 4 | **Bug fix: reports query error** — removed `item_name` from `order_items` select (column doesn't exist on that table — it's on `menu_items`, accessible via the join). | `useReportsData.js` |

### Session 6 — Settings Module (2026-06-30)

| # | Change | Files |
|---|--------|-------|
| 1 | **Settings hook** — `useSettingsData` CRUD via IndexedDB `meta` store + Supabase `restaurant_settings` table fallback, default values for restaurant/tax/SC/receipt | `src/hooks/useSettingsData.js` |
| 2 | **Settings view** — 3 sections (Restaurant Details, Tax/Service Charge, Receipt), form fields with inline save, loading/error states | `src/views/Settings.jsx` |
| 3 | **Route wiring** — added `/settings` route, sidebar NavLink (replaced alert), header title | `App.jsx`, `Sidebar.jsx`, `Header.jsx` |
| 4 | **CONTEXT.md** — updated | `CONTEXT.md` |

### Session 7 — Customers + QR Management (2026-06-30)

| # | Change | Files |
|---|--------|-------|
| 1 | **Customers hook** — queries sessions grouped by phone, computes visit count/total spent/last visit | `src/hooks/useCustomersData.js` |
| 2 | **Customers view** — table with search, avatar, visits badge, detail modal with visit history | `src/views/Customers.jsx` |
| 3 | **QR Management view** — table grid with QR codes via QR Server API, print per table, print all, download | `src/views/QRManagement.jsx` |
| 4 | **Route wiring** — `/customers`, `/qr-management` routes; sidebar nav (replaced CRM placeholder); header titles | `App.jsx`, `Sidebar.jsx`, `Header.jsx` |
| 5 | **CONTEXT.md** — updated file map, session log | `CONTEXT.md` |

### Session 8 — Staff Module + Cleanup (2026-06-30)

| # | Change | Files |
|---|--------|-------|
| 1 | **QR Management update** — added Add Table, Edit Table, Delete Table functionality with modal form; also fetches `restaurant_sections` for section dropdown | `src/views/QRManagement.jsx` |
| 2 | **Staff hook** — `useStaffData` CRUD via IndexedDB `meta` store + Supabase `staff` table fallback, PIN auto-generation, role management | `src/hooks/useStaffData.js` |
| 3 | **Staff view** — card grid with avatar, role badge, PIN display + regenerate, search bar, add/edit modal, delete with confirm | `src/views/Staff.jsx` |
| 4 | **Route wiring** — added `/staff` route, sidebar nav link (UserCog icon), header title | `App.jsx`, `Sidebar.jsx`, `Header.jsx` |
| 5 | **Sync retry with exponential backoff** — `processSyncQueue` now skips entries whose `nextRetryAt` is in future; backoff = 2^retries * 1s, capped at 30s; MAX_RETRIES bumped to 5 | `src/lib/sync.js`, `src/lib/db.js` |
| 6 | **Console.error cleanup** — replaced 4 `console.error` calls with alerts (Rule 14) | `useBillingData.js`, `Header.jsx` |
| 7 | **Metadata persistence** — discount, service charge, void reason, hold note now stored in IndexedDB session objects as `metadata` field; included in sync payloads | `useBillingData.js` |
| 8 | **CONTEXT.md** — updated routes, file map, session log, known issues | `CONTEXT.md` |

### Session 9 — Menu CRUD + Free Table + End Shift Report (2026-06-30)

| # | Change | Files |
|---|--------|-------|
| 1 | **Menu CRUD** — added Manage toggle to MenuCatalog; Add/Edit/Delete categories (name), Add/Edit/Delete items (name, price, description, category, image, availability); reusable FormModal component; shows unavailable items in manage mode | `src/views/MenuCatalog.jsx` |
| 2 | **Free Table** — added `handleFreeTable` to useBillingData (frees a single table from cleaning → available); small "Free" button on cleaning table cards in TablesWorkspace; wired through Billing.jsx | `useBillingData.js`, `TablesWorkspace.jsx`, `Billing.jsx` |
| 3 | **End Shift Report** — `EndShiftModal` component in Billing.jsx showing today's completed sessions: total orders, total items, total revenue; table with table number, customer, amount, time; accessible via toolbar button | `Billing.jsx` |
| 4 | **Header Shift control** — clickable shift badge with dropdown to End/Start shift; state persisted to localStorage; hides New Order button when shift ended | `Header.jsx` |
| 5 | **CONTEXT.md** — updated session log | `CONTEXT.md` |

### Session 10 — Order History + CSV Export + Print Bill (2026-06-30)

| # | Change | Files |
|---|--------|-------|
| 1 | **Order History page** — `useOrdersData` hook queries completed/void sessions with orders + items, supports search (bill ID, table, customer, item), status filter (all/completed/void), date range filter (today/week/month/all); `Orders.jsx` view with table, detail modal with item list, timeline, total | `src/hooks/useOrdersData.js`, `src/views/Orders.jsx` |
| 2 | **KOT Reprint** — from Order detail modal, opens print window with formatted KOT (itemized list, table, customer) | `src/hooks/useOrdersData.js`, `src/views/Orders.jsx` |
| 3 | **Route wiring** — added `/orders` route, sidebar nav link (History icon), header title | `App.jsx`, `Sidebar.jsx`, `Header.jsx` |
| 4 | **CSV Export for Reports** — `handleExport` builds CSV from summary/dailyBreakdown/topItems; triggers download via Blob + ObjectURL | `src/views/Reports.jsx` |
| 5 | **Print Bill** — `handlePrint` in `useBillingData` opens dedicated popup window with styled invoice (item list, discount, SC, GST breakdown, total); calls window.print() + window.close() | `useBillingData.js` |
| 6 | **Test workflow** — installed Vitest + testing-library + jsdom + fake-indexeddb; extracted pure calc functions into `src/lib/calculations.js`; 4 test files (47 tests total); scripts `npm test`/`test:watch`/`test:coverage` | `vitest.config.js`, `package.json`, `src/lib/calculations.js`, `src/__tests__/*` |
| 7 | **CONTEXT.md** — updated routes, file map, hooks, session log, test commands | `CONTEXT.md` |

### Session 11 — Full-App Test Suite + Bug Fixes (2026-06-30)

| # | Change | Files |
|---|--------|-------|
| 1 | **Pure calc extraction** — moved 13 calculation functions + constants from `useBillingData.js` to `src/lib/calculations.js`; fixed missing `calcTax`/`calcTotal` imports | `src/lib/calculations.js`, `useBillingData.js` |
| 2 | **Vitest + testing library setup** — installed vitest v4, @testing-library/react, @testing-library/jest-dom, jsdom, fake-indexeddb; created vitest config + test setup | `package.json`, `vitest.config.js`, `src/__tests__/setup.js` |
| 3 | **Test files x4** — `calculations.test.js` (22 tests: all calc functions + edge cases), `db.test.js` (9 tests: CRUD, bulk, meta, sync queue, temp IDs), `components.test.jsx` (10 tests: StatCard + ConnectivityBanner states), `navigation.test.jsx` (6 tests: Sidebar links + Header titles) | `src/__tests__/*.test.{js,jsx}` |
| 4 | **Unified full-app test** — `full.test.jsx` (89 tests: all calc functions, IndexedDB CRUD/bulk/meta/sync, 7 components with loading/error/empty/success states) | `src/__tests__/full.test.jsx` |
| 5 | **Bug fix: putMany race condition** — `resolve(results)` fired synchronously before IndexedDB put requests completed; fixed with completion counter to resolve after all puts | `src/lib/db.js` |
| 6 | **Bug fix: full.test.jsx JSX parse** — renamed `.js` → `.jsx` for OXC parser; PAID badge test fixed for `• PAID` text | `full.test.js` → `full.test.jsx` |
| 7 | **Build verification** — `npx vite build` passes 0 errors; all 136 tests pass (5 files, ~7s runtime) | — |

---

## 11. Pending Supabase Schema Changes

Run these in Supabase SQL Editor when ready:

```sql
-- 1. Staff table (for cross-device staff sync)
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

-- 2. Metadata JSONB column on customer_sessions (for discount/SC/void/hold persistence)
ALTER TABLE customer_sessions 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 3. Restaurant settings table (if not already created)
CREATE TABLE IF NOT EXISTS restaurant_settings (
  key TEXT PRIMARY KEY,
  value JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 12. Agent Instructions

When working on this project:

1. **Always read this file first** — understand the full context before any change
2. **Follow `06_General_Coding_Agent_Guide.md`** — especially the 25 Iron Rules
3. **Reference `Untitled_Document.md`** — the audit checklist
4. **Update this file after each session** — keep context fresh
5. **Run `npx vite build` after every change** — verify no regressions
6. **Prefer editing existing files** — don't create new files unless absolutely necessary
7. **All components must handle loading/error/empty states** — per guide Rule 11
8. **No magic numbers** — extract to named constants
9. **Functions < 50 lines** — extract helpers
10. **No console.log in production** — `console.error` is acceptable for errors during transition
