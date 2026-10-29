// Config for every master-data / setup screen. Used by the server (validation, SQL) and the client (forms, tables).

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'ref' | 'color' | 'email' | 'tel' | 'image' | 'checkbox' | 'password';

export type Option = { value: string | number; label: string };

export type Field = {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  options?: Option[];
  /** Lookup key for `ref` fields (see LOOKUPS on the server). */
  ref?: string;
  /** For dependent refs: the other field whose value filters this lookup. */
  dependsOn?: string;
  placeholder?: string;
  /** Auto-generated on create (shown read-only). */
  auto?: boolean;
  span?: 1 | 2 | 3;
  help?: string;
  default?: string | number;
  /** Only shown when creating. */
  createOnly?: boolean;
  hidden?: boolean;
};

export type Column = { key: string; label: string; type?: 'money' | 'date' | 'datetime' | 'badge' | 'color' | 'image' | 'number' | 'bool' | 'multiline'; width?: string };

export type Entity = {
  key: string;
  table: string;
  label: string;
  plural: string;
  module: string;
  description?: string;
  fields: Field[];
  columns: Column[];
  /** SELECT used for lists; main table must be aliased `t`. */
  select?: string;
  where?: string;
  search: string[];
  orderBy?: string;
  filters?: Field[];
  readOnly?: boolean;
  noDelete?: boolean;
  /** Show the ledger statement action (balance-bearing records). */
  statement?: boolean;
};

const STATUS: Option[] = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];
const YESNO: Option[] = [{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }];
const nameDesc = (ph: string): Field[] => [
  { name: 'name', label: 'Name', required: true, placeholder: ph, span: 3 },
  { name: 'description', label: 'Description', type: 'textarea', span: 3 },
];
const nameDescCols: Column[] = [{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }];

