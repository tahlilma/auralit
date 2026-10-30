// Report catalog shared by the Report Center (client) and the report runner (server).
import type { Field } from './entities';

export const STD_FILTERS: Record<string, Field[]> = {
  range: [{ name: 'from', label: 'From', type: 'date' }, { name: 'to', label: 'To', type: 'date' }],
  asof: [{ name: 'to', label: 'As of', type: 'date' }],
  branch: [{ name: 'branch_id', label: 'Branch', type: 'ref', ref: 'branch' }],
  category: [{ name: 'category_id', label: 'Category', type: 'ref', ref: 'category' }],
  subcategory: [{ name: 'subcategory_id', label: 'Sub-category', type: 'ref', ref: 'subcategory', dependsOn: 'category_id' }],
  brand: [{ name: 'brand_id', label: 'Brand', type: 'ref', ref: 'brand' }],
  product: [{ name: 'product_id', label: 'Item', type: 'ref', ref: 'product' }],
  service: [{ name: 'service_id', label: 'Service', type: 'ref', ref: 'service' }],
  supplier: [{ name: 'supplier_id', label: 'Supplier', type: 'ref', ref: 'supplier_real' }],
  customer: [{ name: 'customer_id', label: 'Customer', type: 'ref', ref: 'customer' }],
  user: [{ name: 'user_id', label: 'User', type: 'ref', ref: 'user' }],
  sales_person: [{ name: 'sales_person_id', label: 'Sales person', type: 'ref', ref: 'sales_person' }],
  group: [{ name: 'group_id', label: 'Group', type: 'ref', ref: 'client_group' }],
  district: [{ name: 'district_id', label: 'District', type: 'ref', ref: 'district' }],
  zone: [{ name: 'zone_id', label: 'Zone', type: 'ref', ref: 'zone', dependsOn: 'district_id' }],
  expense: [{ name: 'expense_id', label: 'Expenses head', type: 'ref', ref: 'expense_head' }],
  employee: [{ name: 'employee_id', label: 'Employee', type: 'ref', ref: 'employee' }],
  ledger: [{ name: 'ledger_id', label: 'Ledger', type: 'ref', ref: 'ledger' }],
  cash_ledger: [{ name: 'ledger_id', label: 'Cash head', type: 'ref', ref: 'cash_ledger' }],
  bank_ledger: [{ name: 'ledger_id', label: 'Bank account', type: 'ref', ref: 'bank_ledger' }],
  mobile_ledger: [{ name: 'ledger_id', label: 'Mobile account', type: 'ref', ref: 'mobile_ledger' }],
  level: [{ name: 'level', label: 'Type', type: 'select', default: 'subgroup', options: [{ value: 'ledger', label: 'Ledger' }, { value: 'subgroup', label: 'Sub group' }, { value: 'group', label: 'Group' }] }],
  location: [{ name: 'loc', label: 'Branch / warehouse', type: 'ref', ref: 'location_bw' }],
  month: [
    { name: 'year', label: 'Year', type: 'number', default: new Date().getFullYear() },
    { name: 'month', label: 'Month', type: 'select', default: new Date().getMonth() + 1, options: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => ({ value: i + 1, label: m })) },
  ],
};

const sel = (name: string, label: string, opts: [string, string][], def?: string): Field => ({ name, label, type: 'select', default: def ?? opts[0][0], options: opts.map(([value, l]) => ({ value, label: l })) });
const ITEM = ['category', 'subcategory', 'brand', 'product'];

export type ReportMeta = { key: string; title: string; group: string; desc: string; filters: string[]; extra?: Field[]; landscape?: boolean };

export const REPORT_GROUPS = ['Daily', 'Sales', 'Service', 'Purchase', 'Accounts', 'Receivable', 'Payable', 'Voucher', 'Inventory', 'Employee'] as const;

