// Full database schema. Applied idempotently on startup.
export const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

-- ───────────── Company, settings, users ─────────────
CREATE TABLE IF NOT EXISTS company (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT, bname TEXT, slogan TEXT, bslogan TEXT, mobile TEXT, phone TEXT, fax TEXT, web TEXT, email TEXT,
  tin TEXT, vat TEXT, address TEXT, baddress TEXT, saddress TEXT, logo TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, status TEXT DEFAULT 'active', description TEXT,
  perms TEXT DEFAULT '{}', report_perms TEXT DEFAULT '[]', is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password TEXT NOT NULL,
  role_id INTEGER REFERENCES roles(id), branch_id INTEGER REFERENCES branches(id), employee_id INTEGER,
  mobile TEXT, image TEXT, status TEXT DEFAULT 'active', last_active TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY, at TEXT DEFAULT (datetime('now','localtime')), user_id INTEGER, entity TEXT, entity_id INTEGER,
  action TEXT, summary TEXT
);
CREATE INDEX IF NOT EXISTS ix_activity_entity ON activity(entity, at);
CREATE TABLE IF NOT EXISTS sms_log (
  id INTEGER PRIMARY KEY, at TEXT DEFAULT (datetime('now','localtime')), mobile TEXT, body TEXT, status TEXT, response TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY, from_user INTEGER, to_user INTEGER, body TEXT, read INTEGER DEFAULT 0,
  at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL);

