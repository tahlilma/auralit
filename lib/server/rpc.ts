import 'server-only';
import * as crud from './api/crud';
import * as docs from './api/docs';
import * as vouchers from './api/vouchers';
import * as stock from './api/stock';
import * as ops from './api/ops';
import * as payroll from './api/payroll';
import * as finance from './api/finance';
import * as reports from './api/reports';
import * as admin from './api/admin';

const modules = { crud, docs, vouchers, stock, ops, payroll, finance, reports, admin };
export type ApiModules = typeof modules;

export function resolve(name: string): ((...args: any[]) => any) | null {
  const [ns, fn] = name.split('.');
  const mod = (modules as Record<string, Record<string, unknown>>)[ns];
  const f = mod?.[fn];
  return typeof f === 'function' ? (f as (...args: any[]) => any) : null;
}
