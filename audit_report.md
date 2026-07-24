# Lumiere Bistro POS — Full Audit & Testing Report

This report summarizes a comprehensive audit of the **Lumiere Bistro POS** application (React 19 + Vite 8 + Supabase + IndexedDB). The goal of this audit is to evaluate all UI components, business logic, offline capabilities, database sync behaviors, and security postures without writing any new production code.

---

## 📊 Summary of Module Audits

Here is the high-level status of each module based on a code and behavior audit:

| Module | Status | Offline Capable? | Crucial Findings & Missing Work |
| :--- | :---: | :---: | :--- |
| **Billing Operations** | 🟡 | **Partial** | Core Live POS is offline-capable. However, "End Shift Report" modal and Header "New Order" button bypass IndexedDB and crash if offline. |
| **Dashboard** | ✅ | **Yes** | Displays correct cached statistics when offline. Components are well-refactored. |
| **Menu Catalog** | 🟡 | **Partial** | Order viewer and cart creation are offline-capable. However, **Menu Catalog Management Mode** (CRUD on categories/items) calls Supabase directly and crashes if offline. |
| **Payments History** | ❌ | **No** | Completely broken when offline. Calls Supabase directly with no IndexedDB fallback read logic. |
| **Business Analytics (Reports)**| ❌ | **No** | Completely broken when offline. Calls Supabase directly with no IndexedDB fallback read logic. |
| **Customer Directory** | ❌ | **No** | Completely broken when offline. Calls Supabase directly with no IndexedDB fallback read logic. |
| **Order History** | ❌ | **No** | Completely broken when offline. Calls Supabase directly with no IndexedDB fallback read logic. |
| **Staff Management** | 🟡 | **No** | Saves to local cache but writes to Supabase without using the sync queue. Offline modifications are **silently lost** and never synced. |
| **Settings** | 🟡 | **No** | Similar to Staff Management: settings modified offline are written to the local cache but never enqueued to sync. |
| **Security & Auth** | 🔴 | **N/A** | No authentication page or guards. Anonymous users have total database read/write/delete privileges due to open Supabase RLS policies. |

---

## 🎨 UI & Styling Audits (Critical Visual Issues)

The most severe visual and presentation bugs in the application stem from **scoping failures** in the styling system, **responsive design gaps**, and **print media leakages**:

### 1. Global CSS Style Collisions (`styled-jsx` Scoping Failures)
Because the Vite compiler is not configured with a `styled-jsx` compiler plugin, all styles inside `<style jsx>` blocks are treated as **global CSS**. Since identical, generic class names are used across multiple view files, their styles collide globally. Whichever view loads last overrides the styling of all other pages:

* **Modal Width Collisions (`.modal-content`):**
  * `QRManagement.jsx` sets `.modal-content` width to `400px`.
  * `MenuCatalog.jsx` sets it to `440px`.
  * `Staff.jsx` sets it to `460px`.
  * `Orders.jsx` and `Payments.jsx` set it to `560px`.
  * *Result:* When you navigate, modals on previous pages will randomly shrink or stretch to match the last-rendered page's layout.
* **Save Button Layout Breaks (`.save-btn`):**
  * Modal files (`Staff.jsx`, `MenuCatalog.jsx`) set `.save-btn` to `width: 100%;` and primary color (brown).
  * `Settings.jsx` sets `.save-btn` to `display: flex; width: auto;` in the top header.
  * *Result:* If a user edits a staff member, navigating back to `Settings` will stretch the header's "Save All Settings" button to `100%` width and break the header layout.
* **Loading & Error Layout Collisions (`.loading-state`, `.error-state`):**
  * `BillingDetails.jsx` sets `.error-state` to horizontal row layout (`display: flex;` with default row direction).
  * Other views (`Settings.jsx`, `Staff.jsx`, etc.) set it to vertical column (`display: flex; flex-direction: column;`).
  * *Result:* If a billing page throws an error, all other pages' error layout stacks horizontally, squishing error icons, descriptions, and retry buttons side-by-side.
