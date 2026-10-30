'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, CheckCircle2, Download, Eye, History, Pencil, Plus, Printer, Trash2, Undo2 } from 'lucide-react';
import { DOC_META, type DocKind } from '@/lib/calc';
import { rpc, useRpc } from '@/lib/client/rpc';
import { dateTime, downloadCsv, money, monthStart, num, todayISO } from '@/lib/format';
import { Badge, Button, ErrorBox, Id, Money, PageHeader, Tabs } from '@/components/ui/primitives';
import { DataTable, DateRange, Pager, RowMenu, SearchInput, type Col } from '@/components/ui/table';
import { useUI } from '@/components/ui/overlay';
import { HistoryDrawer } from '@/components/history';
import { Guard, useSession } from '@/components/shell/session';

export function DocList({ kind }: { kind: DocKind }) {
  return <Guard module={DOC_META[kind].module}><List kind={kind} /></Guard>;
}

function List({ kind }: { kind: DocKind }) {
  const m = DOC_META[kind];
  const router = useRouter();
  const { can } = useSession();
  const { toast, confirm } = useUI();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(kind === 'sale' || kind === 'service' ? monthStart() : '');
  const [to, setTo] = useState(kind === 'sale' || kind === 'service' ? todayISO() : '');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [historyOpen, setHistoryOpen] = useState(false);
  const args = useMemo(() => ({ q, from, to, page, size, status: status || undefined }), [q, from, to, page, size, status]);
  const { data, loading, error, reload } = useRpc('docs.listDocs', [kind, args], [kind, JSON.stringify(args)]);
  const isEst = kind === 'estimate' || kind === 'sestimate' || kind === 'porder';
  const isRet = kind === 'sreturn' || kind === 'preturn';
  const partyLabel = m.party === 'customer' ? 'Customer' : 'Supplier';
  const noun = m.label.toLowerCase();

  const del = async (r: any) => {
    if (!(await confirm({ title: `Delete ${r.no}?`, body: 'Stock, serial numbers and accounting entries created by this document are reversed.', confirm: 'Delete', danger: true }))) return;
    try { await rpc('docs.deleteDoc', r.id); toast(`${r.no} deleted`); reload(); } catch (e: any) { toast(e.message, 'error'); }
  };
  const approve = async (r: any) => { try { await rpc('docs.setDocStatus', r.id, { approved: !r.approved }); reload(); } catch (e: any) { toast(e.message, 'error'); } };
  const convertTo = kind === 'estimate' ? 'sale' : kind === 'sestimate' ? 'service' : kind === 'porder' ? 'purchase' : null;
  const exportCsv = async () => {
    const all = await rpc('docs.listDocs', kind, { ...args, page: 1, size: 5000 });
    downloadCsv(`${m.plural}-${from || 'all'}-${to || 'all'}`, ['No', 'Date', partyLabel, 'Mobile', 'Total', 'Paid', 'Due', 'Note', 'Created by', 'Created at'],
      all.rows.map((r: any) => [r.no, r.date, r.party, r.mobile, r.total, r.paid, r.due, r.note, r.created_by_name, r.created_at]));
  };

  const cols: Col[] = [
    { key: 'no', label: isEst ? 'Number' : isRet ? 'Return' : 'Invoice', render: r => <Link href={`/doc/${kind}/${r.id}`} className="text-ink hover:underline" onClick={e => e.stopPropagation()}><Id>{r.no}</Id></Link> },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'party', label: partyLabel, render: r => <div className="min-w-0 max-w-[260px]"><p className="truncate text-ink">{r.party ?? '—'}</p><p className="truncate text-[12.5px] text-muted">{[r.mobile, r.party_code].filter(Boolean).join(' · ')}</p></div> },
    ...(isRet ? [{ key: 'ref_no', label: 'Against', render: (r: any) => r.ref_no ? <Id className="text-muted">{r.ref_no}</Id> : '—' } as Col] : []),
    { key: 'total', label: 'Total', type: 'money' },
    ...(m.payments && !isRet ? [
      { key: 'paid', label: 'Paid', type: 'money' } as Col,
      { key: 'due', label: 'Due', align: 'right', render: (r: any) => r.due > 0.009 ? <Money value={r.due} symbol={false} className="text-bad" /> : <span className="text-muted">Paid</span> } as Col,
    ] : []),
    ...(isRet ? [{ key: 'adjust', label: 'Adjusted', type: 'money' } as Col, { key: 'paid', label: 'Refunded', type: 'money' } as Col] : []),
    ...(kind === 'sestimate' ? [{ key: 'delivery_date', label: 'Delivery', type: 'date' } as Col] : []),
    ...(isEst ? [{ key: 'status', label: 'Status', render: (r: any) => r.status === 'invoiced' ? <Badge tone="blue">Invoiced</Badge> : <Badge tone="gray">Open</Badge> } as Col] : []),
    ...(kind === 'porder' ? [{ key: 'approved', label: 'Approval', render: (r: any) => <button onClick={e => { e.stopPropagation(); void approve(r); }} disabled={!can(m.module, 'edit')} title={r.approved ? 'Click to withdraw approval' : 'Click to approve'}>{r.approved ? <Badge tone="green">Approved</Badge> : <Badge tone="amber">Waiting</Badge>}</button> } as Col] : []),
    { key: 'created_by_name', label: 'Created by', render: r => <div className="text-[13px]"><p className="text-ink-2">{r.created_by_name ?? '—'}</p><p className="text-[12.5px] text-muted">{dateTime(r.created_at)}</p></div> },
    {
      key: '__a', label: <span className="sr-only">Actions</span>, align: 'right', width: '1%', render: r => (
        <RowMenu label={`Actions for ${r.no}`} actions={[
          { label: 'Open', icon: <Eye className="size-4" />, onClick: () => router.push(`/doc/${kind}/${r.id}`) },
          { label: kind === 'sale' ? 'Print receipt' : 'Print', icon: <Printer className="size-4" />, onClick: () => router.push(`/doc/${kind}/${r.id}?print=${kind === 'sale' ? 'pos' : 'a4'}`), hidden: !can(m.module, 'print') },
          { label: `Convert to ${convertTo ? DOC_META[convertTo as DocKind].label.toLowerCase() : ''}`, icon: <ArrowRightLeft className="size-4" />, onClick: () => router.push(`/doc/${convertTo}/new?from=${r.id}`), hidden: !convertTo || r.status === 'invoiced' || !can(DOC_META[(convertTo ?? 'sale') as DocKind].module, 'write') },
          { label: 'Make a return', icon: <Undo2 className="size-4" />, onClick: () => router.push(`/doc/${kind === 'sale' ? 'sreturn' : 'preturn'}/new?inv=${encodeURIComponent(r.no)}`), hidden: !(kind === 'sale' || kind === 'purchase') || !can(m.module, 'write') },
          { label: 'Edit', icon: <Pencil className="size-4" />, onClick: () => router.push(`/doc/${kind}/${r.id}/edit`), hidden: isRet || !can(m.module, 'edit') },
          { label: 'Delete', icon: <Trash2 className="size-4" />, onClick: () => del(r), danger: true, hidden: !can(m.module, 'delete') },
        ]} />
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={m.plural}
        actions={<>
          <RowMenu button="More" actions={[
            { label: 'Export to CSV', icon: <Download className="size-4" />, onClick: exportCsv },
            { label: 'Change history', icon: <History className="size-4" />, onClick: () => setHistoryOpen(true) },
          ]} />
          {can(m.module, 'write') && <Button variant="primary" icon={<Plus className="size-4" />} href={m.newPath}>New {kind === 'sale' ? 'sale' : noun}</Button>}
        </>} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      {isEst && <Tabs className="mb-4" value={status} onChange={v => { setStatus(v); setPage(1); }} tabs={[{ value: '', label: 'All' }, { value: 'final', label: 'Open' }, { value: 'invoiced', label: 'Invoiced' }]} />}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={v => { setQ(v); setPage(1); }} placeholder={`Number, ${partyLabel.toLowerCase()}, mobile, item or serial`} className="w-full sm:w-96" />
        <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); setPage(1); }} />
        {data && (
          <span className="ml-auto text-[13px] text-muted">
            {num(data.total)} {data.total === 1 ? noun : m.plural.toLowerCase()} · <span className="text-ink">{money(data.sums.total)}</span>{m.payments && !isRet && <> · paid {money(data.sums.paid)}</>}
          </span>
        )}
      </div>
      <DataTable bleed columns={cols} rows={data?.rows ?? []} loading={loading} onRowClick={r => router.push(`/doc/${kind}/${r.id}`)}
        empty={<div className="py-14 text-center text-[14px] text-muted">{q || from || to || status ? `No ${m.plural.toLowerCase()} match this search.` : `No ${m.plural.toLowerCase()} yet.`}{can(m.module, 'write') && !q && <div className="mt-3"><Button href={m.newPath} icon={<Plus className="size-4" />}>Create one</Button></div>}</div>} />
      {data && data.total > size && <Pager flush page={page} size={size} total={data.total} onPage={setPage} onSize={s => { setSize(s); setPage(1); }} />}
      {kind === 'porder' && <p className="mt-4 flex items-center gap-1.5 text-[13px] text-muted"><CheckCircle2 className="size-4" /> Click an approval badge to approve an order or withdraw approval.</p>}
      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} entities={[kind]} />
    </div>
  );
}
