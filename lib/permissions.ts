// Permission modules mirror the original role matrix (read / write / edit / delete / print per module).
export const ACTIONS = ['read', 'write', 'edit', 'delete', 'print'] as const;
export type Action = (typeof ACTIONS)[number];

export const ALL_MODULES = [
  { key: 'daily', label: 'Daily process' },
  { key: 'enquiry', label: 'Customer enquiry' },
  { key: 'purchase', label: 'Purchase' },
  { key: 'sales', label: 'Sales' },
  { key: 'service', label: 'Service' },
  { key: 'warranty', label: 'Warranty management' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'client', label: 'Client setup' },
  { key: 'product', label: 'Product setup' },
  { key: 'offer', label: 'Set offer & rebate' },
  { key: 'master', label: 'Master setup' },
  { key: 'account', label: 'Accounts setup' },
  { key: 'acctra', label: 'Accounts transaction' },
  { key: 'loan', label: 'Installment & loan' },
  { key: 'financial', label: 'Finance record' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'bank', label: 'Bank & mobile' },
  { key: 'personal', label: 'Personal' },
  { key: 'user', label: 'User & role' },
  { key: 'report', label: 'Report' },
  { key: 'setting', label: 'Company & setting' },
] as const;

export type ModuleKey = (typeof ALL_MODULES)[number]['key'];
export type Perms = Partial<Record<string, Partial<Record<Action, boolean>>>>;

export function can(perms: Perms | undefined, isAdmin: boolean, mod: string, action: Action = 'read'): boolean {
  if (isAdmin) return true;
  return !!perms?.[mod]?.[action];
}
