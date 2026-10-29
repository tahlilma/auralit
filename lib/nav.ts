// Sidebar structure. Mirrors the original ERP menu; each item is gated by a permission module.
export type NavItem = { label: string; href: string; module?: string; action?: 'read' | 'write'; keywords?: string };
export type NavGroup = { label: string; icon: string; module?: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: 'Sales', icon: 'ShoppingCart', module: 'sales', items: [
      { label: 'New Sale (POS)', href: '/doc/sale/new', action: 'write', keywords: 'pos invoice create sell' },
      { label: 'Sales Invoices', href: '/doc/sale' },
      { label: 'Sales Estimates', href: '/doc/estimate', keywords: 'quotation' },
      { label: 'New Estimate', href: '/doc/estimate/new', action: 'write', keywords: 'quotation create' },
      { label: 'Sales Returns', href: '/doc/sreturn' },
      { label: 'New Sales Return', href: '/doc/sreturn/new', action: 'write' },
    ],
  },
  {
    label: 'Purchase', icon: 'PackagePlus', module: 'purchase', items: [
      { label: 'New Purchase', href: '/doc/purchase/new', action: 'write', keywords: 'purchase invoice create buy' },
      { label: 'Purchase Invoices', href: '/doc/purchase' },
      { label: 'Purchase Orders', href: '/doc/porder' },
      { label: 'New Purchase Order', href: '/doc/porder/new', action: 'write' },
      { label: 'Purchase Returns', href: '/doc/preturn' },
      { label: 'New Purchase Return', href: '/doc/preturn/new', action: 'write' },
    ],
  },
  {
    label: 'Service', icon: 'Wrench', module: 'service', items: [
      { label: 'New Service Invoice', href: '/doc/service/new', action: 'write' },
      { label: 'Service Invoices', href: '/doc/service' },
      { label: 'Service Estimates', href: '/doc/sestimate' },
      { label: 'New Service Estimate', href: '/doc/sestimate/new', action: 'write' },
      { label: 'Service Items', href: '/data/service' },
    ],
  },
  {
    label: 'Daily Process', icon: 'CalendarCheck', module: 'daily', items: [
      { label: 'Price List', href: '/daily/prices', keywords: 'barcode sticker' },
      { label: 'Update Price List', href: '/daily/prices/update' },
      { label: 'Barcode & Stickers', href: '/daily/barcodes' },
      { label: 'Expenses Record', href: '/vouchers/expense' },
      { label: 'Create Expenses', href: '/vouchers/expense/new', action: 'write' },
      { label: 'Expenses Head', href: '/data/expense_head' },
    ],
  },
  {
    label: 'Customer Enquiry', icon: 'MessageSquareText', module: 'enquiry', items: [
      { label: 'Enquiry & Follow Up', href: '/enquiry', keywords: 'lead' },
      { label: 'Source of Enquiry', href: '/data/enquiry_source' },
      { label: 'Type of Enquiry', href: '/data/enquiry_type' },
      { label: 'Course of Action', href: '/data/enquiry_action' },
    ],
  },
  {
    label: 'Warranty', icon: 'ShieldCheck', module: 'warranty', items: [
      { label: 'Warranty Claims', href: '/warranty/claims' },
      { label: 'Product Checking', href: '/warranty/checking' },
      { label: 'Manage Product', href: '/warranty/manage' },
      { label: 'Warranty Delivered', href: '/warranty/delivered' },
      { label: 'Warranty Stock', href: '/warranty/stock' },
      { label: 'Self Stock Manage', href: '/stock/self_bad' },
      { label: 'Claim To Supplier', href: '/stock/bad_claim' },
      { label: 'Service Centers', href: '/data/service_center' },
    ],
  },
  {
    label: 'Inventory', icon: 'Boxes', module: 'inventory', items: [
      { label: 'Branch Stock', href: '/inventory/branch' },
      { label: 'Warehouse Stock', href: '/inventory/warehouse' },
      { label: 'Combined Stock', href: '/inventory/combined' },
      { label: 'Product Delivery', href: '/stock/delivery' },
      { label: 'Product Received', href: '/stock/receive' },
      { label: 'Transfer From Branch', href: '/stock/transfer_b' },
      { label: 'Transfer From Warehouse', href: '/stock/transfer_w' },
      { label: 'Product Disposal', href: '/stock/disposal' },
      { label: 'Warehouses', href: '/data/warehouse' },
    ],
  },
  {
    label: 'Clients', icon: 'Users', module: 'client', items: [
      { label: 'Customers', href: '/data/customer' },
      { label: 'Suppliers', href: '/data/supplier', keywords: 'vendor' },
      { label: 'Client Groups', href: '/data/client_group' },
      { label: 'Bulk SMS', href: '/clients/sms' },
    ],
  },
  {
    label: 'Products', icon: 'Package', module: 'product', items: [
      { label: 'Products', href: '/data/product' },
      { label: 'Parents', href: '/data/parent' },
      { label: 'Categories', href: '/data/category' },
      { label: 'Sub-Categories', href: '/data/subcategory' },
    ],
  },
  {
    label: 'Offers & Rebate', icon: 'BadgePercent', module: 'offer', items: [
      { label: 'Coupons & Offers', href: '/data/offer' },
      { label: 'Set Offer On Items', href: '/offers/assign' },
      { label: 'Rebate Claims', href: '/offers/rebates' },
    ],
  },
  {
    label: 'Master Setup', icon: 'Settings2', module: 'master', items: [
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
      { label: 'Payment Vouchers', href: '/vouchers/payment' },
      { label: 'New Payment', href: '/vouchers/payment/new', action: 'write' },
      { label: 'Receive Vouchers', href: '/vouchers/receipt' },
      { label: 'New Receipt', href: '/vouchers/receipt/new', action: 'write', keywords: 'collection' },
      { label: 'Journal Entries', href: '/vouchers/journal' },
      { label: 'Bank / Cash Transfers', href: '/vouchers/contra', keywords: 'transaction contra' },
      { label: 'Donations', href: '/vouchers/donation' },
      { label: 'Cheque Management', href: '/accounts/cheques' },
    ],
  },
  {
    label: 'Accounts Setup', icon: 'BookOpen', module: 'account', items: [
      { label: 'Account Classes', href: '/data/acc_class' },
      { label: 'Account Groups', href: '/data/acc_group' },
      { label: 'Account Sub-Groups', href: '/data/acc_subgroup' },
      { label: 'Ledgers', href: '/data/ledger' },
    ],
  },
  {
    label: 'Finance', icon: 'ChartLine', module: 'financial', items: [
      { label: 'Chart of Accounts', href: '/finance/chart' },
      { label: 'Income Statement', href: '/finance/income', keywords: 'profit loss' },
      { label: 'Trial Balance', href: '/finance/trial' },
      { label: 'Balance Sheet', href: '/finance/balance' },
      { label: 'Finance Analysis', href: '/finance/analysis', keywords: 'ratio' },
      { label: 'Ledger Statement', href: '/finance/ledger' },
    ],
  },
  {
    label: 'Bank & Loan', icon: 'Wallet', module: 'bank', items: [
      { label: 'Banks', href: '/data/bank' },
      { label: 'Bank Accounts', href: '/data/bank_account' },
      { label: 'Mobile Accounts', href: '/data/mobile_account', keywords: 'bkash nagad' },
      { label: 'Loan Accounts', href: '/data/loan_account', module: 'loan', keywords: 'installment' },
    ],
  },
  {
    label: 'Payroll', icon: 'IdCard', module: 'payroll', items: [
      { label: 'Employees', href: '/data/employee' },
      { label: 'Departments', href: '/data/department' },
      { label: 'Designations', href: '/data/designation' },
      { label: 'Leave Types', href: '/data/leave_type' },
      { label: 'Leave Records', href: '/data/leave_app' },
      { label: 'Attendance', href: '/payroll/attendance' },
      { label: 'Salary Sheet & Payslip', href: '/payroll/salary' },
    ],
  },
  {
    label: 'Reports', icon: 'FileBarChart', module: 'report', items: [
      { label: 'Report Center', href: '/reports' },
      { label: 'Daily Cash Statement', href: '/reports/daily_cash' },
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
    label: 'Users & Roles', icon: 'UserCog', module: 'user', items: [
      { label: 'Users', href: '/users' },
      { label: 'Roles & Permissions', href: '/users/roles' },
      { label: 'Report Access', href: '/users/report-roles' },
      { label: 'Activity Log', href: '/users/activity' },
    ],
  },
  {
    label: 'Company & Settings', icon: 'Building2', module: 'setting', items: [
      { label: 'Company Setup', href: '/settings/company' },
      { label: 'Branches', href: '/data/branch' },
      { label: 'Local Settings', href: '/settings/local' },
      { label: 'SMS Templates & Gateway', href: '/settings/sms' },
      { label: 'Data Management', href: '/settings/data', keywords: 'backup reset' },
    ],
  },
];