* **Search Bar Breakage (`.search-bar`):**
  * `Header.jsx` defines `.search-bar` as an inline flex-input wrapper with border-radius, background, and padding.
  * `Staff.jsx` and `Orders.jsx` define it as a layout spacer with `margin-bottom: 1.25rem`.
  * *Result:* The staff search input inherits header styles, while the top navigation search bar gets pushed down, misaligning the header layout.

### 2. Lack of Mobile & Tablet Responsiveness
* The main dashboard layout relies on `Sidebar.jsx` with a fixed width of `280px` and `.app-container` in row direction with no responsive rules.
* On viewport widths below `1024px` (like iPads or small tablets commonly used in restaurant floor operations), the sidebar occupies half the screen, squishing POS workspace tables and cart details.
* The header row (`Header.jsx`) has multiple inline selectors (Search, Outlet Selector, Date, New Order, Shift Badge, Alert Icon) that overflow and clip because there is no collapse/hamburger trigger.

### 3. Print Layout Leakage (Receipt Formatting)
* Pop-ups are blocked by default in most browsers, causing `Billing.jsx`'s `handlePrint` to fall back to printing the current window.
* The `@media print` query in `Billing.jsx` only hides `.pos-workspace-pane`. It fails to hide the sidebar (`.sidebar`), header (`.header`), and main page layout structure during billing print requests.

---

## 🔍 In-Depth Technical Breakdown

### 1. Offline & Sync Engine Gaps (High Risk)
While the core live billing operations (`BillingDetails.jsx` and `TablesWorkspace.jsx` via `useBillingData.js`) have excellent offline fallback logic utilizing IndexedDB queues, several secondary pages and triggers completely bypass this architecture:

