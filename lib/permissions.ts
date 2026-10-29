// Permission modules mirror the original role matrix (read / write / edit / delete / print per module).
export const ACTIONS = ['read', 'write', 'edit', 'delete', 'print'] as const;
export type Action = (typeof ACTIONS)[number];

export const ALL_MODULES = [
  { key: 'daily', label: 'Daily Process' },
  { key: 'enquiry', label: 'Customer Enquiry' },
  { key: 'purchase', label: 'Purchase' },
  { key: 'sales', label: 'Sales' },
  { key: 'service', label: 'Service' },
  { key: 'warranty', label: 'Warranty Management' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'client', label: 'Client Setup' },
  { key: 'product', label: 'Product Setup' },
  { key: 'offer', label: 'Set Offer & Rebate' },
  { key: 'master', label: 'Master Setup' },
  { key: 'account', label: 'Accounts Setup' },
  { key: 'acctra', label: 'Accounts Transaction' },
  { key: 'loan', label: 'Installment & Loan' },
  { key: 'financial', label: 'Finance Record' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'bank', label: 'Bank & Mobile' },
  { key: 'personal', label: 'Personal' },
  { key: 'user', label: 'User & Role' },
  { key: 'report', label: 'Report' },
  { key: 'setting', label: 'Company & Setting' },
] as const;

export type ModuleKey = (typeof ALL_MODULES)[number]['key'];
export type Perms = Partial<Record<string, Partial<Record<Action, boolean>>>>;

export function can(perms: Perms | undefined, isAdmin: boolean, mod: string, action: Action = 'read'): boolean {
  if (isAdmin) return true;
  return !!perms?.[mod]?.[action];
}