-- ───────────── Master setup ─────────────
CREATE TABLE IF NOT EXISTS brands (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, image TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS manufacturers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, cperson TEXT, cmobile TEXT, email TEXT, address TEXT, mainpro TEXT, description TEXT, web TEXT, rank INTEGER, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS units (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS currencies (id INTEGER PRIMARY KEY, name TEXT NOT NULL, subunit TEXT, sort TEXT, symbol TEXT, exrate REAL DEFAULT 1, is_default INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS countries (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS transporters (id INTEGER PRIMARY KEY, sort TEXT, name TEXT NOT NULL, contact TEXT, address TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS colors (id INTEGER PRIMARY KEY, name TEXT NOT NULL, hex TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS sizes (id INTEGER PRIMARY KEY, name TEXT NOT NULL, size TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS districts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country_id INTEGER REFERENCES countries(id), created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS zones (id INTEGER PRIMARY KEY, name TEXT NOT NULL, district_id INTEGER REFERENCES districts(id), created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY, name TEXT NOT NULL);

-- ───────────── Clients ─────────────
CREATE TABLE IF NOT EXISTS client_groups (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL, status TEXT DEFAULT 'active', cperson TEXT, mname TEXT, nid TEXT,
  mobile TEXT, phone TEXT, email TEXT, address TEXT, shipping_address TEXT, district_id INTEGER, group_id INTEGER, zone_id INTEGER,
  bin TEXT, credit_limit REAL DEFAULT 0, get_reward INTEGER DEFAULT 0, allow_days INTEGER DEFAULT 0, rank INTEGER, points REAL DEFAULT 0,
  opening_balance REAL DEFAULT 0, ledger_id INTEGER, is_walkin INTEGER DEFAULT 0, last_active TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL, status TEXT DEFAULT 'active', cperson TEXT, mobile TEXT, phone TEXT, email TEXT,
  credit_limit REAL DEFAULT 0, allow_days INTEGER DEFAULT 0, rank INTEGER, group_id INTEGER, address TEXT, factory_address TEXT,
  opening_balance REAL DEFAULT 0, ledger_id INTEGER, is_opening INTEGER DEFAULT 0, last_active TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- ───────────── Products & services ─────────────
CREATE TABLE IF NOT EXISTS product_parents (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, parent_id INTEGER, description TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS subcategories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category_id INTEGER, description TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL, parent_id INTEGER, category_id INTEGER, subcategory_id INTEGER,
  brand_id INTEGER, manufacturer_id INTEGER, unit_id INTEGER, mode TEXT DEFAULT 'nonserial', country_id INTEGER, status TEXT DEFAULT 'active',
  certificate TEXT, min_stock REAL DEFAULT 0, model TEXT, brand_no TEXT, vat REAL DEFAULT 0, ait REAL DEFAULT 0, avt REAL DEFAULT 0,
  cost REAL DEFAULT 0, price REAL DEFAULT 0, old_price REAL DEFAULT 0, currency_id INTEGER, price_updated_at TEXT,
  warranty_days INTEGER DEFAULT 0, barcode TEXT, tags TEXT, image TEXT, description TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_products_barcode ON products(barcode);
CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY, product_id INTEGER, old_price REAL, new_price REAL, currency_id INTEGER, user_id INTEGER,
  at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL, category_id INTEGER, subcategory_id INTEGER, cost REAL DEFAULT 0, price REAL DEFAULT 0,
  description TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS serials (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, serial TEXT NOT NULL, color_id INTEGER, size_id INTEGER,
  status TEXT DEFAULT 'instock', loc_type TEXT DEFAULT 'B', loc_id INTEGER DEFAULT 1, cost REAL DEFAULT 0, expiry TEXT,
  purchase_doc_id INTEGER, sale_doc_id INTEGER, supplier_id INTEGER, customer_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_serials_serial ON serials(serial);
CREATE TABLE IF NOT EXISTS serial_history (
  id INTEGER PRIMARY KEY, serial_id INTEGER, at TEXT DEFAULT (datetime('now','localtime')), action TEXT, ref_type TEXT, ref_id INTEGER, ref_no TEXT, note TEXT
);

-- ───────────── Inventory ─────────────
CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY, name TEXT NOT NULL, bname TEXT, phone TEXT, email TEXT, address TEXT, baddress TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY, date TEXT NOT NULL, product_id INTEGER NOT NULL, color_id INTEGER, size_id INTEGER,
  loc_type TEXT NOT NULL DEFAULT 'B', loc_id INTEGER NOT NULL DEFAULT 1, qty REAL NOT NULL, cost REAL DEFAULT 0, price REAL DEFAULT 0,
  kind TEXT NOT NULL, ref_type TEXT, ref_id INTEGER, ref_no TEXT, serial TEXT, created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_moves_product ON stock_moves(product_id, loc_type, loc_id);
CREATE INDEX IF NOT EXISTS ix_moves_ref ON stock_moves(ref_type, ref_id);
CREATE TABLE IF NOT EXISTS stock_docs (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, no TEXT, date TEXT, from_type TEXT, from_id INTEGER, to_type TEXT, to_id INTEGER,
  doc_id INTEGER, supplier_id INTEGER, amount REAL DEFAULT 0, recover REAL DEFAULT 0, note TEXT, journal_id INTEGER,
  created_by INTEGER, created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS stock_doc_lines (
  id INTEGER PRIMARY KEY, stock_doc_id INTEGER NOT NULL REFERENCES stock_docs(id) ON DELETE CASCADE, product_id INTEGER, color_id INTEGER,
  size_id INTEGER, qty REAL, cost REAL DEFAULT 0, price REAL DEFAULT 0, serial TEXT, doc_line_id INTEGER, claim_id INTEGER, note TEXT
);

-- ───────────── Sales / purchase / service documents ─────────────
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, no TEXT, seq INTEGER, date TEXT NOT NULL,
  customer_id INTEGER, supplier_id INTEGER, walkin_name TEXT, walkin_mobile TEXT, walkin_email TEXT, walkin_address TEXT,
  walkin_district_id INTEGER, walkin_zone_id INTEGER, branch_id INTEGER DEFAULT 1, sales_person_id INTEGER,
  gross REAL DEFAULT 0, item_discount REAL DEFAULT 0, discount_pct REAL DEFAULT 0, discount REAL DEFAULT 0,
  vat_pct REAL DEFAULT 0, vat REAL DEFAULT 0, ait_pct REAL DEFAULT 0, ait REAL DEFAULT 0, other_name TEXT, other REAL DEFAULT 0,
  freight REAL DEFAULT 0, redeem_points REAL DEFAULT 0, redeem REAL DEFAULT 0, less REAL DEFAULT 0, exchange REAL DEFAULT 0,
  total REAL DEFAULT 0, paid REAL DEFAULT 0, adjust REAL DEFAULT 0, cost_total REAL DEFAULT 0, points_earned REAL DEFAULT 0,
  note TEXT, ref_doc_id INTEGER, status TEXT DEFAULT 'final', approved INTEGER DEFAULT 0, delivery_date TEXT, coupon TEXT,
  journal_id INTEGER, created_by INTEGER, created_at TEXT DEFAULT (datetime('now','localtime')), updated_by INTEGER, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_docs_kind ON docs(kind, date);
CREATE INDEX IF NOT EXISTS ix_docs_no ON docs(no);
CREATE TABLE IF NOT EXISTS doc_lines (
  id INTEGER PRIMARY KEY, doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE, product_id INTEGER, service_id INTEGER,
  color_id INTEGER, size_id INTEGER, name TEXT, qty REAL NOT NULL DEFAULT 1, cost REAL DEFAULT 0, price REAL DEFAULT 0,
  disc_pct REAL DEFAULT 0, disc REAL DEFAULT 0, vat_pct REAL DEFAULT 0, warranty_days INTEGER DEFAULT 0, note TEXT,
  serials TEXT DEFAULT '[]', subtotal REAL DEFAULT 0, ref_line_id INTEGER, moved_qty REAL DEFAULT 0, sale_price REAL DEFAULT 0,
  expected_qty REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS doc_exchange (
  id INTEGER PRIMARY KEY, doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE, product_id INTEGER, name TEXT,
  serial TEXT, qty REAL DEFAULT 1, cost REAL DEFAULT 0, price REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS doc_payments (
  id INTEGER PRIMARY KEY, doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE, ledger_id INTEGER NOT NULL,
  amount REAL NOT NULL, cheque_no TEXT, cheque_date TEXT, ref TEXT
);
CREATE TABLE IF NOT EXISTS held_carts (
  id INTEGER PRIMARY KEY, user_id INTEGER, kind TEXT, name TEXT, data TEXT, created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- ───────────── Accounting ─────────────
CREATE TABLE IF NOT EXISTS acc_classes (id INTEGER PRIMARY KEY, name TEXT NOT NULL, nature TEXT NOT NULL, description TEXT);
CREATE TABLE IF NOT EXISTS acc_groups (id INTEGER PRIMARY KEY, name TEXT NOT NULL, class_id INTEGER NOT NULL, description TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS acc_subgroups (id INTEGER PRIMARY KEY, name TEXT NOT NULL, group_id INTEGER NOT NULL, description TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS ledgers (
  id INTEGER PRIMARY KEY, code TEXT, name TEXT NOT NULL, subgroup_id INTEGER NOT NULL, description TEXT, kind TEXT DEFAULT 'general',
  ref_id INTEGER, system_key TEXT UNIQUE, bname TEXT, opening REAL DEFAULT 0, status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_ledgers_kind ON ledgers(kind, ref_id);
CREATE TABLE IF NOT EXISTS journals (
  id INTEGER PRIMARY KEY, no TEXT, date TEXT NOT NULL, type TEXT NOT NULL, ref_type TEXT, ref_id INTEGER, narration TEXT,
  branch_id INTEGER DEFAULT 1, total REAL DEFAULT 0, created_by INTEGER, created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_journals_ref ON journals(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS ix_journals_type ON journals(type, date);
CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY, journal_id INTEGER NOT NULL REFERENCES journals(id) ON DELETE CASCADE, ledger_id INTEGER NOT NULL,
  debit REAL DEFAULT 0, credit REAL DEFAULT 0, memo TEXT, ref TEXT, cheque_no TEXT, cheque_date TEXT, ref_doc_id INTEGER,
  xrate REAL, pair_ledger_id INTEGER
);
CREATE INDEX IF NOT EXISTS ix_jl_ledger ON journal_lines(ledger_id);
CREATE INDEX IF NOT EXISTS ix_jl_journal ON journal_lines(journal_id);
CREATE TABLE IF NOT EXISTS cheques (
  id INTEGER PRIMARY KEY, journal_id INTEGER, direction TEXT NOT NULL, cheque_no TEXT, cheque_date TEXT, amount REAL,
  bank_name TEXT, account_ledger_id INTEGER, party_ledger_id INTEGER, status TEXT DEFAULT 'pending', mode TEXT,
  cleared_at TEXT, note TEXT, date TEXT, ref_no TEXT, created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- ───────────── Bank, mobile, loan ─────────────
CREATE TABLE IF NOT EXISTS banks (id INTEGER PRIMARY KEY, name TEXT NOT NULL, sort TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY, bank_id INTEGER, acno TEXT NOT NULL, title TEXT, branch TEXT, code TEXT, routno TEXT, location TEXT,
  opening_balance REAL DEFAULT 0, ledger_id INTEGER, created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS mobile_accounts (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, number TEXT, opening_balance REAL DEFAULT 0, ledger_id INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS loan_accounts (
  id INTEGER PRIMARY KEY, code TEXT, name TEXT NOT NULL, number TEXT, type TEXT DEFAULT 'taken', opening_balance REAL DEFAULT 0,
  ledger_id INTEGER, created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- ───────────── Offers & rebate ─────────────
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT, percent REAL DEFAULT 0, fixed REAL DEFAULT 0, start_date TEXT, end_date TEXT,
  effect_on TEXT DEFAULT 'self', status TEXT DEFAULT 'active', description TEXT, created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS offer_items (
  id INTEGER PRIMARY KEY, offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE, target_type TEXT NOT NULL, target_id INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rebates (
  id INTEGER PRIMARY KEY, no TEXT, date TEXT, supplier_id INTEGER, from_date TEXT, to_date TEXT, amount REAL DEFAULT 0, lines TEXT,
  journal_id INTEGER, note TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- ───────────── Enquiry ─────────────
CREATE TABLE IF NOT EXISTS enquiry_sources (id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS enquiry_types (id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS enquiry_actions (id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY, no TEXT, date TEXT, customer_name TEXT, mobile TEXT, product_id INTEGER, product_name TEXT, location TEXT,
  type_id INTEGER, status TEXT DEFAULT 'active', action_id INTEGER, ppdate TEXT, source_id INTEGER, next_followup TEXT, remarks TEXT,
  kind TEXT DEFAULT 'sales', created_by INTEGER, created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS enquiry_followups (
  id INTEGER PRIMARY KEY, enquiry_id INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE, date TEXT, details TEXT, status TEXT,
  action_id INTEGER, next_followup TEXT, user_id INTEGER, created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- ───────────── Warranty ─────────────
CREATE TABLE IF NOT EXISTS service_centers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, contact TEXT, address TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS warranty_claims (
  id INTEGER PRIMARY KEY, no TEXT, date TEXT, product_id INTEGER, serial TEXT, sale_doc_id INTEGER, customer_id INTEGER,
  customer_name TEXT, mobile TEXT, sale_date TEXT, warranty_expiry TEXT, claim_note TEXT, check_note TEXT, check_status TEXT,
  checked_at TEXT, manage_action TEXT, delivery_note TEXT, service_center_id INTEGER, replaced_serial TEXT, replaced_product_id INTEGER,
  status TEXT DEFAULT 'received', delivered_at TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now','localtime'))
);

-- ───────────── Payroll ─────────────
CREATE TABLE IF NOT EXISTS departments (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS designations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY, code TEXT, department_id INTEGER, designation_id INTEGER, name TEXT NOT NULL, fname TEXT, mname TEXT,
  mobile TEXT, email TEXT, phone TEXT, nid TEXT, dob TEXT, joining TEXT, salary REAL DEFAULT 0, commission_pct REAL DEFAULT 0,
  vat_signatory INTEGER DEFAULT 0, status TEXT DEFAULT 'active', branch_id INTEGER, image TEXT, address TEXT, paddress TEXT,
  ledger_id INTEGER, created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS leave_types (id INTEGER PRIMARY KEY, name TEXT NOT NULL, days INTEGER DEFAULT 0, status TEXT DEFAULT 'active', description TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS leave_apps (
  id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL, leave_type_id INTEGER, apply_date TEXT, from_date TEXT, to_date TEXT, days REAL,
  status TEXT DEFAULT 'pending', reason TEXT, note TEXT, created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY, year INTEGER, month INTEGER, employee_id INTEGER, branch_id INTEGER, salary REAL DEFAULT 0, absent REAL DEFAULT 0,
  late REAL DEFAULT 0, leave REAL DEFAULT 0, present_days REAL DEFAULT 0, bonus_pct REAL DEFAULT 0, salary_date TEXT,
  posted INTEGER DEFAULT 0, journal_id INTEGER, UNIQUE(year, month, employee_id)
);

-- ───────────── Personal ─────────────
CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT, body TEXT, favorite INTEGER DEFAULT 0, label TEXT, color TEXT, created_at TEXT DEFAULT (datetime('now','localtime')), updated_at TEXT);
CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT NOT NULL, done INTEGER DEFAULT 0, due TEXT, priority TEXT DEFAULT 'normal', created_at TEXT DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT NOT NULL, date TEXT NOT NULL, start_time TEXT, end_time TEXT, details TEXT, color TEXT, created_at TEXT DEFAULT (datetime('now','localtime')));
`;