export const QUICK_ACTIONS = [
  { label: 'Sale', href: '/doc/sale/new', icon: 'ShoppingCart', module: 'sales' },
  { label: 'Service', href: '/doc/service/new', icon: 'Wrench', module: 'service' },
  { label: 'Sales Return', href: '/doc/sreturn/new', icon: 'Undo2', module: 'sales' },
  { label: 'Purchase', href: '/doc/purchase/new', icon: 'PackagePlus', module: 'purchase' },
  { label: 'Purchase Return', href: '/doc/preturn/new', icon: 'Redo2', module: 'purchase' },
  { label: 'Add Product', href: '/data/product?new=1', icon: 'Package', module: 'product' },
  { label: 'Expense', href: '/vouchers/expense/new', icon: 'Receipt', module: 'daily' },
  { label: 'Receive', href: '/vouchers/receipt/new', icon: 'HandCoins', module: 'acctra' },
  { label: 'Payment', href: '/vouchers/payment/new', icon: 'Banknote', module: 'acctra' },
  { label: 'Cash Statement', href: '/reports/daily_cash', icon: 'FileBarChart', module: 'report' },
  { label: 'Warranty Claim', href: '/warranty/claims?new=1', icon: 'ShieldCheck', module: 'warranty' },
  { label: 'Inventory', href: '/inventory/branch', icon: 'Boxes', module: 'inventory' },
];
