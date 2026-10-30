// Display formatting shared by every screen.
const grouping = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const groupingInt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const CURRENCY = '৳';

export function money(n: unknown, symbol = true): string {
  const v = Number(n) || 0;
  const s = grouping.format(Math.abs(v));
  return `${v < 0 ? '−' : ''}${symbol ? `${CURRENCY} ` : ''}${s}`;
}

export function num(n: unknown): string {
  return groupingInt.format(Number(n) || 0);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function date(s: unknown): string {
  if (!s) return '';
  const str = String(s);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return str;
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function dateTime(s: unknown): string {
  if (!s) return '';
  const str = String(s).replace('T', ' ');
  const m = str.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return date(str);
  const h = Number(m[2]);
  return `${date(m[1])}, ${((h + 11) % 12) + 1}:${m[3]} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthStart(): string {
  return todayISO().slice(0, 8) + '01';
}

export function relative(s: unknown): string {
  if (!s) return '';
  const t = new Date(String(s).replace(' ', 'T')).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return date(String(s).slice(0, 10));
}

/** Amount in words (Bangladeshi system: lakh, crore) for invoices. */
export function inWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ' ' + ones[x % 10] : ''}`);
  const three = (x: number) => (x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x));
  const whole = Math.floor(Math.abs(n));
  const paisa = Math.round((Math.abs(n) - whole) * 100);
  if (!whole && !paisa) return 'Zero Taka Only';
  let w = whole, out = '';
  const crore = Math.floor(w / 10000000); w %= 10000000;
  const lakh = Math.floor(w / 100000); w %= 100000;
  const thousand = Math.floor(w / 1000); w %= 1000;
  if (crore) out += `${three(crore)} Crore `;
  if (lakh) out += `${two(lakh)} Lakh `;
  if (thousand) out += `${two(thousand)} Thousand `;
  if (w) out += three(w);
  return `${out.trim()} Taka${paisa ? ` and ${two(paisa)} Paisa` : ''} Only`;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { cur.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cur.push(field); field = '';
      if (cur.some(x => x !== '')) rows.push(cur);
      cur = [];
    } else field += c;
  }
  cur.push(field);
  if (cur.some(x => x !== '')) rows.push(cur);
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map(h => h.replace(/^﻿/, '').trim());
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export const KIND_LABEL: Record<string, string> = {
  sale: 'Sale', estimate: 'Estimate', sreturn: 'Sales return', porder: 'Purchase order', purchase: 'Purchase', preturn: 'Purchase return',
  service: 'Service', sestimate: 'Service estimate', payment: 'Payment', receipt: 'Receipt', journal: 'Journal', contra: 'Transfer',
  expense: 'Expense', donation: 'Donation', opening: 'Opening', salary: 'Salary', disposal: 'Disposal', bad_claim: 'Supplier claim',
  self_bad: 'Bad stock', warranty: 'Warranty', rebate: 'Rebate', adjust: 'Adjustment', cheque_bounce: 'Cheque bounce',
};