export const REPORTS: ReportMeta[] = [
  // Daily
  { key: 'daily_purchase', title: 'Daily purchase report', group: 'Daily', desc: 'Items purchased with discounts, taxes and charges', filters: ['range', 'branch', ...ITEM], landscape: true },
  { key: 'daily_item_value', title: 'Item value details', group: 'Daily', desc: 'Stock quantity, cost and sale value per item', filters: [...ITEM, 'supplier'] },
  { key: 'daily_cash', title: 'Daily cash statement', group: 'Daily', desc: 'Opening cash, every inflow and outflow, closing cash', filters: ['range', 'branch'] },
  { key: 'daily_sales', title: 'Daily sales report', group: 'Daily', desc: 'Item lines sold per day', filters: ['range', 'branch', ...ITEM, 'customer', 'group'], landscape: true },
  { key: 'daily_sales_due', title: 'Daily sales due record', group: 'Daily', desc: 'Invoices with outstanding due', filters: ['range', 'branch', 'user', 'sales_person', 'group'] },
  { key: 'daily_pl_invoice', title: 'Profit & loss (invoice)', group: 'Daily', desc: 'Profit per sales invoice', filters: ['range', 'branch', 'group'], landscape: true },
  { key: 'daily_pl_item', title: 'Profit & loss (item)', group: 'Daily', desc: 'Profit per item sold', filters: ['range', 'branch', 'user', ...ITEM, 'sales_person', 'group'], landscape: true },
  { key: 'daily_service', title: 'Service sales record', group: 'Daily', desc: 'Service invoices in the period', filters: ['range', 'branch', 'group'] },
  { key: 'daily_service_due', title: 'Service sales due', group: 'Daily', desc: 'Service invoices with outstanding due', filters: ['range', 'branch', 'sales_person', 'group'] },
  { key: 'daily_pl_service_invoice', title: 'Service profit & loss (invoice)', group: 'Daily', desc: 'Profit per service invoice', filters: ['range', 'branch', 'group'], landscape: true },
  { key: 'daily_pl_service_item', title: 'Service profit & loss (item)', group: 'Daily', desc: 'Profit per service item', filters: ['range', 'branch', 'category', 'service', 'group'], landscape: true },
  { key: 'daily_expense', title: 'Daily expense report', group: 'Daily', desc: 'Expense vouchers in the period', filters: ['range', 'branch', 'expense'] },
  { key: 'daily_expense_details', title: 'Expenses details', group: 'Daily', desc: 'Expense lines by head', filters: ['range', 'branch', 'expense'], extra: [sel('type', 'Rep. Type', [['details', 'Details'], ['head', 'Head summary']])] },
  { key: 'daily_overview', title: 'Daily overview', group: 'Daily', desc: 'Sales, purchase, expense and cash summary', filters: ['range', 'branch'] },

  // Sales
  { key: 'sales_invoice', title: 'Sales record invoicewise', group: 'Sales', desc: 'Every sales invoice with payment and due', filters: ['range', 'branch', 'user', 'sales_person', 'group', 'customer'], landscape: true },
  { key: 'sales_invoice_item', title: 'Sales record item wise', group: 'Sales', desc: 'Invoice lines with discounts, VAT, cost and margin', filters: ['range', 'branch', 'user', ...ITEM, 'sales_person', 'group'], landscape: true },
  { key: 'sales_due', title: 'Sales due record', group: 'Sales', desc: 'Outstanding sales invoices', filters: ['range', 'branch', 'user', 'sales_person', 'group'] },
  { key: 'sales_return_invoice', title: 'Sales return invoice wise', group: 'Sales', desc: 'Sales return documents', filters: ['range', 'branch', 'group', 'customer'] },
  { key: 'sales_return_item', title: 'Sales return item wise', group: 'Sales', desc: 'Returned items', filters: ['range', 'branch', 'user', ...ITEM, 'group'] },
  { key: 'sales_customerwise', title: 'Sales customerwise report', group: 'Sales', desc: 'Invoice totals grouped by customer', filters: ['range', 'branch', 'customer', 'group'] },
  { key: 'sales_customerwise_details', title: 'Customer wise sales details', group: 'Sales', desc: 'Items bought by each customer', filters: ['range', 'branch', 'customer', 'group'] },
  { key: 'sales_return_customerwise', title: 'Sales return customerwise', group: 'Sales', desc: 'Returns grouped by customer', filters: ['range', 'branch', 'customer'] },
  { key: 'sales_customer_net', title: 'Customer net sales', group: 'Sales', desc: 'Sales, discount, return, net and balance per customer', filters: ['range', 'group'], extra: [sel('scope', 'Type', [['period', 'During Time'], ['all', 'All Time']])] },
  { key: 'sales_itemwise', title: 'Sales itemwise report', group: 'Sales', desc: 'Quantity and value sold per item with opening/closing stock', filters: ['range', 'branch', ...ITEM, 'group'], landscape: true },
  { key: 'sales_item_statement', title: 'Sales item statement', group: 'Sales', desc: 'Every sale of a chosen item', filters: ['range', 'branch', 'product'] },
  { key: 'sales_periodic', title: 'Periodic sales report', group: 'Sales', desc: 'Item sales in the period, optionally with serials', filters: ['range', 'branch', ...ITEM, 'customer', 'group'], extra: [sel('serial', 'Serial', [['no', 'Without Serial'], ['yes', 'With Serial']])], landscape: true },
  { key: 'sales_monthly', title: 'Monthly sales report', group: 'Sales', desc: 'Orders and revenue by day, week or month', filters: ['range', 'branch'], extra: [sel('period', 'Type', [['month', 'Monthly'], ['week', 'Weekly'], ['day', 'Daily']])] },
  { key: 'sales_overview', title: 'Sales overview', group: 'Sales', desc: 'Sales KPIs for the period', filters: ['range', 'branch'] },

  // Service
  { key: 'service_invoice', title: 'Service sales invoicewise', group: 'Service', desc: 'Every service invoice', filters: ['range', 'branch', 'group', 'customer'] },
  { key: 'service_due', title: 'Service sales due', group: 'Service', desc: 'Outstanding service invoices', filters: ['range', 'branch', 'sales_person', 'group'] },
  { key: 'service_customerwise', title: 'Service sales customerwise', group: 'Service', desc: 'Service totals by customer', filters: ['range', 'branch', 'customer'] },
  { key: 'service_itemwise', title: 'Service sales itemwise', group: 'Service', desc: 'Quantity and value per service', filters: ['range', 'branch', 'category', 'service', 'group'] },
  { key: 'service_item_statement', title: 'Service item statement', group: 'Service', desc: 'Every sale of a chosen service', filters: ['range', 'service'] },
  { key: 'service_periodic', title: 'Periodic service sales', group: 'Service', desc: 'Service lines in the period', filters: ['range', 'branch', 'category', 'service', 'customer', 'group'] },
  { key: 'service_overview', title: 'Service sales overview', group: 'Service', desc: 'Service KPIs for the period', filters: ['range', 'branch'] },

  // Purchase
  { key: 'purchase_invoice', title: 'Purchase record invoicewise', group: 'Purchase', desc: 'Every purchase invoice', filters: ['range', 'branch', 'supplier', 'user'] },
  { key: 'purchase_return_invoice', title: 'Purchase return invoicewise', group: 'Purchase', desc: 'Purchase return documents', filters: ['range', 'branch', 'supplier'] },
  { key: 'purchase_return_item', title: 'Purchase return item wise', group: 'Purchase', desc: 'Items returned to suppliers', filters: ['range', 'branch', 'user', ...ITEM] },
  { key: 'purchase_supplierwise', title: 'Purchase supplierwise', group: 'Purchase', desc: 'Purchase totals by supplier', filters: ['range', 'supplier'] },
  { key: 'purchase_supplierwise_details', title: 'Supplier wise purchase details', group: 'Purchase', desc: 'Items bought from each supplier', filters: ['range', 'supplier'] },
  { key: 'purchase_itemwise', title: 'Purchase itemwise', group: 'Purchase', desc: 'Quantity and cost per item purchased', filters: ['range', 'branch', ...ITEM], landscape: true },
  { key: 'purchase_item_statement', title: 'Purchase item statement', group: 'Purchase', desc: 'Every purchase of a chosen item', filters: ['range', 'product'] },
  { key: 'purchase_periodic', title: 'Periodic purchase records', group: 'Purchase', desc: 'Purchase lines in the period, optionally with serials', filters: ['range', 'branch', ...ITEM, 'supplier'], extra: [sel('serial', 'Serial', [['no', 'Without Serial'], ['yes', 'With Serial']])], landscape: true },
  { key: 'purchase_overview', title: 'Purchase overview', group: 'Purchase', desc: 'Purchase KPIs for the period', filters: ['range', 'branch'] },

  // Accounts
  { key: 'acc_ledger', title: 'Ledger statement', group: 'Accounts', desc: 'Transactions and running balance of any ledger', filters: ['range', 'ledger'] },
  { key: 'acc_cash', title: 'Cash statement', group: 'Accounts', desc: 'Cash in hand movement', filters: ['range', 'cash_ledger'] },
  { key: 'acc_bank', title: 'Bank statement', group: 'Accounts', desc: 'Bank account movement', filters: ['range', 'bank_ledger'] },
  { key: 'acc_mobile', title: 'Mobile account statement', group: 'Accounts', desc: 'Mobile wallet movement', filters: ['range', 'mobile_ledger'] },
  { key: 'acc_journal', title: 'Journal history', group: 'Accounts', desc: 'All journal entries with lines', filters: ['range'], extra: [sel('type', 'Type', [['', 'All'], ['sale', 'Sales'], ['purchase', 'Purchase'], ['service', 'Service'], ['sreturn', 'Sales Return'], ['preturn', 'Purchase Return'], ['payment', 'Payment'], ['receipt', 'Receipt'], ['journal', 'Journal'], ['contra', 'Transfer'], ['expense', 'Expense'], ['salary', 'Salary'], ['opening', 'Opening']], '')] },
  { key: 'acc_trial', title: 'Trial balance', group: 'Accounts', desc: 'Opening, period and closing balances', filters: ['range', 'level'], landscape: true },
  { key: 'acc_income', title: 'Income statement', group: 'Accounts', desc: 'Revenue, cost and profit', filters: ['range', 'level'] },
  { key: 'acc_balance', title: 'Balance sheet', group: 'Accounts', desc: 'Assets, liabilities and equity', filters: ['asof', 'level'] },
  { key: 'acc_overview', title: 'Accounts overview', group: 'Accounts', desc: 'Balances by account class and money accounts', filters: ['asof'] },

  // Receivable
  { key: 'rec_customers', title: 'Receivable customer list', group: 'Receivable', desc: 'Customer directory', filters: ['district', 'zone', 'group'] },
  { key: 'rec_balance', title: 'Customer balance', group: 'Receivable', desc: 'Debit, credit and balance per customer', filters: ['asof', 'district', 'zone', 'group'], extra: [sel('btype', 'Filter', [['all', 'All'], ['balance', 'With balance only']])] },
  { key: 'rec_statement', title: 'Customer statement', group: 'Receivable', desc: 'Account statement of a customer', filters: ['range', 'customer'] },
  { key: 'rec_item_statement', title: 'Customer statement itemwise', group: 'Receivable', desc: 'Every item a customer bought or returned', filters: ['range', 'customer'] },
  { key: 'rec_item_profit', title: 'Customerwise profit (item)', group: 'Receivable', desc: 'Margin on items sold to a customer', filters: ['range', ...ITEM, 'customer'], landscape: true },
  { key: 'rec_due_collection', title: 'Customer due collection', group: 'Receivable', desc: 'Collections received from customers', filters: ['range', 'district', 'zone', 'group'] },
  { key: 'rec_due_aging', title: 'Customer due with aging', group: 'Receivable', desc: 'Outstanding due split by age', filters: ['asof', 'district', 'zone', 'group'] },
  { key: 'rec_customer_overview', title: 'Customer overview', group: 'Receivable', desc: 'Lifetime summary of a customer', filters: ['customer'] },
  { key: 'rec_overview', title: 'Receive overview', group: 'Receivable', desc: 'Receivable KPIs', filters: ['range'] },

  // Payable
  { key: 'pay_suppliers', title: 'Supplier list', group: 'Payable', desc: 'Supplier directory', filters: ['group'] },
  { key: 'pay_balance', title: 'Supplier balance', group: 'Payable', desc: 'Debit, credit and payable per supplier', filters: ['asof'], extra: [sel('btype', 'Filter', [['all', 'All'], ['due', 'Payable (we owe)'], ['advance', 'Advanced'], ['balance', 'With balance only']])] },
  { key: 'pay_statement', title: 'Supplier statement', group: 'Payable', desc: 'Account statement of a supplier', filters: ['range', 'supplier'] },
  { key: 'pay_item_statement', title: 'Supplier statement itemwise', group: 'Payable', desc: 'Every item bought from or returned to a supplier', filters: ['range', 'supplier'] },
  { key: 'pay_purchase_sold', title: 'Purchase & sold (supplier wise)', group: 'Payable', desc: 'What was bought from a supplier and how much of it sold', filters: ['range', ...ITEM, 'supplier'], landscape: true },
  { key: 'pay_overview', title: 'Supplier overview', group: 'Payable', desc: 'Payable KPIs', filters: ['range'] },

  // Voucher
  { key: 'v_payment', title: 'Payment report', group: 'Voucher', desc: 'Payment voucher lines', filters: ['range'] },
  { key: 'v_receipt', title: 'Receipt report', group: 'Voucher', desc: 'Receive voucher lines', filters: ['range'] },
  { key: 'v_journal', title: 'Journal report', group: 'Voucher', desc: 'Journal voucher lines', filters: ['range'] },
  { key: 'v_pay_rec', title: 'Payment & receipt report', group: 'Voucher', desc: 'All money in and out by head', filters: ['range'], extra: [sel('type', 'Rep. Type', [['details', 'Details'], ['summary', 'Summary']])] },
  { key: 'v_cash_collection', title: 'Cash collection report', group: 'Voucher', desc: 'Money collected from customers (sales + receipts)', filters: ['range', 'customer', 'user'] },
  { key: 'v_internal', title: 'Internal transaction', group: 'Voucher', desc: 'Transfers between cash, bank and mobile accounts', filters: ['range'] },
  { key: 'v_overview', title: 'Voucher overview', group: 'Voucher', desc: 'Voucher counts and totals by type', filters: ['range'] },

  // Inventory
  { key: 'inv_products', title: 'Product list', group: 'Inventory', desc: 'Product catalogue', filters: ['category', 'subcategory', 'brand'], extra: [sel('status', 'Status', [['', 'All'], ['active', 'Active'], ['inactive', 'Inactive']], '')] },
  { key: 'inv_low_stock', title: 'Low stock product', group: 'Inventory', desc: 'Items at or below minimum stock', filters: ITEM },
  { key: 'inv_price', title: 'Product price', group: 'Inventory', desc: 'Price list with stock', filters: ['category', 'subcategory', 'brand', 'product'], extra: [sel('stock', 'Stock', [['', 'All'], ['in', 'In-Stock'], ['out', 'Out-Stock']], ''), sel('cost', 'Value', [['with', 'With Cost'], ['without', 'Without Cost']])] },
  { key: 'inv_serials', title: 'Serial record', group: 'Inventory', desc: 'Serial / IMEI numbers by status', filters: [...ITEM, 'supplier'], extra: [sel('status', 'Status', [['', 'All'], ['instock', 'Un-Sold'], ['sold', 'Sold'], ['preturned', 'Purchase Return'], ['disposed', 'Disposed'], ['warranty', 'Warranty Claim'], ['claimed', 'Claimed to supplier']], '')] },
  { key: 'inv_summary', title: 'Inventory summary', group: 'Inventory', desc: 'In, out and available per item', filters: ['location', ...ITEM] },
  { key: 'inv_periodic', title: 'Periodic inventory summary', group: 'Inventory', desc: 'Opening, in, out and closing quantity', filters: ['range', 'location', ...ITEM], extra: [sel('show', 'Show', [['all', 'All'], ['moved', 'In-Time (moved only)']])] },
  { key: 'inv_valuation', title: 'Inventory valuation', group: 'Inventory', desc: 'Stock value at average cost', filters: ['location', ...ITEM], extra: [sel('price', 'Type', [['without', 'Without Price'], ['with', 'With Price']])] },
  { key: 'inv_supplier_value', title: 'Supplier inventory valuation', group: 'Inventory', desc: 'Stock of items bought from each supplier', filters: ['supplier', ...ITEM], landscape: true },
  { key: 'inv_periodic_value', title: 'Periodic inventory valuation', group: 'Inventory', desc: 'Opening, in, out and closing value', filters: ['range', ...ITEM], landscape: true },
  { key: 'inv_disposal', title: 'Disposal inventory & valuation', group: 'Inventory', desc: 'Disposed items with loss', filters: ['range', ...ITEM] },
  { key: 'inv_aging', title: 'Inventory aging', group: 'Inventory', desc: 'Stock split by age of receipt', filters: ['supplier', ...ITEM], extra: [sel('type', 'Type', [['qty', 'Without Value'], ['value', 'With Value']])], landscape: true },
  { key: 'inv_overview', title: 'Inventory overview', group: 'Inventory', desc: 'Stock by branch / warehouse', filters: [] },

  // Employee
  { key: 'emp_list', title: 'Employee list', group: 'Employee', desc: 'Employee directory', filters: [] },
  { key: 'emp_attendance', title: 'Attendance', group: 'Employee', desc: 'Monthly attendance entry', filters: ['month', 'employee'] },
  { key: 'emp_leave', title: 'Leave record', group: 'Employee', desc: 'Leave applications', filters: ['range', 'employee'] },
  { key: 'emp_salary', title: 'Salary report', group: 'Employee', desc: 'Salary sheet for a month', filters: ['month', 'branch'] },
  { key: 'emp_commission', title: 'Commission report', group: 'Employee', desc: 'Sales by person with commission', filters: ['range', 'sales_person'] },
  { key: 'emp_overview', title: 'Employee overview', group: 'Employee', desc: 'Headcount, salary and leave summary', filters: [] },
];

export const REPORT_MAP = Object.fromEntries(REPORTS.map(r => [r.key, r]));
