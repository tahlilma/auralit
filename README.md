# Auralit ERP

A rebuild of the Arctic ERP used by Barista Garage: sales and POS, purchase, service, warranty, inventory across branches and warehouses, double-entry accounting, payroll and about 90 reports, with a cleaner and faster interface.

## Run it

Requirements: Node.js 22.13 or newer (Node 24 recommended). No database server is needed.

```bash
npm install
npm run dev          # development, http://localhost:3000
# or
npm run build && npm start
```

On the first request the app creates `data/auralit.db` (SQLite) and seeds it with:

- the default chart of accounts and the system ledgers used by automatic postings
- the 64 districts and 492 upazilas of Bangladesh, currencies, units, colors, enquiry sources and types
- a walk-in customer and an "Opening Stock" supplier (use that supplier to enter opening stock)
- an administrator: **admin@example.com / admin123**. Change this password under Profile right away.

Backups: Company & Settings → Data Management → Download backup. The backup is a single `.db` file. To restore it, stop the app and replace `data/auralit.db` with it.

## How it is built

- Next.js 16 (App Router, Cache Components), React 19, Tailwind CSS v4, `lucide-react` icons.
- SQLite through Node's built-in `node:sqlite`, so there are no native modules to compile.
- One RPC endpoint, `POST /api/rpc`, calls typed server functions in `lib/server/api/*`. Each of these functions checks the session and the role permission (module × read/write/edit/delete/print).
- Every business document posts a balanced double-entry journal. The trial balance, income statement, balance sheet and all ledger, cash, bank, customer and supplier statements are computed from `journal_lines`.
- Stock is a movement log per product, color, size and location (branch or warehouse). Serial and IMEI numbers keep their own history.

| Area | Where |
| --- | --- |
| Schema, seed data | `lib/server/schema.ts`, `lib/server/seed.ts` |
| Posting engine (ledgers, stock, numbering) | `lib/server/core.ts` |
| Master data screens (about 40) | `lib/entities.ts` + `components/entity-page.tsx` |
| Sales, purchase and service documents and returns | `lib/server/api/docs.ts`, `components/doc/*` |
| Payment, receipt, journal, transfer, expense and donation vouchers, cheques | `lib/server/api/vouchers.ts`, `components/vouchers.tsx` |
| Transfers, delivery, receive, disposal, bad stock | `lib/server/api/stock.ts`, `components/stock.tsx` |
| Warranty, offers and rebates, enquiry | `lib/server/api/ops.ts` |
| Finance statements | `lib/server/api/finance.ts`, `components/finance.tsx` |
| Reports (93) | `lib/reports-meta.ts`, `lib/server/api/reports.ts` |
| Navigation and permissions | `lib/nav.ts`, `lib/permissions.ts` |

## Feature map (original menu → this app)

Every menu of the original is present. Some things that work differently:

- **POS** (Sales → New Sale): scan a barcode or serial, or search; browse by category, sub-category or brand. Each line has discount %, a fixed discount, VAT %, warranty, color, size and a note. At the bottom: discount (% or ৳), VAT, AIT, a named other charge, freight, redeem points, less/cash back, exchange (trade-in) items, split payment across cash, bank and mobile accounts with cheque details, a cash-tendered change calculator, hold/resume carts, and a draft that is kept if you leave the page. Shortcuts: F2 new sale (anywhere), F3 search, F8 hold, F9 save & print, F10 save.
- **Printing**: A4 invoice, 80 mm POS receipt and delivery challan from the invoice page. Vouchers, challans, claim slips, payslips and every report also print.
- **Estimates and purchase orders** convert into invoices with one click. Purchase orders have an approval toggle.
- **Returns** find the invoice by number or by scanning a serial number. Refunds and the adjustment against the customer's due are booked automatically.
- **Receipts and payments** can be tied to an invoice number. The invoice's due then updates.
- **Global search** (Ctrl + K) finds invoices, vouchers, products, serials, customers and suppliers. Pages can be pinned to the top of the sidebar.
- **History** is on every list. The Activity Log shows all changes system-wide.
- **Import and export**: every master list imports CSV and exports CSV. Reports export CSV.
- **Dark mode**, a mobile layout and an internal team chat.

## Known gaps (not done yet)

- No business data was copied from the live site. Customers, suppliers and products can be loaded with CSV import (download the template from each list).
- The Bangla language setting is stored, but the interface is not translated yet.
- The "barcode type/length" settings are stored. Products without a barcode print their product code as the barcode.
- SMS sends through the configured gateway. Delivery depends on your provider's URL and parameter names (set them in SMS settings and use "Send test").
- Team chat refreshes every few seconds. It does not use push.
