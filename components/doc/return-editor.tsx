'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, X } from 'lucide-react';
import { DOC_META, r2 } from '@/lib/calc';
import { rpc, useRpc, type RpcResult } from '@/lib/client/rpc';
import { date, money, num, todayISO } from '@/lib/format';
import { Button, Card, Empty, Field, IconButton, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { useUI } from '@/components/ui/overlay';
import { Guard } from '@/components/shell/session';

type Src = NonNullable<RpcResult<'docs.returnSource'>>;

export function ReturnEditor({ kind }: { kind: 'sreturn' | 'preturn' }) {
  return <Guard module={DOC_META[kind].module} action="write"><Inner kind={kind} /></Guard>;
}

function Inner({ kind }: { kind: 'sreturn' | 'preturn' }) {
  const m = DOC_META[kind];
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useUI();
  const setup = useRpc('docs.docSetup', [kind], [kind]);
  const [q, setQ] = useState(params.get('inv') ?? '');
  const [src, setSrc] = useState<Src | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [ser, setSer] = useState<Record<number, string[]>>({});
  const [pays, setPays] = useState<{ ledger_id: number | ''; amount: number | '' }[]>([]);
  const [note, setNote] = useState('');
  const [dt, setDt] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  const find = async (value = q) => {
    if (!value.trim()) return;
    const r = await rpc('docs.returnSource', kind, value);
    if (!r) { toast('No invoice found for that number or serial', 'warn'); return; }
    setSrc(r); setQty({}); setSer({});
    const scanned = r.lines.find((l: any) => l.returnable_serials.includes(value.trim()));
    if (scanned) { setSer({ [scanned.id]: [value.trim()] }); setQty({ [scanned.id]: 1 }); }
  };
  useEffect(() => { if (params.get('inv')) void find(params.get('inv')!); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = src?.lines ?? [];
  const unit = (l: any) => kind === 'sreturn' ? r2(l.subtotal / l.qty) : r2((l.qty * l.price - (l.qty * l.price * l.disc_pct) / 100 - l.disc) / l.qty);
  const total = r2(lines.reduce((a: number, l: any) => a + unit(l) * (qty[l.id] || 0), 0));
  const paid = r2(pays.reduce((a, p) => a + (Number(p.amount) || 0), 0));

  const save = async () => {
    setBusy(true);
    try {
      const r = await rpc('docs.saveDoc', kind, {
        date: dt, ref_doc_id: src!.doc.id, note,
        lines: lines.filter((l: any) => qty[l.id] > 0).map((l: any) => ({ ref_line_id: l.id, qty: qty[l.id], serials: ser[l.id] ?? [], rate: 0 })),
        payments: pays.filter(p => p.ledger_id && Number(p.amount) > 0).map(p => ({ ledger_id: Number(p.ledger_id), amount: Number(p.amount) })),
      } as any);
      toast(`${m.label} ${r.no} saved`);
      router.push(`/doc/${kind}/${r.id}`);
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader back={m.listPath} title={`New ${m.label.toLowerCase()}`} subtitle={`Find the ${kind === 'sreturn' ? 'sales' : 'purchase'} invoice by its number, or scan a serial number.`} />
      <Card>
        <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void find(); }}>
          <div className="relative min-w-[260px] flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input inputSize="lg" autoFocus className="pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'sreturn' ? 'e.g. SEL-BGI-301026-001 or serial' : 'e.g. PUR-BGI-301026-001 or serial'} /></div>
          <Button type="submit" size="lg" variant="primary">Find invoice</Button>
        </form>
      </Card>
      {!src ? <Empty title="No invoice selected" hint="Returned quantities, refunds and stock are updated automatically when you save." /> : (
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card pad={false} title={<>{src.doc.no} <span className="font-normal text-muted">· {date(src.doc.date)} · {src.party?.name ?? src.doc.walkin_name}</span></>} subtitle={`Invoice total ${money(src.doc.total)}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="text-[12.5px] text-muted [&>th]:font-normal">{['Item', 'Sold', 'Returned', 'Rate', 'Return qty', 'Amount'].map(h => <th key={h} className="px-3 py-2 text-left first:pl-4">{h}</th>)}</tr></thead>
                <tbody>
                  {lines.map((l: any) => {
                    const left = r2(l.qty - l.moved_qty);
                    const serial = l.returnable_serials.length > 0 && (l.mode === 'serial' || l.mode === 'imei');
                    return (
                      <tr key={l.id} className="border-t border-line align-top">
                        <td className="px-4 py-2.5"><p className="font-medium">{l.name}</p><p className="text-xs text-muted">{l.code} {l.color} {l.size}</p>
                          {serial && <div className="mt-1.5 flex flex-wrap gap-1">{l.returnable_serials.map((s: string) => {
                            const on = (ser[l.id] ?? []).includes(s);
                            return <button key={s} type="button" onClick={() => { const n = on ? (ser[l.id] ?? []).filter(x => x !== s) : [...(ser[l.id] ?? []), s]; setSer({ ...ser, [l.id]: n }); setQty({ ...qty, [l.id]: n.length }); }} className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] ${on ? 'border-line-strong bg-surface-3 text-ink' : 'border-line text-muted'}`}>{s}</button>;
                          })}</div>}
                        </td>
                        <td className="num px-3 py-2.5">{num(l.qty)}</td>
                        <td className="num px-3 py-2.5 text-muted">{num(l.moved_qty)}</td>
                        <td className="num px-3 py-2.5">{money(unit(l), false)}</td>
                        <td className="px-3 py-2"><Input inputSize="sm" type="number" min={0} max={left} className="num w-24 text-right" value={qty[l.id] ?? ''} readOnly={serial} placeholder={`max ${left}`} onChange={e => setQty({ ...qty, [l.id]: Math.min(left, Math.max(0, Number(e.target.value) || 0)) })} /></td>
                        <td className="num px-3 py-2.5 text-right font-medium">{money(unit(l) * (qty[l.id] || 0), false)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Settlement" className="lg:sticky lg:top-6 lg:self-start">
            <Field label="Date"><Input type="date" value={dt} onChange={e => setDt(e.target.value)} /></Field>
            <div className="mt-4 flex items-baseline justify-between rounded-lg bg-surface-2 px-4 py-3.5"><span className="text-[14px] font-medium text-ink-2">Return total</span><span className="num text-[28px] font-semibold leading-none">{money(total)}</span></div>
            <p className="mt-3 text-xs font-medium text-ink-2">{kind === 'sreturn' ? 'Refund to customer' : 'Refund received from supplier'} (optional)</p>
            <div className="mt-2 space-y-2">
              {pays.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Select inputSize="sm" className="min-w-0 flex-1" value={p.ledger_id} onChange={e => setPays(pays.map((x, j) => (j === i ? { ...x, ledger_id: Number(e.target.value) } : x)))}>{setup.data?.money.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</Select>
                  <Input inputSize="sm" type="number" className="num w-28 text-right" value={p.amount} onChange={e => setPays(pays.map((x, j) => (j === i ? { ...x, amount: e.target.value === '' ? '' : Number(e.target.value) } : x)))} />
                  <IconButton label="Remove" onClick={() => setPays(pays.filter((_, j) => j !== i))}><X className="size-4" /></IconButton>
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setPays([...pays, { ledger_id: setup.data?.money[0]?.id ?? '', amount: r2(total - paid) || '' }])}>Add refund</Button>
            </div>
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Refunded</dt><dd className="num">{money(paid)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Adjusted against due</dt><dd className="num font-medium">{money(total - paid)}</dd></div>
            </dl>
            <Field label="Note" className="mt-3"><Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} /></Field>
            <Button variant="primary" size="lg" className="mt-4 w-full" disabled={total <= 0} loading={busy} onClick={save}>Save return</Button>
          </Card>
        </div>
      )}
    </div>
  );
}
