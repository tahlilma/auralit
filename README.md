# Auralit ERP

Auralit is a rebuild of the **Arctic ERP** used by Barista Garage, a coffee-equipment trading business in Bangladesh (currency ৳ BDT). Arctic ERP is a PHP/jQuery system hosted at `arcticerp.com/baristagarage`. The goal is **every feature of the original, with a cleaner, faster and easier interface**.

This document is the starting point for anyone joining the project. It covers:

1. [Project status](#1-project-status): how far along the rebuild is
2. [Feature parity](#2-feature-parity-with-the-original): what was carried over from the original
3. [What is left](#3-what-is-left)
4. [What to add next](#4-what-to-add-next)
5. [Getting started](#5-getting-started)
6. [How everything works](#6-how-everything-works): architecture, accounting, stock, permissions
7. [How to extend it](#7-how-to-extend-it): recipes for the common changes
8. [Conventions and gotchas](#8-conventions-and-gotchas)

---

## 1. Project status

**All screens of the original app work, and the accounting is verified. No business data has been migrated yet, and there is no Bangla interface yet.**

| Measure | Value |
| --- | --- |
| Original sidebar entries reproduced | 139 of 139 (every menu item has an equivalent screen) |
| Original reports reproduced | 93 of 93 (Report Center) |
| Master-data / setup screens | 39 (one config-driven engine) |
| Database tables | 72 |
| Server (RPC) functions | 127 |
| Route pages | 41 (many are generic, e.g. `/data/[entity]` serves 39 screens) |
| App source | ~11,000 lines of TypeScript/TSX |

**Verified on 2026-10-30:**

- `next build` passes.
- `scripts/smoke.mjs` runs the main business flow end to end:
  1. Purchase with serials.
  2. Sale with split payment, cheque and serials.
  3. Sales return.
  4. Receipt, payment, expense and bank transfer vouchers.
  5. Branch transfer, disposal and delivery.
- After the run, the trial balance and the balance sheet balance, and all 93 reports execute without errors.
- Key screens were checked in a headless browser at desktop and phone widths.

**Not yet done:** no real data has been migrated from the old system, the Bangla interface is missing, and there is no automated test suite beyond the smoke script. See [section 3](#3-what-is-left).

---

## 2. Feature parity with the original

How the original was studied: we logged in and read every page (read-only) to capture its fields, table columns, filters and AJAX endpoints. The old app was never modified. The table maps each original menu to the rebuild.

| Original menu | Original pages | In Auralit | Notes / improvements |
| --- | --- | --- | --- |
| Dashboard | 1 | ✅ `/` | Daily/monthly sales, top products, income-expense-profit, business overview, sales by employee, cash/bank/mobile balances, receivable/payable, stock value |
| Daily Process (price list, price update, expenses, expense heads) | 6 | ✅ | Bulk price update with % change; price history; barcode & sticker printing (Code 128) |
| Purchase (orders, invoices, returns) | 6 | ✅ | Order approval, one-click convert order → invoice, serial entry, color/size, "Opening Stock" supplier, sets sale price |
| Sales (estimates, invoices, returns) | 6 | ✅ | Full POS (see below); estimate → invoice; return by invoice no **or serial scan** |
| Service (items, estimates, invoices) | 5 | ✅ | Same editor as POS with service items |
| Customer Enquiry (follow-up, source, type, course of action) | 4 | ✅ | Follow-up timeline, "due today" tab, filters by product/location/type/date |
| Warranty (claim, checking, manage, delivered, stock, self stock, claim to supplier, service center) | 8 | ✅ | Claim by serial or invoice lookup with warranty-expiry check; replacement from stock books the faulty unit into "warranty bad stock" |
| Inventory (warehouse, delivery, received, branch/warehouse/combined stock, transfers, disposal) | 9 | ✅ | Partial delivery/receive against invoices; serial-aware transfers; disposal with recovered amount |
| Client Setup (customers, suppliers, groups) | 6 | ✅ | Opening balance on create; credit limit warning in POS; statement drawer; CSV import |
| Product Setup (products, parents, categories, sub-categories) | 8 | ✅ | Product detail drawer: stock by location, movements, serials, price history |
| Offers & Rebate (offers, assign to items, rebate claims) | 5 | ✅ | Offers auto-apply in POS by product/brand/category/sub-category; supplier-funded offers feed rebate claims |
| Master Setup (brand, manufacturer, unit, currency, country, transporter, color, size, district, zone) | 17 | ✅ | All 64 districts + 492 upazilas seeded |
| Accounts Setup (class, group, sub-group, ledger) | 7 | ✅ | Default chart of accounts seeded |
| Accounts Transaction (payment, receipt, journal, transfer, cheques, donation) | 9 | ✅ | Receipts/payments can target an invoice no (updates its due); cheque clear / bounce (bounce reverses the money) |
| Installment & Loan (loan ID) | 1 | ✅ | Loan accounts (taken / given) with statements |
| Finance (chart of accounts, income statement, trial balance, balance sheet, analysis) | 5 | ✅ | + ledger statement for any ledger; ratios and 12-month trend |
| Payroll (departments, designations, employees, leave types, leave records, attendance, salary sheet & payslip) | 12 | ✅ | Attendance grid, salary posting/reversal, printable payslip |
| Bank & Mobile (banks, accounts, mobile accounts) | 5 | ✅ | Each account is a ledger; live balances |
| Personal (profile, password, notes, todo, events) | 5 | ✅ | Notes with colours/labels/favourites; month calendar |
| Report | 93 | ✅ `/reports` | Searchable Report Center, favourites, CSV export, print |
| User & Role (roles, users, report roles) | 4 | ✅ | Permission matrix (module × read/write/edit/delete/print); per-role report access; activity log |
| Company & Setting (company, local settings, SMS template, data management) | 4 | ✅ | + branches; SMS gateway test & log; database backup download |
| Global widgets (search by invoice/code/serial, quick links, chat, activity history) | – | ✅ | Ctrl+K command palette, quick-action grid, team chat, history drawer on every list |

### Things the rebuild adds that the original lacked

- **POS ergonomics:**
  - barcode/serial scan into one box, plus browsing by category, brand or sub-category
  - a cart draft that survives page reloads, and hold/resume carts
  - a cash-tendered change calculator
  - keyboard shortcuts: F2 new sale (anywhere), F3 search, F8 hold, F9 save & print, F10 save
- **One source of truth for money:** every document posts a double-entry journal, so every balance and statement agrees by construction.
- **Usability:** CSV import/export on every master list, pinned sidebar pages, date-range presets, dark mode, phone layout.
- **Safety:** you can't edit or delete an invoice that has returns or deliveries. Negative stock is blocked unless you allow it in settings. An edit-lock window is available.

---

## 3. What is left

Ordered by impact.

| Gap | Detail |
| --- | --- |
| **Data migration** | No customers, suppliers, products, balances or history from the old system yet. CSV import exists per list (download the template from the list's Import dialog), but opening stock, opening balances and historical invoices still need a migration plan. |
| **Bangla interface** | The `language` setting is stored. The UI and print labels are English only. Company Bangla name/address fields exist. |
| **Auto-generated barcodes** | The `barcode_type` / `barcode_length` settings are stored but not used. Products without a barcode print their product code as the barcode. |
| **Automated tests** | Only `scripts/smoke.mjs`. There are no unit tests and no browser tests. |
| **Lint clean-up** | `eslint` reports many style findings: mostly `no-explicit-any`, plus React-compiler advisories like "setState in effect". None break the build. |
| **Multi-branch depth** | Stock is per branch/warehouse and the POS uses the signed-in user's branch. Reports filter by branch where the original did, but branch-level permissions (restricting a user to their branch's data) are not enforced. |
| **SMS** | Works through a configurable URL/API gateway. Not tested against the business's real provider. |
| **Chat** | Polls every 5–20 s. No push/websocket. |

Intentionally not carried over: two pages that were commented out in the original menu ("Follow Up – Service", "Manage Installment").

---

## 4. What to add next

Suggested roadmap:

1. **Migrate data from Arctic ERP.**
   - Read the old system with GET-only scraping, or a DB export if the vendor provides one.
   - Import into CSV templates, then post opening balances (customer/supplier `opening_balance`) and opening stock (purchase from the "Opening Stock" supplier).
   - Reconcile the trial balance against the old system's.
2. **Tests:**
   - Turn `scripts/smoke.mjs` into a proper test that runs against a temporary DB.
   - Add Playwright tests for the POS and the return flows.
3. **Bangla:** add a small i18n dictionary, starting with invoice/receipt print labels and then the navigation.
4. **Branch permissions:** add `branch_id` scoping to list queries for non-admin users.
5. **Barcodes:** generate barcodes on product create according to the settings; offer label sheet presets (A4 sheets, 38×25 mm rolls).
6. **Deployment:**
   - Run `next build && next start` behind a reverse proxy on a small VPS, with HTTPS (cookies become `secure` automatically).
   - Schedule a nightly copy of `data/auralit.db` (or call `/api/backup`).
7. **Nice to have:**
   - SMS on due reminders.
   - Email invoices as PDF.
   - Dashboard widgets per role.
   - Audit diff (old → new values) in history.

---

## 5. Getting started

**Requirements:** Node.js ≥ 22.13 (developed on Node 24). There's no database server, Docker or native build tools to install.

```bash
npm install
npm run dev                 # http://localhost:3000
npm run build && npm start  # production
node scripts/smoke.mjs      # end-to-end check (writes test data — use a throwaway DB)
npx tsc --noEmit            # type-check
```

**First run:** the app creates `data/auralit.db` and seeds it with:

- the chart of accounts and system ledgers
- districts, upazilas, currencies, units and colors
- enquiry sources, types and courses of action
- a walk-in customer, an "Opening Stock" supplier, and an Administrator role and user

**Login:** `admin@example.com` / `admin123`. Change it under Profile.

**Reset to a blank system:** stop the app and delete the `data/` folder. `data/` is git-ignored.

**Backup / restore:**

- Backup: Company & Settings → Data Management → Download backup. This produces a consistent `VACUUM INTO` copy.
- Restore: stop the app and replace `data/auralit.db` with the backup.

---

## 6. How everything works

### 6.1 Stack

- **Next.js 16** (App Router), with `cacheComponents` and `partialPrefetching` on. **React 19**, **Tailwind CSS v4**, `lucide-react` icons. There's no other UI library.
- **SQLite** via Node's built-in **`node:sqlite`** (`DatabaseSync`). It's synchronous, there's no ORM, and the SQL is hand-written.
- Read `node_modules/next/dist/docs/` before touching framework code. This Next version differs from older ones. For example, middleware is now `proxy.ts`, `params` are promises, and there's a Cache Components prerender model.

### 6.2 Request flow

```
Browser (client components)
   │  rpc('docs.saveDoc', kind, payload)          lib/client/rpc.ts  (typed from server signatures)
   ▼
POST /api/rpc  { fn, args }                        app/api/rpc/route.ts
   │  session cookie → SessionUser                 lib/server/auth.ts
   │  resolve 'module.function'                    lib/server/rpc.ts
   ▼
lib/server/api/<module>.ts  fn(user, ...args)
   │  assertCan(user, module, action)              permission check in EVERY function
   │  tx(() => { …SQL…, postJournal(), addMove() })   lib/server/db.ts, lib/server/core.ts
   ▼
SQLite  data/auralit.db
```

- **Pages are thin.** Most `page.tsx` files render one client component. The component loads its data with `useRpc(name, args, deps)` and mutates with `rpc(...)`. This keeps the app working with Cache Components: no request-time data is read during server render.
- **Auth:**
  - `POST /api/auth` signs in and sets the httpOnly `auralit_session` cookie; `DELETE /api/auth` signs out.
  - Passwords are hashed with scrypt.
  - `proxy.ts` only redirects visitors without the cookie to `/login`. Real validation happens in `/api/rpc`.
- **Errors:** server functions throw `HttpError(status, message)`. The message is shown to the user as a toast.
- **Other endpoint:** `POST /api/backup` (admin only) streams the database file.

### 6.3 Folder map

```
app/
  (app)/                  authenticated area (layout = sidebar + topbar)
    page.tsx              dashboard
    data/[entity]/        generic master-data screens (39)
    doc/[kind]/…          sales/purchase/service documents: list, new, [id] view/print, [id]/edit
    vouchers/[kind]/…     payment, receipt, journal, contra, expense, donation
    stock/[kind]/…        transfer_b, transfer_w, delivery, receive, disposal, bad_claim, self_bad
    inventory/[scope]     branch | warehouse | combined stock
    warranty/[stage]      claims | checking | manage | delivered | stock
    finance/[view]        chart | income | trial | balance | analysis | ledger
    reports/, reports/[key]
    daily/, enquiry/, offers/, accounts/cheques, payroll/, personal/, users/, settings/, profile/, clients/sms
  api/rpc, api/auth, api/backup
  login/
components/
  ui/                     primitives, overlay (modal/drawer/toast/confirm), combobox, table, charts
  shell/                  session provider + permission Guard, sidebar, topbar (Ctrl+K, notifications, chat)
  entity-page.tsx         generic list/form engine
  doc/                    POS/document editor, return editor, list, invoice view/print
  vouchers.tsx, stock.tsx, warranty.tsx, finance.tsx, reports.tsx, payroll.tsx, admin.tsx, settings.tsx, …
lib/
  entities.ts             config for all master-data screens (fields, columns, joins, filters)
  calc.ts                 document totals math, shared by client preview and server
  reports-meta.ts         report catalogue: titles, groups, filters
  nav.ts                  sidebar + quick actions
  permissions.ts          modules and actions
  format.ts               money (৳, lakh grouping), dates, amount-in-words, CSV
  server/
    schema.ts, seed.ts, seed-data.ts   DB schema (idempotent) and first-run data
    db.ts                 connection, all/get/run/val/insert/update, tx()
    auth.ts               sessions, assertCan, activity log
    core.ts               numbering, ledgers, postJournal, stock moves, avgCost
    sms.ts                gateway sender + templates
    rpc.ts                module registry
    api/                  crud, docs, vouchers, stock, ops (warranty/offers/enquiry), payroll, finance, reports, admin
scripts/smoke.mjs         end-to-end check
docs/PLAN.md              original plan and module checklist
```

### 6.4 Accounting model (the most important part)

Every money-related action writes **one balanced journal**: a `journals` row plus its `journal_lines` rows. The check is ∑ debit = ∑ credit, enforced in `postJournal`.

- Every customer, supplier, bank account, mobile wallet, loan, employee and expense head **is a ledger** (`ledgers.kind` + `ref_id`).
- A balance is always `SUM(debit − credit)` over that ledger's lines.
- System ledgers are looked up by `system_key` (`sys('SALES')`); the full list is in `lib/server/seed.ts`.

Chart structure: 5 classes (Assets, Liabilities, Owner's Equity, Expenses, Revenue) → 9 groups → sub-groups → ledgers.

**Posting rules.** Totals come from `lib/calc.ts`:

```
total = gross − item discounts − discount + VAT + AIT + other + freight − redeem − less − exchange
```

| Event | Debit | Credit |
| --- | --- | --- |
| Sale / service invoice | Customer (total); Discount on item / on sales; Reward redeemed; Less given; Inventory (exchange items); COGS (cost) | Sales / Service income (gross); VAT payable; AIT payable; Other charges; Freight charged; Inventory (cost) |
| …payment at invoice | Cash/Bank/Mobile | Customer |
| Purchase invoice | Inventory (net of line discounts); VAT on purchase; Tax on purchase; Other direct expense; Freight on purchase | Supplier (total) — or *Opening Balance Equity* for the "Opening Stock" supplier; Discount on purchase; Less received |
| Sales return | Sales return; Inventory (cost) | Customer; COGS (cost) |
| Purchase return | Supplier | Inventory |
| Payment voucher | Pay-to ledger (amount + less) | Source account; Less taken on payment |
| Receive voucher | Received-to account; Less given on receipt | Received-from ledger (amount + less) |
| Journal | chosen ledger | chosen ledger |
| Transfer (contra) | Destination; Bank charges | Source (amount + charges) |
| Expense | Expense head | Paying account |
| Disposal | Recovery account; Product adjustment (loss) | Inventory |
| Warranty replacement | Warranty bad stock (faulty unit cost); Product adjustment | Inventory (new unit) |
| Claim to supplier | Supplier | Warranty bad stock / Inventory |
| Self stock manage | Inventory (repaired) / Product adjustment (write-off) | Warranty bad stock |
| Salary posting | Salary expense; Festival bonus | Employee ledger (net pay) |
| Rebate claim | Supplier | Rebate income |
| Opening balances (customer/supplier/bank/loan) | party or account | Opening Balance Equity (or reverse) |
| Cheque bounce | reverses the account side against the party | |

**Editing and deleting** a document reverses everything it created: journals, stock moves, serial status and reward points. When editing, the document is then re-applied under the same number. Journals link to their source through `ref_type` / `ref_id` (`'doc'`, `'stock'`, `'claim'`, `'rebate'`, `'attendance'`, `'opening:<kind>'`, `'cheque'`).

**Invoice due:**

```
due = total − paid at invoice − receipts tagged with that invoice no (journal_lines.ref_doc_id) − returns
```

### 6.5 Inventory model

- **Stock moves.** `stock_moves` is an append-only log: `product_id, color_id, size_id, loc_type ('B' branch | 'W' warehouse), loc_id, qty (±), cost, kind, ref`. On-hand stock is `SUM(qty)` for any slice. The `kind` values are `purchase, opening, sale, sreturn, preturn, transfer_in/out, disposal, exchange, warranty_out, adjust_in/out, bad_claim`.
- **Cost.** A sale uses the moving average of inbound costs (`avgCost`). That cost is stored on the sale line, so profit reports stay stable later.
- **Serials / IMEI.** The `serials` table tracks status: `instock, sold, preturned, disposed, warranty, claimed`. Each change is logged in `serial_history`. A product whose mode is `serial` or `imei` cannot be bought or sold without serials.
- **Delivery and receive** documents only record physical hand-over against invoice lines (partial allowed). The stock itself already changed when the invoice was saved. That is why stock screens show "Sold / Delivered / Undelivered".

### 6.6 Document numbering and codes

- **Document numbers** come from `nextNo(kind)` in `core.ts`, following Local Settings, e.g. `SEL-BGI-301026-001`. Prefixes: SEL, EST, SRT, POR, PUR, PRT, SER, SES, PAV, REV, JOU, TRN, AXE, DON, BTR, WTR, DEL, RCV, DIS, BSC, SBS, WAR, REB, ENQ. Counters live in the `counters` table.
- **Master codes** come from `nextCode()`: `ABA/CU/001`, `ABA/SU/001`, `ABA001P`, `EM-10001`. The `ABA` prefix is configurable.

### 6.7 Permissions

- `lib/permissions.ts` lists 21 modules × 5 actions (read, write, edit, delete, print).
- A role stores `perms` (JSON) and `report_perms` (a list of report keys, or `["*"]`). `is_admin` roles bypass all checks.
- **Server:** every API function calls `assertCan(user, module, action)`. This is the real gate.
- **Client:** `useSession().can()` hides menu items and buttons, and `<Guard module=…>` blocks pages. This is cosmetic only.

### 6.8 Generic engines (why there are few files for many screens)

| Engine | Config | Serves |
| --- | --- | --- |
| Entity engine | `lib/entities.ts` (fields, columns, list SELECT, search, filters) + per-entity hooks in `lib/server/api/crud.ts` (codes, ledgers, opening balances, delete guards) | 39 setup screens: list, search, filter, sort, paging, create/edit drawer, delete, CSV import/export, print, history, statement |
| Document engine | `DOC_META` in `lib/calc.ts` + `lib/server/api/docs.ts` | 8 document kinds (`sale, estimate, sreturn, porder, purchase, preturn, service, sestimate`) |
| Voucher engine | `META` in `components/vouchers.tsx` + `lib/server/api/vouchers.ts` | 6 voucher kinds |
| Stock-document engine | `components/stock.tsx` + `lib/server/api/stock.ts` | 7 stock document kinds |
| Report engine | `lib/reports-meta.ts` (filters) + `R` map in `lib/server/api/reports.ts` (SQL → `{ sections: [{ columns, rows, totals }] }`) | 93 reports, all rendered by one runner |
| Lookups | `LOOKUPS` in `crud.ts` (cached on the client by `components/ui/combobox.tsx`) | every dropdown |

### 6.9 UI building blocks

- **`components/ui/primitives.tsx`:** Button, Input, Select, Field, Card, PageHeader, Badge, Stat, Tabs, Money.
- **`overlay.tsx`:** Modal, Drawer, and `useUI()` for `toast()` and `confirm()`.
- **`combobox.tsx`:** a searchable select with keyboard navigation. Supports static options or async loading. `RefSelect` binds it to a lookup key.
- **`table.tsx`:** DataTable (sorting, totals row, selection, skeletons), Pager, SearchInput, DateRange with presets.
- **`charts.tsx`:** dependency-free SVG charts that size themselves to their container.
- **Theming:** CSS variables in `app/globals.css`, with light and dark sets. Tailwind tokens: `bg-surface`, `text-ink`, `text-muted`, `bg-brand`, `border-line`, `text-ok/bad/warn`.
- **Printing:** the shell is hidden with `no-print`. Each printable area uses `print-area`.

---

## 7. How to extend it

**Add a master-data screen**

1. Create the table in `lib/server/schema.ts`. Use `CREATE TABLE IF NOT EXISTS`. Schema changes are applied on startup but never alter existing columns; for those, write a manual `ALTER`.
2. Add an entry to `ENTITIES` in `lib/entities.ts`.
3. Add a sidebar link in `lib/nav.ts` → `/data/<key>`.
4. Optional: add a lookup in `LOOKUPS`, and hooks in `HOOKS` (`crud.ts`) for auto codes, ledgers or delete guards.

**Add a report**

1. Add a `ReportMeta` to `REPORTS` in `lib/reports-meta.ts` (key, group, filter names).
2. Add a function with the same key to `R` in `lib/server/api/reports.ts`.
3. Helpers are available: `docW` / `itemW` (where-clauses), `invoiceRows`, `lineRows`, `stockAt`, `stmt`, `one`, `table`, `kv`.

**Add a server function**

1. Export `fn(user: SessionUser, ...args)` from a module in `lib/server/api/`.
2. Call `assertCan` first.
3. Wrap writes in `tx()`.
4. Call `log()` for history.

It becomes callable as `rpc('module.fn', ...)`, fully typed, with no registration step. Every exported function is reachable by any signed-in user, so never export helpers that skip the permission check.

**Anything that moves money** must go through `postJournal`, so the books stay balanced. Anything that moves goods must go through `addMove`, with a reversal path (`deleteJournalsFor` / `deleteMovesFor`).

---

## 8. Conventions and gotchas

- **Money:** stored as REAL and rounded to 2 decimals with `round2` / `r2` on every write. Displayed with `money()`: ৳ with lakh grouping, e.g. `1,00,000.00`.
- **Dates:** stored as ISO `YYYY-MM-DD` strings (local time). Timestamps use `datetime('now','localtime')`.
- **Query helpers:** `all()` / `get()` return untyped rows on purpose. Spreading typed rows loses index signatures, so typed rows were more trouble than help.
- **Transactions:** `tx()` is re-entrant. Nested calls join the outer transaction.
- **SQL injection:** never interpolate user input into SQL. The few interpolations in `reports.ts` are `Number(...)` casts or constants. List filter keys are regex-checked, and sort keys are checked against the column list.
- **`node:sqlite`** prints an `ExperimentalWarning` on start. It is harmless.
- **`AGENTS.md`** is rewritten by `next dev`. Commit it as-is.
- **Instant navigation:** `next.config.ts` sets `experimental.instantInsights.validationLevel: 'manual-warning'`. The app shell loads per-user data on the client, so the default "every page must navigate instantly" dev validation would flag every route.
- **Dev server after a build:** after running `next build`, restart `next dev`. A dev server that was already running can fail with "Jest worker encountered … child process exceptions".
- **Live site:** if you need to look at the original again, use read-only requests only. Never submit forms against the live business data.
