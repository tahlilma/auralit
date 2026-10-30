// Sidebar structure. Mirrors the original ERP menu; each item is gated by a permission module.
export type NavItem = { label: string; href: string; module?: string; action?: 'read' | 'write'; keywords?: string };
export type NavGroup = { label: string; icon: string; module?: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: 'Sales', icon: 'ShoppingCart', module: 'sales', items: [
      { label: 'New sale (POS)', href: '/doc/sale/new', action: 'write', keywords: 'pos invoice create sell' },
      { label: 'Sales invoices', href: '/doc/sale' },
      { label: 'Sales estimates', href: '/doc/estimate', keywords: 'quotation' },
      { label: 'New estimate', href: '/doc/estimate/new', action: 'write', keywords: 'quotation create' },
      { label: 'Sales returns', href: '/doc/sreturn' },
      { label: 'New sales return', href: '/doc/sreturn/new', action: 'write' },
    ],
  },
  {
    label: 'Purchase', icon: 'PackagePlus', module: 'purchase', items: [
      { label: 'New purchase', href: '/doc/purchase/new', action: 'write', keywords: 'purchase invoice create buy' },
      { label: 'Purchase invoices', href: '/doc/purchase' },
      { label: 'Purchase orders', href: '/doc/porder' },
      { label: 'New purchase order', href: '/doc/porder/new', action: 'write' },
      { label: 'Purchase returns', href: '/doc/preturn' },
      { label: 'New purchase return', href: '/doc/preturn/new', action: 'write' },
    ],
  },
  {
    label: 'Service', icon: 'Wrench', module: 'service', items: [
      { label: 'New service invoice', href: '/doc/service/new', action: 'write' },
      { label: 'Service invoices', href: '/doc/service' },
      { label: 'Service estimates', href: '/doc/sestimate' },
      { label: 'New service estimate', href: '/doc/sestimate/new', action: 'write' },
      { label: 'Service items', href: '/data/service' },
    ],
  },
  {
    label: 'Daily process', icon: 'CalendarCheck', module: 'daily', items: [
      { label: 'Price list', href: '/daily/prices', keywords: 'barcode sticker' },
      { label: 'Update price list', href: '/daily/prices/update' },
      { label: 'Barcode & stickers', href: '/daily/barcodes' },
      { label: 'Expenses record', href: '/vouchers/expense' },
      { label: 'Create expenses', href: '/vouchers/expense/new', action: 'write' },
      { label: 'Expenses head', href: '/data/expense_head' },
    ],
  },
  {
    label: 'Customer enquiry', icon: 'MessageSquareText', module: 'enquiry', items: [
      { label: 'Enquiry & follow up', href: '/enquiry', keywords: 'lead' },
      { label: 'Source of enquiry', href: '/data/enquiry_source' },
      { label: 'Type of enquiry', href: '/data/enquiry_type' },
      { label: 'Course of action', href: '/data/enquiry_action' },
    ],
  },
  {
    label: 'Warranty', icon: 'ShieldCheck', module: 'warranty', items: [
      { label: 'Warranty claims', href: '/warranty/claims' },
      { label: 'Product checking', href: '/warranty/checking' },
      { label: 'Manage product', href: '/warranty/manage' },
      { label: 'Warranty delivered', href: '/warranty/delivered' },
      { label: 'Warranty stock', href: '/warranty/stock' },
      { label: 'Self stock manage', href: '/stock/self_bad' },
      { label: 'Claim to supplier', href: '/stock/bad_claim' },
      { label: 'Service centers', href: '/data/service_center' },
    ],
  },
  {
    label: 'Inventory', icon: 'Boxes', module: 'inventory', items: [
      { label: 'Branch stock', href: '/inventory/branch' },
      { label: 'Warehouse stock', href: '/inventory/warehouse' },
      { label: 'Combined stock', href: '/inventory/combined' },
      { label: 'Product delivery', href: '/stock/delivery' },
      { label: 'Product received', href: '/stock/receive' },
      { label: 'Transfer from branch', href: '/stock/transfer_b' },
      { label: 'Transfer from warehouse', href: '/stock/transfer_w' },
      { label: 'Product disposal', href: '/stock/disposal' },
      { label: 'Warehouses', href: '/data/warehouse' },
    ],
  },
  {
    label: 'Clients', icon: 'Users', module: 'client', items: [
      { label: 'Customers', href: '/data/customer' },
      { label: 'Suppliers', href: '/data/supplier', keywords: 'vendor' },
      { label: 'Client groups', href: '/data/client_group' },
      { label: 'Bulk SMS', href: '/clients/sms' },
    ],
  },
  {
    label: 'Products', icon: 'Package', module: 'product', items: [
      { label: 'Products', href: '/data/product' },
      { label: 'Parents', href: '/data/parent' },
      { label: 'Categories', href: '/data/category' },
      { label: 'Sub-categories', href: '/data/subcategory' },
    ],
  },
  {
    label: 'Offers & rebate', icon: 'BadgePercent', module: 'offer', items: [
      { label: 'Coupons & offers', href: '/data/offer' },
      { label: 'Set offer on items', href: '/offers/assign' },
      { label: 'Rebate claims', href: '/offers/rebates' },
    ],
  },
  {
    label: 'Master setup', icon: 'Settings2', module: 'master', items: [
      { label: 'Brands', href: '/data/brand' },
      { label: 'Manufacturers', href: '/data/manufacturer' },
      { label: 'Units', href: '/data/unit' },
      { label: 'Currencies', href: '/data/currency' },
      { label: 'Countries', href: '/data/country' },
      { label: 'Transporters', href: '/data/transporter', keywords: 'shipping' },
      { label: 'Colors', href: '/data/color' },
      { label: 'Sizes', href: '/data/size' },
      { label: 'Districts', href: '/data/district' },
      { label: 'Zones', href: '/data/zone' },
    ],
  },
  {
    label: 'Accounts', icon: 'Landmark', module: 'acctra', items: [
      { label: 'Payment vouchers', href: '/vouchers/payment' },
      { label: 'New payment', href: '/vouchers/payment/new', action: 'write' },
      { label: 'Receive vouchers', href: '/vouchers/receipt' },
      { label: 'New receipt', href: '/vouchers/receipt/new', action: 'write', keywords: 'collection' },
      { label: 'Journal entries', href: '/vouchers/journal' },
      { label: 'Bank / cash transfers', href: '/vouchers/contra', keywords: 'transaction contra' },
      { label: 'Donations', href: '/vouchers/donation' },
      { label: 'Cheque management', href: '/accounts/cheques' },
    ],
  },
  {
    label: 'Accounts setup', icon: 'BookOpen', module: 'account', items: [
      { label: 'Account classes', href: '/data/acc_class' },
      { label: 'Account groups', href: '/data/acc_group' },
      { label: 'Account sub-groups', href: '/data/acc_subgroup' },
      { label: 'Ledgers', href: '/data/ledger' },
    ],
  },
  {
    label: 'Finance', icon: 'ChartLine', module: 'financial', items: [
      { label: 'Chart of accounts', href: '/finance/chart' },
      { label: 'Income statement', href: '/finance/income', keywords: 'profit loss' },
      { label: 'Trial balance', href: '/finance/trial' },
      { label: 'Balance sheet', href: '/finance/balance' },
      { label: 'Finance analysis', href: '/finance/analysis', keywords: 'ratio' },
      { label: 'Ledger statement', href: '/finance/ledger' },
    ],
  },
  {
    label: 'Bank & loan', icon: 'Wallet', module: 'bank', items: [
      { label: 'Banks', href: '/data/bank' },
      { label: 'Bank accounts', href: '/data/bank_account' },
      { label: 'Mobile accounts', href: '/data/mobile_account', keywords: 'bkash nagad' },
      { label: 'Loan accounts', href: '/data/loan_account', module: 'loan', keywords: 'installment' },
    ],
  },
  {
    label: 'Payroll', icon: 'IdCard', module: 'payroll', items: [
      { label: 'Employees', href: '/data/employee' },
      { label: 'Departments', href: '/data/department' },
      { label: 'Designations', href: '/data/designation' },
      { label: 'Leave types', href: '/data/leave_type' },
      { label: 'Leave records', href: '/data/leave_app' },
      { label: 'Attendance', href: '/payroll/attendance' },
      { label: 'Salary sheet & payslip', href: '/payroll/salary' },
    ],
  },
  {
    label: 'Reports', icon: 'FileBarChart', module: 'report', items: [
      { label: 'Report center', href: '/reports' },
      { label: 'Daily cash statement', href: '/reports/daily_cash' },
    ],
  },
  {
    label: 'Personal', icon: 'NotebookPen', module: 'personal', items: [
      { label: 'Notes', href: '/personal/notes' },
      { label: 'Todo', href: '/personal/todo' },
      { label: 'Events', href: '/personal/events', keywords: 'calendar' },
    ],
  },
  {
    label: 'Users & roles', icon: 'UserCog', module: 'user', items: [
      { label: 'Users', href: '/users' },
      { label: 'Roles & permissions', href: '/users/roles' },
      { label: 'Report access', href: '/users/report-roles' },
      { label: 'Activity log', href: '/users/activity' },
    ],
  },
  {
    label: 'Company & settings', icon: 'Building2', module: 'setting', items: [
      { label: 'Company setup', href: '/settings/company' },
      { label: 'Branches', href: '/data/branch' },
      { label: 'Local settings', href: '/settings/local' },
      { label: 'SMS templates & gateway', href: '/settings/sms' },
      { label: 'Data management', href: '/settings/data', keywords: 'backup reset' },
    ],
  },
];

