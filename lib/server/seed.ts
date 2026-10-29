import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { DISTRICTS, EXPENSE_HEADS, UPAZILAS } from './seed-data';
import { ALL_MODULES } from '../permissions';

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// Account structure: class → group → subgroups
const GROUPS: [string, number, string[]][] = [
  ['Non Current Assets', 1, ['Fixed Assets', 'Tangible Asset', 'Intangible Assets', 'Investments', 'Other Non Current Assets']],
  ['Current Assets', 1, ['Cash At Hand', 'Cash At Bank', 'Cash At Mobile Account', 'Account Receivables', 'Inventory',
    'Advances, Deposits & Prepayment', 'Other Current Assets', 'Customer Previous Balance', 'Waiting For Receive', 'Warranty', 'Warranty Bad Stock', 'Loans Given']],
  ["Owner's Equity", 3, ['Share Capital', 'Reserves & Surplus', 'Drawings']],
  ['Non Current Liabilities', 2, ['Long Term Borrowings', 'Institutional Borrowings', 'Other Loan & Mortgage', 'Other Non Current Liabilities']],
  ['Current Liabilities', 2, ['Account Payable', 'Bank & Over Draft', 'Liability For Expenses', 'Liability For Other Finance', 'Liabilities For Warranty',
    'Salaries,Wages & Allowance Payable', 'Other Current Liabilities', 'Commission Agent', 'Delivered Later', 'Duties & Taxes']],
  ['Operating Revenue', 5, ['Goods Sales', 'Service Income', 'Other Operating Sales', 'Goods Return']],
  ['Non Operating Revenue', 5, ['Interest Income', 'Incentive Income', 'Other Income', 'Damage Recover']],
  ['Direct Expense', 4, ['Cost Of Goods Sold', 'Cost Of Goods Return', 'Product Adjust', 'Selling Expenses', 'Purchase Expenses']],
  ['Indirect Expenses', 4, ['Administrative Expenses', 'Operating Expenses']],
];

// System ledgers used by automatic postings: key → [name, subgroup]
export const SYSTEM_LEDGERS: Record<string, [string, string]> = {
  CASH: ['Cash', 'Cash At Hand'],
  PETTY_CASH: ['Petty Cash', 'Cash At Hand'],
  INVENTORY: ['Inventory', 'Inventory'],
  SALES: ['Goods Sales', 'Goods Sales'],
  SALES_RETURN: ['Sales Return', 'Goods Return'],
  SERVICE_INCOME: ['Service Income', 'Service Income'],
  COGS: ['Cost Of Goods Sold', 'Cost Of Goods Sold'],
  VAT_OUT: ['VAT Payable', 'Duties & Taxes'],
  AIT_OUT: ['AIT Payable', 'Duties & Taxes'],
  VAT_IN: ['VAT On Purchase', 'Purchase Expenses'],
  TAX_IN: ['Tax On Purchase', 'Purchase Expenses'],
  OTHER_PURCHASE: ['Other Direct Expenses', 'Purchase Expenses'],
  FREIGHT_PURCHASE: ['Freight On Purchase', 'Purchase Expenses'],
  DISC_ITEM: ['Discount On Item', 'Selling Expenses'],
  DISC_SALES: ['Discount On Sales', 'Selling Expenses'],
  LESS_SALES: ['Less Given On Sales', 'Selling Expenses'],
  REWARD: ['Reward Points Redeemed', 'Selling Expenses'],
  LESS_RECEIVE: ['Less Taken On Received', 'Selling Expenses'],
  OTHER_SALES: ['Other Charges On Sales', 'Other Operating Sales'],
  FREIGHT_SALES: ['Freight Charged On Sales', 'Other Operating Sales'],
  DISC_PURCHASE: ['Discount On Purchase', 'Other Income'],
  LESS_PURCHASE: ['Less Received On Purchase', 'Other Income'],
  LESS_PAYMENT: ['Less Taken On Payment', 'Other Income'],
  REBATE: ['Rebate Income', 'Incentive Income'],
  PRODUCT_ADJUST: ['Product Adjustment', 'Product Adjust'],
  DAMAGE_RECOVER: ['Damage Recover', 'Damage Recover'],
  WARRANTY_BAD: ['Warranty Bad Stock', 'Warranty Bad Stock'],
  CAPITAL: ['Capital', 'Share Capital'],
  OPENING: ['Opening Balance Equity', 'Reserves & Surplus'],
  SALARY: ['Salaries,Wages And Allowance', 'Administrative Expenses'],
  BONUS: ['Festival Bonus Expense', 'Administrative Expenses'],
  SALARY_PAYABLE: ['Salaries Payable', 'Salaries,Wages & Allowance Payable'],
  DONATION: ['Tips & Donations', 'Administrative Expenses'],
  BANK_CHARGE: ['Bank & Other Charges', 'Administrative Expenses'],
  SERVICE_EXPENSE: ['Service Expenses', 'Operating Expenses'],
};

const OPERATING_HEADS = new Set(['Sales Commission', 'Home Delivery', 'Labour & Transportation', 'Business Promotion Expenses', 'Service Expenses', 'Cash Back On Item']);

