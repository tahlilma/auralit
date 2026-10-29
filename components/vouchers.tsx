'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Eye, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import { rpc, useRpc } from '@/lib/client/rpc';
import { date, dateTime, downloadCsv, inWords, money, monthStart, todayISO } from '@/lib/format';
import { Button, Card, cx, ErrorBox, Field, IconButton, Input, Loading, Money, PageHeader, Textarea } from '@/components/ui/primitives';
import { DataTable, DateRange, Pager, SearchInput, type Col } from '@/components/ui/table';
import { RefSelect } from '@/components/ui/combobox';
import { useUI } from '@/components/ui/overlay';
import { HistoryButton } from '@/components/history';
import { Guard, useSession } from '@/components/shell/session';

export type VKind = 'payment' | 'receipt' | 'journal' | 'contra' | 'expense' | 'donation';
const META: Record<VKind, { label: string; plural: string; module: string; dr: string; cr: string; drRef: string; crRef: string; less?: boolean; charge?: boolean; invoice?: boolean; xrate?: boolean; cheque?: boolean; memo?: boolean }> = {
  payment: { label: 'Payment Voucher', plural: 'Payment Vouchers', module: 'acctra', dr: 'Pay to', cr: 'Payment source', drRef: 'party_ledger', crRef: 'money_loan', less: true, invoice: true, cheque: true },
  receipt: { label: 'Receive Voucher', plural: 'Receive Vouchers', module: 'acctra', dr: 'Received to', cr: 'Received from', drRef: 'money_loan', crRef: 'party_ledger', less: true, invoice: true, xrate: true, cheque: true },
  journal: { label: 'Journal Voucher', plural: 'Journal Entries', module: 'acctra', dr: 'Debit ledger', cr: 'Credit ledger', drRef: 'ledger', crRef: 'ledger', cheque: true },
  contra: { label: 'Transaction', plural: 'Bank / Cash Transfers', module: 'acctra', dr: 'Transfer to', cr: 'Source', drRef: 'money_loan', crRef: 'money_loan', charge: true, cheque: true },
  expense: { label: 'Expenses Voucher', plural: 'Expenses Record', module: 'daily', dr: 'Expenses head', cr: '', drRef: 'expense_head', crRef: '', memo: true },
  donation: { label: 'Donation Voucher', plural: 'Donations', module: 'acctra', dr: 'Paid to (name)', cr: 'Payment source', drRef: '', crRef: 'money_loan', cheque: true, memo: true },
};

type VLine = { dr?: number | null; cr?: number | null; amount: number | ''; less?: number | ''; less_ref?: string; charge?: number | ''; cheque_no?: string; cheque_date?: string; ref?: string; memo?: string; ref_doc_no?: string; xrate?: number | '' };
const blankLine = (): VLine => ({ amount: '' });

function Balance({ id }: { id?: number | null }) {
  const [b, setB] = useState<number | null>(null);
  useEffect(() => { if (!id) { setB(null); return; } rpc('vouchers.balanceOf', id).then(setB).catch(() => setB(null)); }, [id]);
  if (b === null) return null;
  return <p className="mt-1 text-[11px] text-muted">Balance <span className={cx('num font-medium', b < 0 ? 'text-bad' : 'text-ink-2')}>{money(b)}</span> {b < 0 ? '(Cr)' : '(Dr)'}</p>;
}

export function VoucherEditor({ kind, id }: { kind: VKind; id?: number }) {
  return <Guard module={META[kind].module} action={id ? 'edit' : 'write'}><Editor kind={kind} id={id} /></Guard>;
}

