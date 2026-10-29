// Document math shared by the editor (live preview) and the server (authoritative totals).

export type CalcLine = { qty: number; rate: number; disc_pct?: number; disc?: number; vat_pct?: number };
export type CalcFooter = {
  discount_pct?: number; discount?: number; vat_pct?: number; ait_pct?: number; other?: number; freight?: number;
  redeem?: number; less?: number; exchange?: number;
};

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const n = (v: unknown) => Number(v) || 0;

export function lineCalc(l: CalcLine) {
  const gross = r2(n(l.qty) * n(l.rate));
  const disc = r2((gross * n(l.disc_pct)) / 100 + n(l.disc));
  const vat = r2(((gross - disc) * n(l.vat_pct)) / 100);
  return { gross, disc, vat, net: r2(gross - disc), subtotal: r2(gross - disc + vat) };
}

export function docCalc(lines: CalcLine[], f: CalcFooter) {
  let gross = 0, itemDiscount = 0, itemVat = 0;
  for (const l of lines) {
    const c = lineCalc(l);
    gross += c.gross; itemDiscount += c.disc; itemVat += c.vat;
  }
  gross = r2(gross); itemDiscount = r2(itemDiscount); itemVat = r2(itemVat);
  const base = r2(gross - itemDiscount);
  const discount = n(f.discount_pct) ? r2((base * n(f.discount_pct)) / 100) : r2(n(f.discount));
  const taxable = r2(base - discount);
  const vat = r2(itemVat + (taxable * n(f.vat_pct)) / 100);
  const ait = r2((taxable * n(f.ait_pct)) / 100);
  const total = r2(taxable + vat + ait + n(f.other) + n(f.freight) - n(f.redeem) - n(f.less) - n(f.exchange));
  return { gross, itemDiscount, itemVat, base, discount, taxable, vat, ait, other: r2(n(f.other)), freight: r2(n(f.freight)), redeem: r2(n(f.redeem)), less: r2(n(f.less)), exchange: r2(n(f.exchange)), total };
}

export type DocKind = 'sale' | 'estimate' | 'sreturn' | 'porder' | 'purchase' | 'preturn' | 'service' | 'sestimate';

export const DOC_META: Record<DocKind, {
  label: string; plural: string; module: string; party: 'customer' | 'supplier'; items: 'product' | 'service'; rate: 'price' | 'cost';
  payments: boolean; posts: boolean; stock: 0 | 1 | -1; listPath: string; newPath: string;
}> = {
  sale: { label: 'Sales Invoice', plural: 'Sales Invoices', module: 'sales', party: 'customer', items: 'product', rate: 'price', payments: true, posts: true, stock: -1, listPath: '', newPath: '' },
  estimate: { label: 'Sales Estimate', plural: 'Sales Estimates', module: 'sales', party: 'customer', items: 'product', rate: 'price', payments: false, posts: false, stock: 0, listPath: '', newPath: '' },
  sreturn: { label: 'Sales Return', plural: 'Sales Returns', module: 'sales', party: 'customer', items: 'product', rate: 'price', payments: true, posts: true, stock: 1, listPath: '', newPath: '' },
  porder: { label: 'Purchase Order', plural: 'Purchase Orders', module: 'purchase', party: 'supplier', items: 'product', rate: 'cost', payments: false, posts: false, stock: 0, listPath: '', newPath: '' },
  purchase: { label: 'Purchase Invoice', plural: 'Purchase Invoices', module: 'purchase', party: 'supplier', items: 'product', rate: 'cost', payments: true, posts: true, stock: 1, listPath: '', newPath: '' },
  preturn: { label: 'Purchase Return', plural: 'Purchase Returns', module: 'purchase', party: 'supplier', items: 'product', rate: 'cost', payments: true, posts: true, stock: -1, listPath: '', newPath: '' },
  service: { label: 'Service Invoice', plural: 'Service Invoices', module: 'service', party: 'customer', items: 'service', rate: 'price', payments: true, posts: true, stock: 0, listPath: '', newPath: '' },
  sestimate: { label: 'Service Estimate', plural: 'Service Estimates', module: 'service', party: 'customer', items: 'service', rate: 'price', payments: false, posts: false, stock: 0, listPath: '', newPath: '' },
};

for (const k of Object.keys(DOC_META) as DocKind[]) {
  DOC_META[k].listPath = `/doc/${k}`;
  DOC_META[k].newPath = `/doc/${k}/new`;
}