export function seed(db: DatabaseSync) {
  const ins = (sql: string, ...p: any[]) => Number(db.prepare(sql).run(...p).lastInsertRowid);
  const one = (sql: string, ...p: any[]) => db.prepare(sql).get(...p) as any;

  ins(`INSERT INTO company (id, name, bname, slogan, mobile, email, address, saddress) VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
    'Barista Garage', 'বারিস্তা গ্যারেজ', 'Everything for your coffee bar', '', '', 'Dhaka, Bangladesh', 'Dhaka, Bangladesh');

  const settings: Record<string, string> = {
    language: 'en', timezone: 'Asia/Dhaka', date_format: 'dd MMM yyyy', show_serial_on_invoice: 'yes',
    barcode_type: 'both', barcode_length: '10', print_due_on_invoice: 'yes', code_prefix: 'ABA', company_short: 'BGI',
    number_format: 'PFX-CO-DDMMYY-NNN', invoice_note: 'Thank you for your business.', invoice_terms: 'Goods once sold are not refundable.',
    pos_receipt_note: 'Thank you! Please visit again.', challan_note: '', auto_sms: '[]', edit_lock_hours: '0', allow_negative_stock: 'no',
    reward_enabled: 'no', reward_spend: '1000', reward_point_value: '1', sms_status: '0', pos_name: 'Barista Garage POS',
    sms_gateway_url: '', sms_api_key: '', sms_sender: '', sms_user: '', sms_password: '', sms_type: 'url',
    sms_api_var: 'apikey', sms_user_var: 'username', sms_pass_var: 'password', sms_sender_var: 'senderid', sms_to_var: 'to',
    sms_msg_var: 'message', sms_from_var: 'from', sms_other_var: '', sms_other_val: '',
    sms_tpl_invoice: 'Dear customer, thanks for shopping at [COMPANY_NAME]. Invoice [INVOICE_NO] total [INVOICE_TOTAL], paid [CASH_AMOUNT], due [INVOICE_DUE]. Total due [TOT_DUE].',
    sms_tpl_invoice_status: 'inactive',
    sms_tpl_receive: 'Received [RECEIVE_TOTAL] Tk. Receipt [RECEIVE_NO]. Your total due is [TOT_DUE]. [COMPANY_NAME]',
    sms_tpl_receive_status: 'inactive',
    sms_tpl_payment: 'Paid [PAYMENT_TOTAL] Tk. Voucher [PAYMENT_NO]. Balance due [BALANCE_DUE]. [COMPANY_NAME]',
    sms_tpl_payment_status: 'inactive',
    sms_tpl_greeting: 'Dear [CUSTOMER_NAME], warm greetings from [COMPANY_NAME]!',
    sms_tpl_greeting_status: 'inactive',
  };
  for (const [k, v] of Object.entries(settings)) ins(`INSERT INTO settings (key, value) VALUES (?, ?)`, k, v);

  ins(`INSERT INTO branches (id, name, address) VALUES (1, 'Main Branch', 'Dhaka')`);

  const allPerms: Record<string, Record<string, boolean>> = {};
  for (const m of ALL_MODULES) allPerms[m.key] = { read: true, write: true, edit: true, delete: true, print: true };
  const adminRole = ins(`INSERT INTO roles (name, description, perms, report_perms, is_admin) VALUES ('Administrator', 'Full access', ?, '["*"]', 1)`, JSON.stringify(allPerms));
  const salesPerms: Record<string, Record<string, boolean>> = {};
  for (const k of ['sales', 'service', 'client', 'personal', 'enquiry']) salesPerms[k] = { read: true, write: true, edit: false, delete: false, print: true };
  salesPerms.product = { read: true, write: false, edit: false, delete: false, print: true };
  ins(`INSERT INTO roles (name, description, perms, report_perms) VALUES ('Sales', 'Counter sales staff', ?, '[]')`, JSON.stringify(salesPerms));
  ins(`INSERT INTO users (name, email, password, role_id, branch_id) VALUES ('Administrator', 'admin@example.com', ?, ?, 1)`, hashPassword('admin123'), adminRole);

  // Masters
  const bd = ins(`INSERT INTO countries (name) VALUES ('Bangladesh')`);
  for (const c of ['China', 'Singapore', 'United States', 'Taiwan', 'Hong Kong', 'Italy', 'India']) ins(`INSERT INTO countries (name) VALUES (?)`, c);
  for (const d of DISTRICTS) ins(`INSERT INTO districts (name, country_id) VALUES (?, ?)`, d, bd);
  for (const u of UPAZILAS) ins(`INSERT INTO locations (name) VALUES (?)`, u);
  const cur: [string, string, string, string, number, number][] = [
    ['Taka', 'Poisha', 'BDT', '৳', 1, 1], ['US Dollar', 'Cent', 'USD', '$', 122, 0], ['Euro', 'Cent', 'EUR', '€', 140, 0],
    ['Pound', 'Penny', 'GBP', '£', 160, 0], ['Japan Yen', 'Sen', 'JPY', '¥', 0.8, 0], ['yuán', 'Jiao', 'CNY', '¥', 17, 0],
    ['Canadian Dollar', 'Cent', 'CAD', 'C$', 88, 0], ['Ringgit', 'Sen', 'MYR', 'RM', 27, 0],
  ];
  for (const c of cur) ins(`INSERT INTO currencies (name, subunit, sort, symbol, exrate, is_default) VALUES (?, ?, ?, ?, ?, ?)`, ...c);
  for (const u of ['Pcs', 'Kg', 'Grams', 'Litre', 'Box', 'Day']) ins(`INSERT INTO units (name) VALUES (?)`, u);
  const colors: [string, string][] = [['Black', '#111111'], ['White', '#ffffff'], ['Silver', '#c0c0c0'], ['Red', '#dc2626'], ['Blue', '#2563eb'], ['Gold', '#d4af37']];
  for (const c of colors) ins(`INSERT INTO colors (name, hex) VALUES (?, ?)`, ...c);
  for (const s of ['Small', 'Medium', 'Large']) ins(`INSERT INTO sizes (name, size) VALUES (?, ?)`, s, s[0]);
  for (const s of ['Face Book', 'Google', 'Phone Call', 'Reference', 'Walking Customer']) ins(`INSERT INTO enquiry_sources (name) VALUES (?)`, s);
  for (const s of ['Bank Loan', 'Cash EMI', 'Cash Purchase', 'Credit Card EMI']) ins(`INSERT INTO enquiry_types (name) VALUES (?)`, s);
  for (const s of ['Brand Switched', 'Inside Purchase', 'Outside Purchase', 'Pre Booked', 'Under Follow-up']) ins(`INSERT INTO enquiry_actions (name) VALUES (?)`, s);
  for (const s of ['Administrative Department', 'Sales & Marketing Department', 'Logistics Department', 'Training Department']) ins(`INSERT INTO departments (name) VALUES (?)`, s);
  for (const s of ['Manager', 'Sales & Marketing Executive', 'Barista Trainer', 'Office Executive', 'Delivery Man']) ins(`INSERT INTO designations (name) VALUES (?)`, s);
  ins(`INSERT INTO leave_types (name, days) VALUES ('Sick', 14)`);
  ins(`INSERT INTO leave_types (name, days) VALUES ('Casual', 10)`);
  ins(`INSERT INTO client_groups (name, description) VALUES ('General', 'Default group')`);

  // Accounts
  const classes: [string, string][] = [['Assets', 'debit'], ['Liabilities', 'credit'], ["Owner's Equity", 'credit'], ['Expenses', 'debit'], ['Revenue', 'credit']];
  classes.forEach(([n, nature], i) => ins(`INSERT INTO acc_classes (id, name, nature) VALUES (?, ?, ?)`, i + 1, n, nature));
  const subgroupId: Record<string, number> = {};
  for (const [g, cls, subs] of GROUPS) {
    const gid = ins(`INSERT INTO acc_groups (name, class_id) VALUES (?, ?)`, g, cls);
    for (const s of subs) subgroupId[s] = ins(`INSERT INTO acc_subgroups (name, group_id) VALUES (?, ?)`, s, gid);
  }
  const ledger = (name: string, sub: string, kind = 'general', key: string | null = null, refId: number | null = null, code?: string) => {
    const sid = subgroupId[sub];
    const n = (one(`SELECT COUNT(*) c FROM ledgers WHERE subgroup_id = ?`, sid).c as number) + 1;
    const c = code ?? `${sid}-${String(n).padStart(4, '0')}`;
    return ins(`INSERT INTO ledgers (code, name, subgroup_id, kind, system_key, ref_id) VALUES (?, ?, ?, ?, ?, ?)`, c, name, sid, kind, key, refId);
  };
  for (const [key, [name, sub]] of Object.entries(SYSTEM_LEDGERS)) {
    const kind = key === 'CASH' || key === 'PETTY_CASH' ? 'cash' : 'general';
    ledger(name, sub, kind, key);
  }
  for (const h of EXPENSE_HEADS) {
    if (one(`SELECT id FROM ledgers WHERE name = ?`, h)) continue;
    ledger(h, OPERATING_HEADS.has(h) ? 'Operating Expenses' : 'Administrative Expenses', 'expense');
  }

  const walkin = ins(`INSERT INTO customers (code, name, is_walkin, status) VALUES ('ABA/CU/000', 'Walk-in Customer', 1, 'active')`);
  const wl = ledger('Walk-in Customer', 'Account Receivables', 'customer', 'WALKIN', walkin, 'ABA/CU/000');
  db.prepare(`UPDATE customers SET ledger_id = ? WHERE id = ?`).run(wl, walkin);
  const open = ins(`INSERT INTO suppliers (code, name, is_opening, status) VALUES ('ABA/SU/000', 'Opening Stock', 1, 'active')`);
  db.prepare(`UPDATE suppliers SET ledger_id = (SELECT id FROM ledgers WHERE system_key = 'OPENING') WHERE id = ?`).run(open);
  db.prepare(`INSERT INTO counters (key, value) VALUES ('customer', 0), ('supplier', 0), ('product', 0), ('employee', 0)`).run();
}