function Editor({ kind, id }: { kind: VKind; id?: number }) {
  const m = META[kind];
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useUI();
  const [dt, setDt] = useState(todayISO());
  const [note, setNote] = useState('');
  const [source, setSource] = useState<number | null>(null);
  const [lines, setLines] = useState<VLine[]>([blankLine()]);
  const [no, setNo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(!id);
  const [dues, setDues] = useState<Record<number, string>>({});

  useEffect(() => {
    if (id) {
      rpc('vouchers.voucherForEdit', id).then(v => {
        setDt(v.date); setNote(v.note); setSource(v.source); setNo(v.no);
        setLines(v.lines.map((l: any) => ({ ...l, amount: l.amount, less: l.less ?? '', charge: l.charge ?? '' })));
        setReady(true);
      }).catch(e => toast(e.message, 'error'));
    } else if (params.get('inv')) {
      rpc('vouchers.invoiceDue', params.get('inv')!).then(d => {
        if (!d) return;
        const l: VLine = { amount: Math.max(0, d.due), ref_doc_no: d.no };
        if (kind === 'receipt') l.cr = d.ledger_id; else l.dr = d.ledger_id;
        setLines([l]);
        setDues({ 0: `${d.party} · invoice due ${money(d.due)}` });
      }).catch(() => {});
    } else if (params.get('ledger')) {
      const lid = Number(params.get('ledger'));
      setLines([kind === 'receipt' ? { amount: '', cr: lid } : { amount: '', dr: lid }]);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (i: number, p: Partial<VLine>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const total = lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const lookupInvoice = async (i: number, v: string) => {
    if (!v.trim()) { setDues(d => ({ ...d, [i]: '' })); return; }
    const d = await rpc('vouchers.invoiceDue', v);
    if (!d) { setDues(x => ({ ...x, [i]: 'Invoice not found' })); return; }
    setDues(x => ({ ...x, [i]: `${d.party} · due ${money(d.due)}` }));
    set(i, kind === 'receipt' ? { cr: d.ledger_id, amount: lines[i].amount || Math.max(0, d.due) } : { dr: d.ledger_id, amount: lines[i].amount || Math.max(0, d.due) });
  };

  const save = async (print = false) => {
    setBusy(true);
    try {
      const payload = { date: dt, note, source, lines: lines.map(l => ({ ...l, amount: Number(l.amount) || 0, less: Number(l.less) || 0, charge: Number(l.charge) || 0, xrate: Number(l.xrate) || undefined })) };
      const r = await rpc('vouchers.saveVoucher', kind, payload as any, id);
      toast(`${m.label} ${r.no} saved`);
      router.push(`/vouchers/${kind}/${r.id}${print ? '?print=1' : ''}`);
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  if (!ready) return <Loading />;
  return (
    <div>
      <PageHeader back={`/vouchers/${kind}`} title={id ? `Edit ${m.label.toLowerCase()} ${no ?? ''}` : `New ${m.label.toLowerCase()}`} subtitle={kind === 'journal' ? 'Each line debits one ledger and credits another for the same amount.' : undefined} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {kind === 'expense' && (
            <Card><div className="grid gap-3 sm:grid-cols-2"><Field label="Paid from (other credit)" required><RefSelect refKey="money_loan" value={source} onChange={setSource} placeholder="Petty cash, cash, bank…" /><Balance id={source} /></Field></div></Card>
          )}
          {lines.map((l, i) => (
            <Card key={i} pad className="relative">
              <div className="absolute right-3 top-3 flex items-center gap-2"><span className="text-xs font-medium text-muted">Line {i + 1}</span>{lines.length > 1 && <IconButton label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))}><X className="size-4" /></IconButton>}</div>
              <div className="grid gap-3 pr-16 sm:grid-cols-2">
                {m.cr && (kind === 'payment' || kind === 'contra' || kind === 'donation') && <Field label={m.cr} required><RefSelect refKey={m.crRef} value={l.cr} onChange={v => set(i, { cr: v })} /><Balance id={l.cr} /></Field>}
                {m.drRef && <Field label={m.dr} required><RefSelect refKey={m.drRef} value={l.dr} onChange={v => set(i, { dr: v })} /><Balance id={l.dr} /></Field>}
                {kind === 'donation' && <Field label={m.dr}><Input value={l.memo ?? ''} onChange={e => set(i, { memo: e.target.value })} placeholder="e.g. Mosque committee" /></Field>}
                {m.cr && (kind === 'receipt' || kind === 'journal') && <Field label={m.cr} required><RefSelect refKey={m.crRef} value={l.cr} onChange={v => set(i, { cr: v })} /><Balance id={l.cr} /></Field>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Amount" required><Input type="number" step="0.01" className="num text-right" value={l.amount} onChange={e => set(i, { amount: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>
                {m.less && <Field label={kind === 'payment' ? 'Less pay (discount taken)' : 'Less receive (discount given)'}><Input type="number" step="0.01" className="num text-right" value={l.less ?? ''} onChange={e => set(i, { less: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>}
                {m.less && <Field label="Less ref."><Input value={l.less_ref ?? ''} onChange={e => set(i, { less_ref: e.target.value })} /></Field>}
                {m.charge && <Field label="Any charges"><Input type="number" step="0.01" className="num text-right" value={l.charge ?? ''} onChange={e => set(i, { charge: e.target.value === '' ? '' : Number(e.target.value) })} /></Field>}
                {m.invoice && <Field label="Against invoice no" hint={dues[i]}><Input value={l.ref_doc_no ?? ''} onChange={e => set(i, { ref_doc_no: e.target.value })} onBlur={e => lookupInvoice(i, e.target.value)} placeholder="Optional" /></Field>}
                {m.xrate && <Field label="Exchange rate"><Input type="number" step="any" value={l.xrate ?? ''} onChange={e => set(i, { xrate: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="1" /></Field>}
                {m.cheque && <Field label="Cheque no"><Input value={l.cheque_no ?? ''} onChange={e => set(i, { cheque_no: e.target.value })} placeholder="Optional" /></Field>}
                {m.cheque && <Field label="Cheque date"><Input type="date" value={l.cheque_date ?? ''} onChange={e => set(i, { cheque_date: e.target.value })} /></Field>}
                <Field label="Ref" className={kind === 'expense' ? '' : ''}><Input value={l.ref ?? ''} onChange={e => set(i, { ref: e.target.value })} placeholder="e.g. Sumon" /></Field>
                {kind === 'expense' && <Field label="Details" className="sm:col-span-2"><Input value={l.memo ?? ''} onChange={e => set(i, { memo: e.target.value })} /></Field>}
              </div>
            </Card>
          ))}
          <Button icon={<Plus className="size-4" />} onClick={() => setLines([...lines, { ...blankLine(), cr: kind === 'payment' || kind === 'contra' || kind === 'donation' ? lines[lines.length - 1]?.cr : undefined, dr: kind === 'receipt' ? lines[lines.length - 1]?.dr : undefined }])}>Add line</Button>
        </div>
        <Card className="lg:sticky lg:top-[72px] lg:self-start">
          <Field label="Date"><Input type="date" value={dt} onChange={e => setDt(e.target.value)} /></Field>
          <Field label="Narration / note" className="mt-3"><Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} /></Field>
          <div className="mt-4 flex items-baseline justify-between rounded-xl bg-brand-soft px-3 py-3"><span className="text-sm font-semibold text-brand">Total</span><span className="num text-2xl font-bold">{money(total)}</span></div>
          <div className="mt-4 grid gap-2">
            <Button variant="primary" size="lg" loading={busy} icon={<Printer className="size-4" />} onClick={() => save(true)}>Save & print</Button>
            <Button size="lg" loading={busy} onClick={() => save(false)}>Save</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function VoucherList({ kind }: { kind: VKind }) {
  return <Guard module={META[kind].module}><VList kind={kind} /></Guard>;
}

function VList({ kind }: { kind: VKind }) {
  const m = META[kind];
  const router = useRouter();
  const { can } = useSession();
  const { toast, confirm } = useUI();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const args = useMemo(() => ({ q, from, to, page, size }), [q, from, to, page, size]);
  const { data, loading, error, reload } = useRpc('vouchers.listVouchers', [kind, args], [kind, JSON.stringify(args)]);
  const del = async (r: any) => {
    if (!(await confirm({ title: `Delete ${r.no}?`, body: 'The accounting entries of this voucher will be removed.', confirm: 'Delete', danger: true }))) return;
    try { await rpc('vouchers.deleteVoucher', r.id); toast('Voucher deleted'); reload(); } catch (e: any) { toast(e.message, 'error'); }
  };
  const cols: Col[] = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'no', label: 'Voucher No', render: r => <Link href={`/vouchers/${kind}/${r.id}`} className="font-medium text-brand hover:underline" onClick={e => e.stopPropagation()}>{r.no}</Link> },
    { key: 'party', label: kind === 'receipt' ? 'Received from' : kind === 'expense' ? 'Expense heads' : kind === 'contra' ? 'Transfer to' : kind === 'journal' ? 'Debit' : 'Paid to', render: r => <span className="line-clamp-2 text-[13px]">{r.party}</span> },
    { key: 'source', label: kind === 'receipt' ? 'Received into' : 'Source', render: r => <span className="text-[13px] text-muted">{r.source}</span> },
    { key: 'amount', label: 'Amount', type: 'money' },
    { key: 'refs', label: 'Ref.', render: r => <span className="text-xs text-muted">{r.refs}</span> },
    { key: 'note', label: 'Note', render: r => <span className="line-clamp-1 max-w-[200px] text-xs text-muted">{r.note}</span> },
    { key: 'created_by_name', label: 'Created', render: r => <span className="text-xs text-muted">{r.created_by_name}<br />{dateTime(r.created_at)}</span> },
    { key: '__a', label: '', align: 'right', width: '1%', render: r => (
      <div className="flex justify-end gap-0.5 opacity-70 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
        <IconButton label="View" onClick={() => router.push(`/vouchers/${kind}/${r.id}`)}><Eye className="size-4" /></IconButton>
        <IconButton label="Print" onClick={() => router.push(`/vouchers/${kind}/${r.id}?print=1`)}><Printer className="size-4" /></IconButton>
        {can(m.module, 'edit') && <IconButton label="Edit" onClick={() => router.push(`/vouchers/${kind}/${r.id}/edit`)}><Pencil className="size-4" /></IconButton>}
        {can(m.module, 'delete') && <IconButton label="Delete" className="hover:!text-bad" onClick={() => del(r)}><Trash2 className="size-4" /></IconButton>}
      </div>
    ) },
  ];
  return (
    <div>
      <PageHeader title={m.plural} subtitle={data ? <>{data.total} voucher(s) · <Money value={data.sums.total} /></> : ' '}
        actions={<>
          <HistoryButton entities={[kind]} />
          <Button variant="ghost" icon={<Download className="size-4" />} onClick={async () => { const all = await rpc('vouchers.listVouchers', kind, { ...args, page: 1, size: 5000 }); downloadCsv(m.plural, ['Date', 'No', 'Party', 'Source', 'Amount', 'Ref', 'Note'], all.rows.map((r: any) => [r.date, r.no, r.party, r.source, r.amount, r.refs, r.note])); }}>CSV</Button>
          {can(m.module, 'write') && <Button variant="primary" icon={<Plus className="size-4" />} href={`/vouchers/${kind}/new`}>New {m.label.toLowerCase()}</Button>}
        </>} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={q} onChange={v => { setQ(v); setPage(1); }} placeholder="Voucher no, ledger, ref, cheque…" className="w-full sm:w-80" />
          <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); setPage(1); }} />
        </div>
        <DataTable columns={cols} rows={data?.rows ?? []} loading={loading} onRowClick={r => router.push(`/vouchers/${kind}/${r.id}`)} totals={data ? { amount: data.rows.reduce((a: number, r: any) => a + r.amount, 0) } : undefined} />
        {data && <Pager page={page} size={size} total={data.total} onPage={setPage} onSize={s => { setSize(s); setPage(1); }} />}
      </Card>
    </div>
  );
}

export function VoucherView({ kind, id }: { kind: VKind; id: number }) {
  return <Guard module={META[kind].module}><VView kind={kind} id={id} /></Guard>;
}

function VView({ kind, id }: { kind: VKind; id: number }) {
  const m = META[kind];
  const params = useSearchParams();
  const router = useRouter();
  const { can } = useSession();
  const { toast, confirm } = useUI();
  const { data, error } = useRpc('vouchers.getVoucher', [id], [id]);
  useEffect(() => { if (data && params.get('print')) { const t = setTimeout(() => window.print(), 350); return () => clearTimeout(t); } }, [data, params]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const j = data.journal;
  const total = data.lines.reduce((a: number, l: any) => a + l.debit, 0);
  const del = async () => {
    if (!(await confirm({ title: `Delete ${j.no}?`, confirm: 'Delete', danger: true }))) return;
    try { await rpc('vouchers.deleteVoucher', id); toast('Voucher deleted'); router.push(`/vouchers/${kind}`); } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <div>
      <PageHeader back={`/vouchers/${kind}`} title={j.no} subtitle={`${m.label} · ${date(j.date)} · by ${j.created_by_name ?? ''}`}
        actions={<>
          <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>
          {can(m.module, 'edit') && <Button icon={<Pencil className="size-4" />} href={`/vouchers/${kind}/${id}/edit`}>Edit</Button>}
          {can(m.module, 'delete') && <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={del}>Delete</Button>}
        </>} />
      <div className="print-area mx-auto w-[210mm] max-w-full rounded-xl border border-line bg-white p-[12mm] text-[12px] text-black shadow-card">
        <div className="flex items-start justify-between border-b-2 border-black pb-3">
          <div><p className="text-xl font-bold">{data.company?.name}</p><p className="text-xs">{data.company?.address}</p><p className="text-xs">{data.company?.mobile}</p></div>
          <div className="text-right"><p className="text-lg font-bold uppercase">{m.label}</p><p className="num font-semibold">{j.no}</p><p className="text-xs">Date: {date(j.date)}</p></div>
        </div>
        <table className="mt-5 w-full border-collapse text-[11.5px]">
          <thead><tr className="border-y border-black bg-neutral-100 text-left"><th className="px-2 py-1.5">Ledger</th><th className="px-2 py-1.5">Details</th><th className="px-2 py-1.5 text-right">Debit</th><th className="px-2 py-1.5 text-right">Credit</th></tr></thead>
          <tbody>
            {data.lines.map((l: any) => (
              <tr key={l.id} className="border-b border-neutral-300 align-top">
                <td className="px-2 py-1.5"><p className="font-medium">{l.ledger_name}</p><p className="text-[10.5px] text-neutral-600">{l.ledger_code}</p></td>
                <td className="px-2 py-1.5 text-[11px]">{[l.memo, l.ref && `Ref: ${l.ref}`, l.cheque_no && `Cheque ${l.cheque_no}${l.cheque_date ? ` (${date(l.cheque_date)})` : ''}`, l.ref_doc_no && `Invoice ${l.ref_doc_no}`, l.xrate && `Rate ${l.xrate}`].filter(Boolean).join(' · ')}</td>
                <td className="num px-2 py-1.5 text-right">{l.debit ? money(l.debit, false) : ''}</td>
                <td className="num px-2 py-1.5 text-right">{l.credit ? money(l.credit, false) : ''}</td>
              </tr>
            ))}
            <tr className="font-bold"><td className="px-2 py-1.5" colSpan={2}>Total</td><td className="num px-2 py-1.5 text-right">{money(total, false)}</td><td className="num px-2 py-1.5 text-right">{money(total, false)}</td></tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs"><b>In words:</b> <i>{inWords(total)}</i></p>
        {j.narration && <p className="mt-2 text-xs"><b>Narration:</b> {j.narration}</p>}
        <div className="mt-20 grid grid-cols-4 gap-6 text-center text-[11px]">{['Prepared by', 'Checked by', 'Approved by', 'Received by'].map(s => <div key={s} className="border-t border-black pt-1">{s}</div>)}</div>
      </div>
    </div>
  );
}
