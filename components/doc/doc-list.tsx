'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, CheckCircle2, Download, Eye, Pencil, Plus, Printer, Trash2, Undo2 } from 'lucide-react';
import { DOC_META, type DocKind } from '@/lib/calc';
import { rpc, useRpc } from '@/lib/client/rpc';
import { downloadCsv, monthStart, todayISO } from '@/lib/format';
import { Badge, Button, Card, ErrorBox, IconButton, Money, PageHeader, Select } from '@/components/ui/primitives';
import { DataTable, DateRange, Pager, SearchInput, type Col } from '@/components/ui/table';
import { useUI } from '@/components/ui/overlay';
import { HistoryButton } from '@/components/history';
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
  const args = useMemo(() => ({ q, from, to, page, size, status: status || undefined }), [q, from, to, page, size, status]);
  const { data, loading, error, reload } = useRpc('docs.listDocs', [kind, args], [kind, JSON.stringify(args)]);
  const isEst = kind === 'estimate' || kind === 'sestimate' || kind === 'porder';
  const isRet = kind === 'sreturn' || kind === 'preturn';
  const partyLabel = m.party === 'customer' ? 'Customer' : 'Supplier';

  const del = async (r: any) => {
    if (!(await confirm({ title: `Delete ${r.no}?`, body: 'Stock, serials and accounting entries created by this document are reversed.', confirm: 'Delete', danger: true }))) return;
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
    { key: 'no', label: isEst ? `${m.label.split(' ').pop()} No` : isRet ? 'Return No' : 'Invoice', render: r => <Link href={`/doc/${kind}/${r.id}`} className="font-medium text-brand hover:underline" onClick={e => e.stopPropagation()}>{r.no}</Link> },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'party', label: partyLabel, render: r => <div className="min-w-0"><p className="truncate font-medium">{r.party ?? '—'}</p><p className="truncate text-xs text-muted">{[r.mobile, r.party_code].filter(Boolean).join(' · ')}</p></div> },
    ...(isRet ? [{ key: 'ref_no', label: 'Against', render: (r: any) => r.ref_no } as Col] : []),
    { key: 'total', label: 'Total', type: 'money' },
    ...(m.payments && !isRet ? [{ key: 'paid', label: 'Paid', type: 'money' } as Col, { key: 'due', label: 'Due', align: 'right', render: (r: any) => r.due > 0.009 ? <Money value={r.due} symbol={false} className="font-medium text-bad" /> : <Badge tone="green">Paid</Badge> } as Col] : []),
    ...(isRet ? [{ key: 'adjust', label: 'Adjusted', type: 'money' } as Col, { key: 'paid', label: 'Refund', type: 'money' } as Col] : []),
    ...(kind === 'sestimate' ? [{ key: 'delivery_date', label: 'Deli. Date', type: 'date' } as Col] : []),
    ...(isEst ? [{ key: 'status', label: 'Invoiced', render: (r: any) => r.status === 'invoiced' ? <Badge tone="blue">Invoiced</Badge> : <Badge tone="gray">Open</Badge> } as Col] : []),
    ...(kind === 'porder' ? [{ key: 'approved', label: 'Approved', render: (r: any) => <button onClick={e => { e.stopPropagation(); void approve(r); }} disabled={!can(m.module, 'edit')}>{r.approved ? <Badge tone="green">Approved</Badge> : <Badge tone="amber">Pending</Badge>}</button> } as Col] : []),
    { key: 'note', label: 'Note', render: r => <span className="line-clamp-1 max-w-[180px] text-xs text-muted">{r.note}</span> },
    { key: 'created_by_name', label: 'Created', render: r => <div className="text-xs text-muted"><p>{r.created_by_name}</p><p>{r.created_at?.slice(0, 16)}</p>{r.updated_by_name && <p className="text-info">edited by {r.updated_by_name}</p>}</div> },
    {
      key: '__a', label: '', align: 'right', width: '1%', render: r => (
        <div className="flex justify-end gap-0.5 opacity-70 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
          <IconButton label="View" onClick={() => router.push(`/doc/${kind}/${r.id}`)}><Eye className="size-4" /></IconButton>
          {can(m.module, 'print') && <IconButton label="Print" onClick={() => router.push(`/doc/${kind}/${r.id}?print=${kind === 'sale' ? 'pos' : 'a4'}`)}><Printer className="size-4" /></IconButton>}
          {convertTo && r.status !== 'invoiced' && can(DOC_META[convertTo as DocKind].module, 'write') && <IconButton label={`Convert to ${DOC_META[convertTo as DocKind].label.toLowerCase()}`} onClick={() => router.push(`/doc/${convertTo}/new?from=${r.id}`)}><ArrowRightLeft className="size-4" /></IconButton>}
          {(kind === 'sale' || kind === 'purchase') && can(m.module, 'write') && <IconButton label="Return" onClick={() => router.push(`/doc/${kind === 'sale' ? 'sreturn' : 'preturn'}/new?inv=${encodeURIComponent(r.no)}`)}><Undo2 className="size-4" /></IconButton>}
          {!isRet && can(m.module, 'edit') && <IconButton label="Edit" onClick={() => router.push(`/doc/${kind}/${r.id}/edit`)}><Pencil className="size-4" /></IconButton>}
          {can(m.module, 'delete') && <IconButton label="Delete" className="hover:!text-bad" onClick={() => del(r)}><Trash2 className="size-4" /></IconButton>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={m.plural} subtitle={data ? <>{data.total} document(s) · total <Money value={data.sums.total} />{m.payments && !isRet && <> · paid <Money value={data.sums.paid} /></>}</> : ' '}
        actions={<>
          <HistoryButton entities={[kind]} />
          <Button variant="ghost" icon={<Download className="size-4" />} onClick={exportCsv}>CSV</Button>
          {can(m.module, 'write') && <Button variant="primary" icon={<Plus className="size-4" />} href={m.newPath}>New {m.label.toLowerCase()}</Button>}
        </>} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={q} onChange={v => { setQ(v); setPage(1); }} placeholder={`No, ${partyLabel.toLowerCase()}, mobile, item, serial…`} className="w-full sm:w-80" />
          <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); setPage(1); }} />
          {isEst && (
            <Select className="w-40" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All</option><option value="final">Open</option><option value="invoiced">Invoiced</option>
            </Select>
          )}
        </div>
        <DataTable columns={cols} rows={data?.rows ?? []} loading={loading} onRowClick={r => router.push(`/doc/${kind}/${r.id}`)}
          empty={<div className="py-14 text-center text-sm text-muted">No {m.plural.toLowerCase()} in this period.{can(m.module, 'write') && <div className="mt-3"><Button variant="soft" href={m.newPath} icon={<Plus className="size-4" />}>Create one</Button></div>}</div>} />
        {data && <Pager page={page} size={size} total={data.total} onPage={setPage} onSize={s => { setSize(s); setPage(1); }} />}
      </Card>
      {kind === 'porder' && <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><CheckCircle2 className="size-3.5" /> Click the approval badge to approve or un-approve an order.</p>}
    </div>
  );
}
