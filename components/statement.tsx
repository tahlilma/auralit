'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Download, Printer } from 'lucide-react';
import { useRpc } from '@/lib/client/rpc';
import { date, downloadCsv, KIND_LABEL, money } from '@/lib/format';
import { Button, ErrorBox, Loading, Money } from '@/components/ui/primitives';
import { DataTable, DateRange } from '@/components/ui/table';

export function journalHref(r: { type: string; ref_type?: string | null; ref_id?: number | null; journal_id: number }) {
  if (r.ref_type === 'doc' && r.ref_id) return `/doc/${r.type}/${r.ref_id}`;
  if (r.ref_type === 'stock' && r.ref_id) return `/stock/${r.type}/${r.ref_id}`;
  if (['payment', 'receipt', 'journal', 'contra', 'expense', 'donation'].includes(r.type)) return `/vouchers/${r.type}/${r.journal_id}`;
  return null;
}

export function LedgerStatement({ ledgerId, title, compact }: { ledgerId: number; title?: string; compact?: boolean }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, error, loading, reload } = useRpc('finance.ledgerStatement', [ledgerId, from || undefined, to || undefined], [ledgerId, from, to]);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const rows = [{ journal_id: 0, date: from || '', no: '', type: 'opening', against: 'Opening balance', narration: '', debit: 0, credit: 0, balance: data.opening }, ...data.lines];
  return (
    <div className="print-area">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{title ?? data.ledger.name}</p>
          <p className="text-xs text-muted">{data.ledger.code} · {data.ledger.group_name} › {data.ledger.subgroup}</p>
        </div>
        <div className="no-print flex items-center gap-2">
          <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
          <Button size="sm" icon={<Download className="size-4" />} onClick={() => downloadCsv(`statement-${data.ledger.name}`, ['Date', 'No', 'Type', 'Particulars', 'Details', 'Debit', 'Credit', 'Balance'], rows.map(r => [r.date, r.no, r.type, r.against, r.narration, r.debit, r.credit, r.balance]))}>CSV</Button>
          {!compact && <Button size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>}
        </div>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['Opening', data.opening], ['Debit', data.totals.debit], ['Credit', data.totals.credit], ['Closing', data.totals.closing]].map(([k, v]) => (
          <div key={k as string} className="rounded-lg border border-line bg-surface-2 px-3 py-2"><p className="text-xs text-muted">{k}</p><p className="num font-semibold">{money(v)}</p></div>
        ))}
      </div>
      <div className="rounded-xl border border-line">
        <DataTable dense loading={loading} rows={rows} rowKey="__k" columns={[
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'no', label: 'No', render: r => { const h = r.journal_id ? journalHref(r as any) : null; return h ? <Link href={h} className="font-medium text-brand hover:underline">{r.no}</Link> : r.no; } },
          { key: 'type', label: 'Type', render: r => <span className="text-xs text-muted">{KIND_LABEL[r.type] ?? r.type}</span> },
          { key: 'against', label: 'Particulars', render: r => <span className="text-[13px]">{r.against}{r.narration && <span className="block text-xs text-muted">{r.narration}</span>}</span> },
          { key: 'debit', label: 'Debit', type: 'money' },
          { key: 'credit', label: 'Credit', type: 'money' },
          { key: 'balance', label: 'Balance', align: 'right', render: r => <Money value={r.balance} symbol={false} className="font-medium" /> },
        ]} totals={{ debit: data.totals.debit, credit: data.totals.credit }} />
      </div>
      <p className="mt-2 text-right text-xs text-muted">Statement as of {date(to || new Date().toISOString())}</p>
    </div>
  );
}