* **The Header "New Order" Button:** 
  Clicking the "New Order" button in [Header.jsx](file:///c:/Users/PC/Desktop/Projects/baba%20admin/src/components/Header.jsx#L90-L133) executes `handleStartSession`, which performs direct Supabase inserts (`supabase.from('customer_sessions').insert(...)` and `supabase.from('restaurant_tables').update(...)`). If offline, this operation fails instantly with a crash/alert, even though the same operation performed via table floor click is fully offline-capable.
* **Non-Offline Analytics & History Views:** 
  The views for [Payments](file:///c:/Users/PC/Desktop/Projects/baba%20admin/src/views/Payments.jsx), [Reports](file:///c:/Users/PC/Desktop/Projects/baba%20admin/src/views/Reports.jsx), [Customers](file:///c:/Users/PC/Desktop/Projects/baba%20admin/src/views/Customers.jsx), and [Orders](file:///c:/Users/PC/Desktop/Projects/baba%20admin/src/views/Orders.jsx) all perform direct queries against Supabase without using IndexedDB as a local read store. Going offline turns these pages into dead ends.
* **Silent Sync Failures (Staff & Settings):**
  In [useStaffData.js](file:///c:/Users/PC/Desktop/Projects/baba%20admin/src/hooks/useStaffData.js#L76-L149) and [useSettingsData.js](file:///c:/Users/PC/Desktop/Projects/baba%20admin/src/hooks/useSettingsData.js#L80-L97), write operations update the local IndexedDB meta store and then fire a remote Supabase query. If offline, the remote query failure is simply caught and ignored, but the write **is not enqueued** in `sync_queue`. The local cache remains updated, but the change will **never** propagate to the cloud database on reconnection.

---

### 2. Logic & Calculation Discrepancies
There is a fundamental design flaw and mismatch between the unit tests and the production code regarding tax calculations:

* **Inconsistent Tax Base in `calcTotal`:**
  In [calculations.js](file:///c:/Users/PC/Desktop/Projects/baba%20admin/src/lib/calculations.js#L49-L51), the `calcTotal` function computes tax on the *original subtotal*:
  ```javascript
  export function calcTotal(subtotal, discountAmount, serviceCharge) {
    return Math.max(0, subtotal - discountAmount + serviceCharge + calcTax(subtotal));
  }
  ```
  However, standard GST rules dictate that taxes must be calculated on the *taxable value* (post-discount). 
* **Production Workaround:**
  To bypass this design error, the production code in [useBillingData.js](file:///c:/Users/PC/Desktop/Projects/baba%20admin/src/hooks/useBillingData.js#L1110) passes the `taxableAmount` (subtotal - discount) as the first argument (`subtotal`) and `0` as the `discountAmount`:
  ```javascript
  const total = calcTotal(taxableAmount, 0, serviceCharge);
  ```
* **Test Mismatch:**
  The unit test suite in [calculations.test.js](file:///c:/Users/PC/Desktop/Projects/baba%20admin/src/__tests__/calculations.test.js#L122-L130) verifies that the tax is calculated on the *original* subtotal. This means the tests are validating a behavior that is intentionally bypassed in the production billing system.

---

### 3. Security & Access Audit (Critical Vulnerabilities)

Security is the weakest point of the application:
* **Missing Auth Barriers:**
  There is no login system, routing guards, or Role-Based Access Control (RBAC). Any client-side visitor can view revenue dashboards, settings, payment directories, customer lists, and staff PINs.
* **Vulnerable Supabase RLS Configuration:**
  As defined in [supabase_migration.sql](file:///c:/Users/PC/Desktop/Projects/baba%20admin/supabase_migration.sql#L70-L83), Row Level Security is technically enabled on all tables, but the policy applied for all tables allows unrestricted access for the anonymous client key:
  ```sql
  CREATE POLICY anon_all_staff ON staff FOR ALL USING (true) WITH CHECK (true);
  ```
  This permits any anonymous guest to fetch, modify, insert, or wipe out the entire database (including billing logs and staff credentials) by calling the Supabase API directly from a browser console.
* **Plaintext PIN Storage:**
  Staff PINs are stored in plain text inside the `staff` table. Combined with the open RLS policies, this makes it trivial for anyone to retrieve the PINs of managers and administrators.

---

## 🛠️ Verification & Test Suite Execution

All 136 vitest unit and integration tests successfully pass:
* `src/__tests__/calculations.test.js` (22 tests) — Validates subtotal, tax, service charge, and total helpers.
* `src/__tests__/db.test.js` (9 tests) — Tests local IndexedDB CRUD and sync queue enqueuing.
* `src/__tests__/components.test.jsx` (10 tests) — Verifies layout components rendering states.
* `src/__tests__/navigation.test.jsx` (6 tests) — Checks routing sidebar links and header titles.
* `src/__tests__/full.test.jsx` (89 tests) — Comprehensive full-app integration suite.

While the existing tests pass, they fail to cover the offline regression points (e.g. failing to verify whether clicking header buttons or navigating reports breaks when network is unavailable).

---

## 📌 Recommended Action Items

If development resumes, the following high-priority issues must be addressed:
1. **Fix CSS Scoping:** Convert inline `<style jsx>` tags to CSS Modules (`*.module.css`) or standard unique scoped prefixes (e.g. `.billing-modal-content`, `.settings-save-btn`) to stop global style overrides and layout breaks.
2. **Implement Responsive Breakpoints:** Introduce media queries in `index.css`, `Sidebar.jsx`, and `Header.jsx` to allow the sidebar to collapse into a mobile drawer menu and align elements cleanly on tablets.
3. **Correct Receipt Printing:** Add a dedicated `@media print` rule to hide the sidebar (`.sidebar`), header (`.header`), and main page layout structure during billing print requests.
4. **Standardize Offline Architecture:** Update `Payments`, `Reports`, `Customers`, and `Orders` pages to fallback to local IndexedDB queries when the app is offline.
5. **Queue Settings & Staff Changes:** Route settings updates and staff modifications through the `sync_queue` instead of ignoring offline failures.
6. **Fix Header Action Fallbacks:** Align the header's "New Order" table assignment logic with the offline-capable `handleStartSession` in `useBillingData.js`.
7. **Implement Basic Auth & Lock Down RLS:** Introduce a staff PIN login system, restrict navigation routes to authenticated roles, and configure proper Supabase RLS policies (e.g. restricting settings/staff tables to authenticated manager roles only).