export const ENTITIES: Record<string, Entity> = {
  // ───────── Master setup ─────────
  brand: { key: 'brand', table: 'brands', label: 'Brand', plural: 'Brands', module: 'master', fields: nameDesc('e.g. La Cimbali'), columns: nameDescCols, search: ['t.name'] },
  manufacturer: {
    key: 'manufacturer', table: 'manufacturers', label: 'Manufacturer', plural: 'Manufacturers', module: 'master',
    fields: [
      { name: 'name', label: 'Manufacturer Name', required: true, placeholder: 'e.g. Sun Sui Hong', span: 2 },
      { name: 'rank', label: 'Rank', type: 'number' },
      { name: 'cperson', label: 'Contact Person' }, { name: 'cmobile', label: 'Contact Mobile', type: 'tel' }, { name: 'email', label: 'Contact Email', type: 'email' },
      { name: 'web', label: 'Web', span: 3 },
      { name: 'address', label: 'Address', type: 'textarea', span: 3 },
      { name: 'mainpro', label: 'Main Product', type: 'textarea', span: 3 },
      { name: 'description', label: 'Description', type: 'textarea', span: 3 },
    ],
    columns: [{ key: 'name', label: 'Name' }, { key: 'contact', label: 'Contact', type: 'multiline' }, { key: 'address', label: 'Address' }, { key: 'mainpro', label: 'Main Product' }],
    select: `SELECT t.*, TRIM(COALESCE(t.cperson,'') || char(10) || COALESCE(t.cmobile,'') || char(10) || COALESCE(t.email,'')) contact FROM manufacturers t`,
    search: ['t.name', 't.cperson', 't.cmobile'],
  },
  unit: { key: 'unit', table: 'units', label: 'Unit', plural: 'Units', module: 'master', fields: nameDesc('e.g. Pcs'), columns: nameDescCols, search: ['t.name'] },
  currency: {
    key: 'currency', table: 'currencies', label: 'Currency', plural: 'Currencies', module: 'master',
    fields: [
      { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Taka' }, { name: 'subunit', label: 'Subunit', placeholder: 'e.g. Poisha' },
      { name: 'sort', label: 'Short', placeholder: 'e.g. BDT' }, { name: 'symbol', label: 'Symbol', placeholder: 'e.g. ৳' },
      { name: 'exrate', label: 'Exchange Rate', type: 'number', default: 1 }, { name: 'is_default', label: 'Default', type: 'select', options: YESNO, default: 0 },
    ],
    columns: [{ key: 'name', label: 'Name' }, { key: 'subunit', label: 'Subunit' }, { key: 'sort', label: 'Short' }, { key: 'symbol', label: 'Symbol' }, { key: 'exrate', label: 'Exchange Rate', type: 'number' }, { key: 'is_default', label: 'Default', type: 'bool' }],
    search: ['t.name', 't.sort'],
  },
  country: { key: 'country', table: 'countries', label: 'Country', plural: 'Countries', module: 'master', fields: nameDesc('e.g. Bangladesh'), columns: nameDescCols, search: ['t.name'] },
  transporter: {
    key: 'transporter', table: 'transporters', label: 'Transporter', plural: 'Transporters', module: 'master',
    fields: [{ name: 'sort', label: 'Short Name', placeholder: 'e.g. OOCL' }, { name: 'name', label: 'Name', required: true, span: 2 }, { name: 'contact', label: 'Contact No', type: 'tel', span: 3 }, { name: 'address', label: 'Address', type: 'textarea', span: 3 }],
    columns: [{ key: 'sort', label: 'Short' }, { key: 'name', label: 'Name' }, { key: 'contact', label: 'Contact' }, { key: 'address', label: 'Address' }],
    search: ['t.name', 't.sort'],
  },
  color: {
    key: 'color', table: 'colors', label: 'Color', plural: 'Colors', module: 'master',
    fields: [{ name: 'name', label: 'Name', required: true, placeholder: 'e.g. Green', span: 2 }, { name: 'hex', label: 'Color', type: 'color', default: '#000000' }],
    columns: [{ key: 'name', label: 'Name' }, { key: 'hex', label: 'Color', type: 'color' }], search: ['t.name'],
  },
  size: {
    key: 'size', table: 'sizes', label: 'Size', plural: 'Sizes', module: 'master',
    fields: [{ name: 'name', label: 'Name', required: true, span: 2 }, { name: 'size', label: 'Size' }],
    columns: [{ key: 'name', label: 'Name' }, { key: 'size', label: 'Size' }], search: ['t.name'],
  },
  district: {
    key: 'district', table: 'districts', label: 'District', plural: 'Districts', module: 'master',
    fields: [{ name: 'name', label: 'District', required: true, span: 2 }, { name: 'country_id', label: 'Country', type: 'ref', ref: 'country', required: true }],
    columns: [{ key: 'name', label: 'District' }, { key: 'country', label: 'Country' }],
    select: `SELECT t.*, c.name country FROM districts t LEFT JOIN countries c ON c.id = t.country_id`, search: ['t.name'], orderBy: 't.name',
  },
  zone: {
    key: 'zone', table: 'zones', label: 'Zone', plural: 'Zones', module: 'master',
    fields: [{ name: 'district_id', label: 'District', type: 'ref', ref: 'district', required: true }, { name: 'name', label: 'Zone', required: true, span: 2 }],
    columns: [{ key: 'district', label: 'District' }, { key: 'name', label: 'Zone' }],
    select: `SELECT t.*, d.name district FROM zones t LEFT JOIN districts d ON d.id = t.district_id`, search: ['t.name', 'd.name'],
    filters: [{ name: 'district_id', label: 'District', type: 'ref', ref: 'district' }],
  },

  // ───────── Client setup ─────────
  client_group: { key: 'client_group', table: 'client_groups', label: 'Group', plural: 'Client Groups', module: 'client', fields: nameDesc('e.g. Corporate'), columns: nameDescCols, search: ['t.name'] },
  customer: {
    key: 'customer', table: 'customers', label: 'Customer', plural: 'Customers', module: 'client', statement: true,
    fields: [
      { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Md. Sumon Rahman', span: 2 },
      { name: 'code', label: 'Code', auto: true },
      { name: 'cperson', label: 'Father / Contact Name' }, { name: 'mname', label: 'Mother Name' }, { name: 'nid', label: 'National ID (NID)' },
      { name: 'mobile', label: 'Contact Number', type: 'tel', required: true }, { name: 'phone', label: 'Contact Phone', type: 'tel' }, { name: 'email', label: 'Contact Email', type: 'email' },
      { name: 'district_id', label: 'District', type: 'ref', ref: 'district' }, { name: 'zone_id', label: 'Zone', type: 'ref', ref: 'zone', dependsOn: 'district_id' },
      { name: 'group_id', label: 'Group', type: 'ref', ref: 'client_group' },
      { name: 'address', label: 'Address', type: 'textarea', span: 3 }, { name: 'shipping_address', label: 'Shipping Address', type: 'textarea', span: 3 },
      { name: 'bin', label: 'BIN' }, { name: 'credit_limit', label: 'Credit Limit', type: 'money' }, { name: 'allow_days', label: 'Allowed Days', type: 'number' },
      { name: 'get_reward', label: 'Get Reward', type: 'select', options: YESNO, default: 0 }, { name: 'rank', label: 'Ranking', type: 'number' },
      { name: 'status', label: 'Status', type: 'select', options: STATUS, default: 'active' },
      { name: 'opening_balance', label: 'Opening Due', type: 'money', help: 'Previous balance the customer owes you', createOnly: true },
    ],
    columns: [
      { key: 'name', label: 'Customer' }, { key: 'code', label: 'Code' }, { key: 'mobile', label: 'Mobile' }, { key: 'address', label: 'Address' },
      { key: 'group_name', label: 'Group' }, { key: 'balance', label: 'Due', type: 'money' }, { key: 'last_active', label: 'Last Active', type: 'datetime' }, { key: 'status', label: 'Status', type: 'badge' },
    ],
    select: `SELECT t.*, g.name group_name, d.name district, (SELECT COALESCE(SUM(debit-credit),0) FROM journal_lines WHERE ledger_id = t.ledger_id) balance
             FROM customers t LEFT JOIN client_groups g ON g.id = t.group_id LEFT JOIN districts d ON d.id = t.district_id`,
    where: 't.is_walkin = 0',
    search: ['t.name', 't.code', 't.mobile', 't.email'],
    filters: [{ name: 'group_id', label: 'Group', type: 'ref', ref: 'client_group' }, { name: 'district_id', label: 'District', type: 'ref', ref: 'district' }],
  },
  supplier: {
    key: 'supplier', table: 'suppliers', label: 'Supplier', plural: 'Suppliers', module: 'client', statement: true,
    fields: [
      { name: 'name', label: 'Name', required: true, span: 2 }, { name: 'code', label: 'Code', auto: true },
      { name: 'cperson', label: 'Contact Name' }, { name: 'mobile', label: 'Contact Number', type: 'tel' }, { name: 'phone', label: 'Contact Phone', type: 'tel' },
      { name: 'email', label: 'Contact Email', type: 'email' }, { name: 'credit_limit', label: 'Credit Limit', type: 'money' }, { name: 'allow_days', label: 'Allowed Days', type: 'number' },
      { name: 'rank', label: 'Ranking', type: 'number' }, { name: 'group_id', label: 'Group', type: 'ref', ref: 'client_group' },
      { name: 'status', label: 'Status', type: 'select', options: STATUS, default: 'active' },
      { name: 'address', label: 'Address', type: 'textarea', span: 3 }, { name: 'factory_address', label: 'Factory Address', type: 'textarea', span: 3 },
      { name: 'opening_balance', label: 'Opening Payable', type: 'money', help: 'Previous balance you owe the supplier', createOnly: true },
    ],
    columns: [
      { key: 'name', label: 'Supplier' }, { key: 'code', label: 'Code' }, { key: 'mobile', label: 'Mobile' }, { key: 'address', label: 'Address' },
      { key: 'balance', label: 'Payable', type: 'money' }, { key: 'last_active', label: 'Last Active', type: 'datetime' }, { key: 'status', label: 'Status', type: 'badge' },
    ],
    select: `SELECT t.*, g.name group_name, (SELECT COALESCE(SUM(credit-debit),0) FROM journal_lines WHERE ledger_id = t.ledger_id) balance
             FROM suppliers t LEFT JOIN client_groups g ON g.id = t.group_id`,
    where: 't.is_opening = 0',
    search: ['t.name', 't.code', 't.mobile', 't.email'],
    filters: [{ name: 'group_id', label: 'Group', type: 'ref', ref: 'client_group' }],
  },

  // ───────── Product setup ─────────
  parent: { key: 'parent', table: 'product_parents', label: 'Parent', plural: 'Product Parents', module: 'product', fields: nameDesc('e.g. Coffee'), columns: nameDescCols, search: ['t.name'] },
  category: {
    key: 'category', table: 'categories', label: 'Category', plural: 'Categories', module: 'product',
    fields: [{ name: 'name', label: 'Category Name', required: true, span: 2 }, { name: 'parent_id', label: 'Parent', type: 'ref', ref: 'parent' }, { name: 'description', label: 'Description', type: 'textarea', span: 3 }],
    columns: [{ key: 'name', label: 'Name' }, { key: 'parent', label: 'Parent' }, { key: 'description', label: 'Description' }],
    select: `SELECT t.*, p.name parent FROM categories t LEFT JOIN product_parents p ON p.id = t.parent_id`, search: ['t.name'], orderBy: 't.name',
  },
  subcategory: {
    key: 'subcategory', table: 'subcategories', label: 'Sub-Category', plural: 'Sub-Categories', module: 'product',
    fields: [{ name: 'name', label: 'Sub-Category Name', required: true, span: 2 }, { name: 'category_id', label: 'Category', type: 'ref', ref: 'category', required: true }, { name: 'description', label: 'Description', type: 'textarea', span: 3 }],
    columns: [{ key: 'category', label: 'Category' }, { key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }],
    select: `SELECT t.*, c.name category FROM subcategories t LEFT JOIN categories c ON c.id = t.category_id`, search: ['t.name', 'c.name'],
    filters: [{ name: 'category_id', label: 'Category', type: 'ref', ref: 'category' }],
  },
  product: {
    key: 'product', table: 'products', label: 'Product', plural: 'Products', module: 'product',
    fields: [
      { name: 'name', label: 'Name', required: true, span: 2 }, { name: 'code', label: 'Code', auto: true },
      { name: 'parent_id', label: 'Parent (Optional)', type: 'ref', ref: 'parent' }, { name: 'category_id', label: 'Category', type: 'ref', ref: 'category' },
      { name: 'subcategory_id', label: 'Sub-Category', type: 'ref', ref: 'subcategory', dependsOn: 'category_id' },
      { name: 'brand_id', label: 'Brand', type: 'ref', ref: 'brand' }, { name: 'manufacturer_id', label: 'Manufacturer', type: 'ref', ref: 'manufacturer' },
      { name: 'unit_id', label: 'Unit', type: 'ref', ref: 'unit' },
      { name: 'mode', label: 'Product Mode', type: 'select', default: 'nonserial', options: [{ value: 'nonserial', label: 'Non-Serial' }, { value: 'serial', label: 'Serial' }, { value: 'imei', label: 'IMEI' }, { value: 'expiry', label: 'Expire Date' }] },
      { name: 'country_id', label: 'Country', type: 'ref', ref: 'country' }, { name: 'status', label: 'Status', type: 'select', options: STATUS, default: 'active' },
      { name: 'model', label: 'Model No' }, { name: 'brand_no', label: 'Brand No' }, { name: 'certificate', label: 'Certificate', placeholder: 'e.g. ISO:9001' },
      { name: 'cost', label: 'Cost', type: 'money' }, { name: 'price', label: 'Price', type: 'money' }, { name: 'min_stock', label: 'Minimum Stock', type: 'number' },
      { name: 'vat', label: 'VAT (%)', type: 'number' }, { name: 'ait', label: 'AIT (%)', type: 'number' }, { name: 'avt', label: 'AVT (%)', type: 'number' },
      { name: 'warranty_days', label: 'Warranty Days', type: 'number' }, { name: 'barcode', label: 'Barcode (Optional)' }, { name: 'tags', label: 'Tags', placeholder: 'e.g. espresso, 2-group' },
      { name: 'image', label: 'Image', type: 'image', span: 3 },
      { name: 'description', label: 'Description', type: 'textarea', span: 3 },
    ],
    columns: [
      { key: 'image', label: '', type: 'image', width: '48px' }, { key: 'name', label: 'Product' }, { key: 'code', label: 'Code' }, { key: 'category', label: 'Category' },
      { key: 'brand', label: 'Brand' }, { key: 'model', label: 'Model' }, { key: 'stock', label: 'Stock', type: 'number' }, { key: 'cost', label: 'Cost', type: 'money' },
      { key: 'price', label: 'Price', type: 'money' }, { key: 'status', label: 'Status', type: 'badge' },
    ],
    select: `SELECT t.*, c.name category, s.name subcategory, b.name brand, pa.name parent, u.name unit,
               (SELECT COALESCE(SUM(qty),0) FROM stock_moves WHERE product_id = t.id) stock
             FROM products t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN subcategories s ON s.id = t.subcategory_id
             LEFT JOIN brands b ON b.id = t.brand_id LEFT JOIN product_parents pa ON pa.id = t.parent_id LEFT JOIN units u ON u.id = t.unit_id`,
    search: ['t.name', 't.code', 't.model', 't.barcode', 't.tags'],
    filters: [
      { name: 'parent_id', label: 'Parent', type: 'ref', ref: 'parent' }, { name: 'category_id', label: 'Category', type: 'ref', ref: 'category' },
      { name: 'subcategory_id', label: 'Sub-Category', type: 'ref', ref: 'subcategory' }, { name: 'brand_id', label: 'Brand', type: 'ref', ref: 'brand' },
      { name: 'status', label: 'Status', type: 'select', options: STATUS },
    ],
  },

  // ───────── Service ─────────
  service: {
    key: 'service', table: 'services', label: 'Service Item', plural: 'Service Items', module: 'service',
    fields: [
      { name: 'name', label: 'Name', required: true, span: 2 }, { name: 'code', label: 'Code', auto: true },
      { name: 'category_id', label: 'Category', type: 'ref', ref: 'category' }, { name: 'subcategory_id', label: 'Sub-Category', type: 'ref', ref: 'subcategory', dependsOn: 'category_id' },
      { name: 'status', label: 'Status', type: 'select', options: STATUS, default: 'active' },
      { name: 'cost', label: 'Cost', type: 'money' }, { name: 'price', label: 'Price', type: 'money' },
      { name: 'description', label: 'Description', type: 'textarea', span: 3 },
    ],
    columns: [{ key: 'name', label: 'Name' }, { key: 'code', label: 'Code' }, { key: 'category', label: 'Category' }, { key: 'cost', label: 'Cost', type: 'money' }, { key: 'price', label: 'Price', type: 'money' }, { key: 'description', label: 'Description' }, { key: 'status', label: 'Status', type: 'badge' }],
    select: `SELECT t.*, c.name category FROM services t LEFT JOIN categories c ON c.id = t.category_id`, search: ['t.name', 't.code'],
  },

  // ───────── Daily process ─────────
  expense_head: {
    key: 'expense_head', table: 'ledgers', label: 'Expense Head', plural: 'Expense Heads', module: 'daily',
    fields: [
      { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Electric Bill', span: 2 }, { name: 'bname', label: 'Name (Bangla)', placeholder: 'e.g. বিদ্যুৎ বিল' },
      { name: 'subgroup_id', label: 'Expense Type', type: 'ref', ref: 'expense_type', required: true },
      { name: 'description', label: 'Description', type: 'textarea', span: 3 },
    ],
    columns: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'bname', label: 'Bangla' }, { key: 'type', label: 'Type' }, { key: 'total', label: 'Spent (all time)', type: 'money' }, { key: 'description', label: 'Description' }],
    select: `SELECT t.*, s.name type, (SELECT COALESCE(SUM(debit-credit),0) FROM journal_lines WHERE ledger_id = t.id) total FROM ledgers t LEFT JOIN acc_subgroups s ON s.id = t.subgroup_id`,
    where: `t.kind = 'expense'`, search: ['t.name', 't.code', 't.bname'], orderBy: 't.name',
  },

  // ───────── Enquiry setup ─────────
  enquiry_source: { key: 'enquiry_source', table: 'enquiry_sources', label: 'Source of Enquiry', plural: 'Sources of Enquiry', module: 'enquiry', fields: [{ name: 'name', label: 'Source', required: true, span: 3 }], columns: [{ key: 'name', label: 'Source of Enquiry' }], search: ['t.name'] },
  enquiry_type: { key: 'enquiry_type', table: 'enquiry_types', label: 'Type of Enquiry', plural: 'Types of Enquiry', module: 'enquiry', fields: [{ name: 'name', label: 'Type', required: true, span: 3 }], columns: [{ key: 'name', label: 'Type of Enquiry' }], search: ['t.name'] },
  enquiry_action: { key: 'enquiry_action', table: 'enquiry_actions', label: 'Course of Action', plural: 'Courses of Action', module: 'enquiry', fields: [{ name: 'name', label: 'Course of Action', required: true, span: 3 }], columns: [{ key: 'name', label: 'Course of Action' }], search: ['t.name'] },

  // ───────── Warranty ─────────
  service_center: {
    key: 'service_center', table: 'service_centers', label: 'Service Center', plural: 'Service Centers', module: 'warranty',
    fields: [{ name: 'name', label: 'Name', required: true, span: 2 }, { name: 'status', label: 'Status', type: 'select', options: STATUS, default: 'active' }, { name: 'contact', label: 'Contact', span: 3 }, { name: 'address', label: 'Address', type: 'textarea', span: 3 }],
    columns: [{ key: 'name', label: 'Name' }, { key: 'contact', label: 'Contact' }, { key: 'address', label: 'Address' }, { key: 'status', label: 'Status', type: 'badge' }],
    search: ['t.name', 't.contact'],
  },

  // ───────── Inventory ─────────
  warehouse: {
    key: 'warehouse', table: 'warehouses', label: 'Warehouse', plural: 'Warehouses', module: 'inventory',
    fields: [
      { name: 'name', label: 'Name', required: true }, { name: 'bname', label: 'Name (Bangla)' }, { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'email', label: 'Email', type: 'email', span: 3 }, { name: 'address', label: 'Address (English)', type: 'textarea', span: 3 }, { name: 'baddress', label: 'Address (Bangla)', type: 'textarea', span: 3 },
    ],
    columns: [{ key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' }, { key: 'stock', label: 'Items in stock', type: 'number' }],
    select: `SELECT t.*, (SELECT COALESCE(SUM(qty),0) FROM stock_moves WHERE loc_type = 'W' AND loc_id = t.id) stock FROM warehouses t`, search: ['t.name'],
  },
  branch: {
    key: 'branch', table: 'branches', label: 'Branch', plural: 'Branches', module: 'setting',
    fields: [{ name: 'name', label: 'Name', required: true, span: 2 }, { name: 'status', label: 'Status', type: 'select', options: STATUS, default: 'active' }, { name: 'phone', label: 'Phone', type: 'tel' }, { name: 'email', label: 'Email', type: 'email', span: 2 }, { name: 'address', label: 'Address', type: 'textarea', span: 3 }],
    columns: [{ key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' }, { key: 'status', label: 'Status', type: 'badge' }],
    search: ['t.name'], noDelete: false,
  },

  // ───────── Offers ─────────
  offer: {
    key: 'offer', table: 'offers', label: 'Coupon / Offer', plural: 'Coupons & Offers', module: 'offer',
    fields: [
      { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Summer Offer', span: 2 }, { name: 'code', label: 'Coupon Code', placeholder: 'Optional, e.g. SUMMER10' },
      { name: 'percent', label: 'Percent (%)', type: 'number' }, { name: 'fixed', label: 'Fixed Amount', type: 'money' },
      { name: 'effect_on', label: 'Effect On', type: 'select', default: 'self', options: [{ value: 'supplier', label: 'Supplier (rebate claimable)' }, { value: 'self', label: 'Self' }] },
      { name: 'start_date', label: 'Offer Start', type: 'date' }, { name: 'end_date', label: 'Offer End', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: STATUS, default: 'active' },
      { name: 'description', label: 'Description', type: 'textarea', span: 3 },
    ],
    columns: [{ key: 'name', label: 'Name' }, { key: 'code', label: 'Coupon' }, { key: 'percent', label: 'Percent (%)', type: 'number' }, { key: 'fixed', label: 'Amount', type: 'money' }, { key: 'duration', label: 'Duration' }, { key: 'effect_on', label: 'Effect On', type: 'badge' }, { key: 'items', label: 'Items', type: 'number' }, { key: 'status', label: 'Status', type: 'badge' }],
    select: `SELECT t.*, COALESCE(t.start_date,'') || ' → ' || COALESCE(t.end_date,'') duration, (SELECT COUNT(*) FROM offer_items WHERE offer_id = t.id) items FROM offers t`,
    search: ['t.name', 't.code'],
  },

  // ───────── Accounts setup ─────────
  acc_class: {
    key: 'acc_class', table: 'acc_classes', label: 'Account Class', plural: 'Account Classes', module: 'account', readOnly: true,
    fields: [{ name: 'name', label: 'Name' }, { name: 'description', label: 'Description', type: 'textarea' }],
    columns: [{ key: 'name', label: 'Name' }, { key: 'nature', label: 'Normal Balance', type: 'badge' }, { key: 'groups', label: 'Groups', type: 'number' }, { key: 'description', label: 'Description' }],
    select: `SELECT t.*, (SELECT COUNT(*) FROM acc_groups WHERE class_id = t.id) groups FROM acc_classes t`, search: ['t.name'], orderBy: 't.id',
  },
  acc_group: {
    key: 'acc_group', table: 'acc_groups', label: 'Account Group', plural: 'Account Groups', module: 'account',
    fields: [{ name: 'name', label: 'Name', required: true, placeholder: 'e.g. Current Assets', span: 2 }, { name: 'class_id', label: 'Class', type: 'ref', ref: 'acc_class', required: true }, { name: 'description', label: 'Description', type: 'textarea', span: 3 }],
    columns: [{ key: 'name', label: 'Name' }, { key: 'class', label: 'Class' }, { key: 'description', label: 'Description' }],
    select: `SELECT t.*, c.name class FROM acc_groups t LEFT JOIN acc_classes c ON c.id = t.class_id`, search: ['t.name'], orderBy: 't.class_id, t.id',
  },
  acc_subgroup: {
    key: 'acc_subgroup', table: 'acc_subgroups', label: 'Account Sub-Group', plural: 'Account Sub-Groups', module: 'account',
    fields: [{ name: 'name', label: 'Name', required: true, placeholder: 'e.g. Cash At Hand', span: 2 }, { name: 'group_id', label: 'Group', type: 'ref', ref: 'acc_group', required: true }, { name: 'description', label: 'Description', type: 'textarea', span: 3 }],
    columns: [{ key: 'name', label: 'Name' }, { key: 'group', label: 'Group' }, { key: 'class', label: 'Class' }, { key: 'description', label: 'Description' }],
    select: `SELECT t.*, g.name "group", c.name class FROM acc_subgroups t LEFT JOIN acc_groups g ON g.id = t.group_id LEFT JOIN acc_classes c ON c.id = g.class_id`,
    search: ['t.name', 'g.name'], orderBy: 'g.class_id, g.id, t.name', filters: [{ name: 'group_id', label: 'Group', type: 'ref', ref: 'acc_group' }],
  },
  ledger: {
    key: 'ledger', table: 'ledgers', label: 'Ledger', plural: 'Ledgers', module: 'account', statement: true,
    fields: [
      { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Petty Cash', span: 2 }, { name: 'code', label: 'Code', auto: true },
      { name: 'group_id', label: 'Group', type: 'ref', ref: 'acc_group', hidden: true },
      { name: 'subgroup_id', label: 'Sub-Group', type: 'ref', ref: 'acc_subgroup', required: true, span: 3 },
      { name: 'description', label: 'Description', type: 'textarea', span: 3 },
    ],
    columns: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'group', label: 'Group' }, { key: 'subgroup', label: 'Sub-Group' }, { key: 'kind', label: 'Type', type: 'badge' }, { key: 'balance', label: 'Balance (Dr−Cr)', type: 'money' }],
    select: `SELECT t.*, s.name subgroup, g.name "group", (SELECT COALESCE(SUM(debit-credit),0) FROM journal_lines WHERE ledger_id = t.id) balance
             FROM ledgers t LEFT JOIN acc_subgroups s ON s.id = t.subgroup_id LEFT JOIN acc_groups g ON g.id = s.group_id`,
    search: ['t.name', 't.code'], orderBy: 'g.class_id, s.id, t.name',
    filters: [{ name: 'subgroup_id', label: 'Sub-Group', type: 'ref', ref: 'acc_subgroup' }, { name: 'kind', label: 'Type', type: 'select', options: ['general', 'cash', 'bank', 'mobile', 'customer', 'supplier', 'expense', 'loan', 'employee'].map(k => ({ value: k, label: k })) }],
  },

  // ───────── Bank & mobile ─────────
  bank: {
    key: 'bank', table: 'banks', label: 'Bank', plural: 'Banks', module: 'bank',
    fields: [{ name: 'name', label: 'Bank Name', required: true, span: 2 }, { name: 'sort', label: 'Short Name', placeholder: 'e.g. EBL' }],
    columns: [{ key: 'name', label: 'Name' }, { key: 'sort', label: 'Short Name' }, { key: 'accounts', label: 'Accounts', type: 'number' }],
    select: `SELECT t.*, (SELECT COUNT(*) FROM bank_accounts WHERE bank_id = t.id) accounts FROM banks t`, search: ['t.name', 't.sort'],
  },
  bank_account: {
    key: 'bank_account', table: 'bank_accounts', label: 'Bank Account', plural: 'Bank Accounts', module: 'bank', statement: true,
    fields: [
      { name: 'acno', label: 'Account No', required: true }, { name: 'title', label: 'Account Title', span: 2 }, { name: 'bank_id', label: 'Bank', type: 'ref', ref: 'bank', required: true },
      { name: 'branch', label: 'Branch Name' }, { name: 'code', label: 'Branch Code' }, { name: 'routno', label: 'Routing No' }, { name: 'location', label: 'Branch Location', span: 2 },
      { name: 'opening_balance', label: 'Opening Balance', type: 'money', createOnly: true },
    ],
    columns: [{ key: 'bank', label: 'Bank' }, { key: 'acno', label: 'A/C No' }, { key: 'title', label: 'Title' }, { key: 'branch', label: 'Branch' }, { key: 'location', label: 'Location' }, { key: 'debit', label: 'Debit', type: 'money' }, { key: 'credit', label: 'Credit', type: 'money' }, { key: 'balance', label: 'Balance', type: 'money' }],
    select: `SELECT t.*, b.name bank, (SELECT COALESCE(SUM(debit),0) FROM journal_lines WHERE ledger_id = t.ledger_id) debit,
               (SELECT COALESCE(SUM(credit),0) FROM journal_lines WHERE ledger_id = t.ledger_id) credit,
               (SELECT COALESCE(SUM(debit-credit),0) FROM journal_lines WHERE ledger_id = t.ledger_id) balance
             FROM bank_accounts t LEFT JOIN banks b ON b.id = t.bank_id`,
    search: ['t.acno', 't.title', 'b.name'],
  },
  mobile_account: {
    key: 'mobile_account', table: 'mobile_accounts', label: 'Mobile Account', plural: 'Mobile Accounts', module: 'bank', statement: true,
    fields: [{ name: 'name', label: 'Name', required: true, placeholder: 'e.g. bKash (Official)', span: 2 }, { name: 'number', label: 'Number', type: 'tel' }, { name: 'opening_balance', label: 'Opening Balance', type: 'money', createOnly: true }],
    columns: [{ key: 'name', label: 'Name' }, { key: 'number', label: 'Number' }, { key: 'debit', label: 'Deposit', type: 'money' }, { key: 'credit', label: 'Withdrawn', type: 'money' }, { key: 'balance', label: 'Balance', type: 'money' }],
    select: `SELECT t.*, (SELECT COALESCE(SUM(debit),0) FROM journal_lines WHERE ledger_id = t.ledger_id) debit,
               (SELECT COALESCE(SUM(credit),0) FROM journal_lines WHERE ledger_id = t.ledger_id) credit,
               (SELECT COALESCE(SUM(debit-credit),0) FROM journal_lines WHERE ledger_id = t.ledger_id) balance FROM mobile_accounts t`,
    search: ['t.name', 't.number'],
  },
  loan_account: {
    key: 'loan_account', table: 'loan_accounts', label: 'Loan Account', plural: 'Loan Accounts', module: 'loan', statement: true,
    fields: [
      { name: 'code', label: 'Loan ID', auto: true }, { name: 'name', label: 'Name', required: true, span: 2 }, { name: 'number', label: 'Number / Contact' },
      { name: 'type', label: 'Type', type: 'select', default: 'taken', options: [{ value: 'taken', label: 'Loan Taken (liability)' }, { value: 'given', label: 'Loan Given (asset)' }] },
      { name: 'opening_balance', label: 'Opening Balance', type: 'money', createOnly: true },
    ],
    columns: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'number', label: 'Number' }, { key: 'type', label: 'Type', type: 'badge' }, { key: 'debit', label: 'Debit', type: 'money' }, { key: 'credit', label: 'Credit', type: 'money' }, { key: 'balance', label: 'Balance', type: 'money' }],
    select: `SELECT t.*, (SELECT COALESCE(SUM(debit),0) FROM journal_lines WHERE ledger_id = t.ledger_id) debit,
               (SELECT COALESCE(SUM(credit),0) FROM journal_lines WHERE ledger_id = t.ledger_id) credit,
               (SELECT ABS(COALESCE(SUM(debit-credit),0)) FROM journal_lines WHERE ledger_id = t.ledger_id) balance FROM loan_accounts t`,
    search: ['t.name', 't.code', 't.number'],
  },

  // ───────── Payroll ─────────
  department: { key: 'department', table: 'departments', label: 'Department', plural: 'Departments', module: 'payroll', fields: nameDesc('e.g. Security'), columns: nameDescCols, search: ['t.name'] },
  designation: { key: 'designation', table: 'designations', label: 'Designation', plural: 'Designations', module: 'payroll', fields: nameDesc('e.g. Manager'), columns: nameDescCols, search: ['t.name'] },
  employee: {
    key: 'employee', table: 'employees', label: 'Employee', plural: 'Employees', module: 'payroll', statement: true,
    fields: [
      { name: 'name', label: 'Name', required: true, span: 2 }, { name: 'code', label: 'ID No', auto: true },
      { name: 'department_id', label: 'Department', type: 'ref', ref: 'department' }, { name: 'designation_id', label: 'Designation', type: 'ref', ref: 'designation' },
      { name: 'branch_id', label: 'Branch', type: 'ref', ref: 'branch' },
      { name: 'fname', label: 'Father Name' }, { name: 'mname', label: 'Mother Name' }, { name: 'nid', label: 'NID No' },
      { name: 'mobile', label: 'Mobile', type: 'tel' }, { name: 'phone', label: 'Phone', type: 'tel' }, { name: 'email', label: 'Email', type: 'email' },
      { name: 'dob', label: 'Date of Birth', type: 'date' }, { name: 'joining', label: 'Joining Date', type: 'date' }, { name: 'salary', label: 'Salary', type: 'money' },
      { name: 'commission_pct', label: 'Sales Commission (%)', type: 'number' }, { name: 'vat_signatory', label: 'VAT Signatory', type: 'select', options: YESNO, default: 0 },
      { name: 'status', label: 'Status', type: 'select', options: STATUS, default: 'active' },
      { name: 'image', label: 'Image', type: 'image', span: 3 },
      { name: 'address', label: 'Residential Address', type: 'textarea', span: 3 }, { name: 'paddress', label: 'Permanent Address', type: 'textarea', span: 3 },
    ],
    columns: [{ key: 'image', label: '', type: 'image', width: '48px' }, { key: 'code', label: 'ID No' }, { key: 'name', label: 'Name' }, { key: 'designation', label: 'Designation' }, { key: 'department', label: 'Department' }, { key: 'branch', label: 'Work Place' }, { key: 'mobile', label: 'Mobile' }, { key: 'salary', label: 'Salary', type: 'money' }, { key: 'status', label: 'Status', type: 'badge' }],
    select: `SELECT t.*, d.name department, g.name designation, b.name branch FROM employees t LEFT JOIN departments d ON d.id = t.department_id
             LEFT JOIN designations g ON g.id = t.designation_id LEFT JOIN branches b ON b.id = t.branch_id`,
    search: ['t.name', 't.code', 't.mobile'],
    filters: [{ name: 'department_id', label: 'Department', type: 'ref', ref: 'department' }, { name: 'designation_id', label: 'Designation', type: 'ref', ref: 'designation' }],
  },
  leave_type: {
    key: 'leave_type', table: 'leave_types', label: 'Leave Type', plural: 'Leave Types', module: 'payroll',
    fields: [{ name: 'name', label: 'Name', required: true, placeholder: 'e.g. Casual Leave' }, { name: 'days', label: 'Days', type: 'number' }, { name: 'status', label: 'Status', type: 'select', options: STATUS, default: 'active' }, { name: 'description', label: 'Description', type: 'textarea', span: 3 }],
    columns: [{ key: 'name', label: 'Name' }, { key: 'days', label: 'Days', type: 'number' }, { key: 'description', label: 'Description' }, { key: 'status', label: 'Status', type: 'badge' }],
    search: ['t.name'],
  },
  leave_app: {
    key: 'leave_app', table: 'leave_apps', label: 'Leave Application', plural: 'Leave Records', module: 'payroll',
    fields: [
      { name: 'employee_id', label: 'Employee', type: 'ref', ref: 'employee', required: true, span: 2 }, { name: 'leave_type_id', label: 'Leave Type', type: 'ref', ref: 'leave_type', required: true },
      { name: 'apply_date', label: 'Apply Date', type: 'date' }, { name: 'from_date', label: 'Leave From', type: 'date', required: true }, { name: 'to_date', label: 'Leave To', type: 'date', required: true },
      { name: 'status', label: 'Status', type: 'select', default: 'pending', options: [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Disapproved' }] },
      { name: 'reason', label: 'Reason', type: 'textarea', span: 3 }, { name: 'note', label: 'Note', type: 'textarea', span: 3 },
    ],
    columns: [{ key: 'apply_date', label: 'Date', type: 'date' }, { key: 'employee', label: 'Employee' }, { key: 'leave_type', label: 'Leave' }, { key: 'from_date', label: 'From', type: 'date' }, { key: 'to_date', label: 'To', type: 'date' }, { key: 'days', label: 'Days', type: 'number' }, { key: 'reason', label: 'Details' }, { key: 'status', label: 'Status', type: 'badge' }],
    select: `SELECT t.*, e.name || ' (' || COALESCE(e.code,'') || ')' employee, l.name leave_type FROM leave_apps t LEFT JOIN employees e ON e.id = t.employee_id LEFT JOIN leave_types l ON l.id = t.leave_type_id`,
    search: ['e.name', 'l.name'], orderBy: 't.id DESC',
    filters: [{ name: 'employee_id', label: 'Employee', type: 'ref', ref: 'employee' }, { name: 'status', label: 'Status', type: 'select', options: [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Disapproved' }] }],
  },
};

export function entity(key: string): Entity {
  const e = ENTITIES[key];
  if (!e) throw new Error(`Unknown entity ${key}`);
  return e;
}
