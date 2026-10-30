# Auralit ERP — rebuild of the Arctic ERP (Barista Garage) feature set

Goal: every function of the original ERP, with a cleaner, faster, easier UI.

## Architecture

- Next.js 16 (App Router, Cache Components on), React 19, Tailwind v4, `lucide-react` icons.
- Database: SQLite through Node's built-in `node:sqlite` (file at `data/auralit.db`, created and seeded on first run).
- One typed RPC endpoint (`POST /api/rpc`): every server function checks the session and the role permission.
- Accounting is double-entry. Every business document posts a journal, so the trial balance, income statement,
  balance sheet, ledger, cash, bank, customer and supplier statements are all computed from `journal_lines`.
- Stock is a movement log (`stock_moves`) per product, color, size and location (branch `B` or warehouse `W`).
- Serial/IMEI numbers are tracked in `serials` with a status history.
- Config-driven engines:
  - `lib/entities.ts`: master data and setup screens (list, search, create, edit, delete, CSV import/export, print, history).
  - Document editor: sales invoice (POS), sales estimate, purchase order, purchase invoice, service estimate, service invoice.
  - Return editor: sales return and purchase return.
  - Voucher editor: payment, receipt, journal, bank/cash transfer, expense, donation.
  - Stock documents: branch/warehouse transfer, delivery, receive, disposal, supplier bad-stock claim, self bad-stock.
  - Reports: about 90 report definitions in `lib/server/reports/*`, each with filters, columns and totals.

## Module checklist (original menu → this app)

- Dashboard: daily/monthly sales charts, top products, income/expense/profit, business overview, sales by employee, notifications.
- Daily process: price list, bulk price update, barcode/sticker print, expenses, expense heads.
- Purchase: orders (approve, convert), invoices (serials, color, size, opening stock), returns.
- Sales: estimates (convert), invoices (POS, hold carts, exchange, redeem points, walk-in, split payment), returns.
- Service: service items, estimates, invoices.
- Customer enquiry: entry, follow-up with history, source/type/course-of-action setup.
- Warranty: claim, checking, manage product, delivered, warranty stock, self stock manage, claim to supplier, service centers.
- Inventory: warehouses, delivery, receive, branch/warehouse/combined stock, transfers, disposal.
- Client setup: customers, suppliers, groups.
- Product setup: products, parents, categories, sub-categories.
- Offers & rebate: coupons/offers, assign to item/brand/category, rebate claims.
- Master setup: brand, manufacturer, unit, currency, country, transporter, color, size, district, zone.
- Accounts setup: class, group, sub-group, ledger.
- Accounts transaction: payment, receipt, journal, transfer, cheque management, donation.
- Loan: loan accounts with statements.
- Finance: chart of accounts, income statement, trial balance, balance sheet, finance analysis.
- Payroll: departments, designations, employees, leave types, leave records, attendance, salary sheet and payslip.
- Bank & mobile: banks, bank accounts, mobile accounts.
- Personal: profile, change password, notes, todo, events.
- Reports center (~90 reports), report roles.
- User & role: roles with module permission matrix, users.
- Company & setting: company, branches, local settings, SMS templates and gateway, data management.
- Global: search by invoice/product/serial (Ctrl+K), activity history on every screen, quick actions, internal chat.

## Status (2026-10-30)

All modules above are implemented. Verified with an end-to-end script (purchase → sale with split payment, cheque and serials → return → receipt/payment/expense/transfer → branch transfer, disposal, delivery). The trial balance and balance sheet balance, and all 93 reports run without errors. `next build` passes.

Open items: Bangla UI translation, auto-generated barcodes, importing data from the old system.

Interface: redesigned on 2026-10-30 to the "framed sheet" style (white work sheet inside a quiet frame, IBM Plex type, colour only for figures, status and the main action). README section 6.9 describes the patterns.