export const QUICK_ACTIONS = [
  { label: 'Sale', href: '/doc/sale/new', icon: 'ShoppingCart', module: 'sales' },
  { label: 'Service', href: '/doc/service/new', icon: 'Wrench', module: 'service' },
  { label: 'Sales return', href: '/doc/sreturn/new', icon: 'Undo2', module: 'sales' },
  { label: 'Purchase', href: '/doc/purchase/new', icon: 'PackagePlus', module: 'purchase' },
  { label: 'Purchase return', href: '/doc/preturn/new', icon: 'Redo2', module: 'purchase' },
  { label: 'Add product', href: '/data/product?new=1', icon: 'Package', module: 'product' },
  { label: 'Expense', href: '/vouchers/expense/new', icon: 'Receipt', module: 'daily' },
  { label: 'Receive', href: '/vouchers/receipt/new', icon: 'HandCoins', module: 'acctra' },
  { label: 'Payment', href: '/vouchers/payment/new', icon: 'Banknote', module: 'acctra' },
  { label: 'Cash statement', href: '/reports/daily_cash', icon: 'FileBarChart', module: 'report' },
  { label: 'Warranty claim', href: '/warranty/claims?new=1', icon: 'ShieldCheck', module: 'warranty' },
  { label: 'Inventory', href: '/inventory/branch', icon: 'Boxes', module: 'inventory' },
];
