'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Eye, Plus, Printer, Trash2, X } from 'lucide-react';
import { rpc, useRpc } from '@/lib/client/rpc';
import { date, downloadCsv, money, num, todayISO } from '@/lib/format';
import { Button, Card, cx, ErrorBox, Field, IconButton, Input, Loading, PageHeader, Select, Tabs, Textarea } from '@/components/ui/primitives';
import { Combobox, type Opt } from '@/components/ui/combobox';
import { DataTable, DateRange, Pager, SearchInput, type Col } from '@/components/ui/table';
import { useUI } from '@/components/ui/overlay';
import { HistoryButton } from '@/components/history';
import { ProductDetails } from '@/components/product-details';
import { Guard, useSession } from '@/components/shell/session';

export type SKind = 'transfer_b' | 'transfer_w' | 'delivery' | 'receive' | 'disposal' | 'bad_claim' | 'self_bad';
const META: Record<SKind, { label: string; plural: string; module: string; hint: string }> = {
  transfer_b: { label: 'Transfer From Branch', plural: 'Branch Transfers', module: 'inventory', hint: 'Move stock from a branch to another branch or a warehouse.' },
  transfer_w: { label: 'Transfer From Warehouse', plural: 'Warehouse Transfers', module: 'inventory', hint: 'Move stock from a warehouse to a branch or another warehouse.' },
  delivery: { label: 'Product Delivery', plural: 'Product Deliveries', module: 'inventory', hint: 'Record goods handed over against a sales invoice (supports partial delivery).' },
  receive: { label: 'Product Received', plural: 'Products Received', module: 'inventory', hint: 'Record goods physically received against a purchase invoice.' },
  disposal: { label: 'Product Disposal', plural: 'Product Disposals', module: 'inventory', hint: 'Write off damaged or expired stock; any recovered amount is booked.' },
  bad_claim: { label: 'Claim To Supplier', plural: 'Supplier Bad-Stock Claims', module: 'warranty', hint: 'Return faulty units (warranty or general stock) to a supplier for credit.' },
  self_bad: { label: 'Self Stock Manage', plural: 'Self Bad-Stock Records', module: 'warranty', hint: 'Repair faulty warranty units back into stock or write them off.' },
};

type L = { key: string; product_id?: number; color_id?: number | null; size_id?: number | null; name: string; code?: string; mode?: string; qty: number; max?: number; serial?: string; doc_line_id?: number; claim_id?: number; cost?: number; action?: string };
const uid = () => Math.random().toString(36).slice(2, 9);

export function StockEditor({ kind }: { kind: SKind }) {
  return <Guard module={META[kind].module} action="write"><Editor kind={kind} /></Guard>;
}

function Editor({ kind }: { kind: SKind }) {
  const m = META[kind];
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useUI();
  const { me } = useSession();
  const setup = useRpc('stock.stockSetup', [], []);
  const [dt, setDt] = useState(todayISO());
  const [from, setFrom] = useState<string>(kind === 'transfer_w' ? '' : `B:${me.branch_id ?? 1}`);
  const [to, setTo] = useState<string>('');
  const [docId, setDocId] = useState<number | null>(Number(params.get('doc')) || null);
  const [supplier, setSupplier] = useState<number | null>(null);
  const [recover, setRecover] = useState<number | ''>('');
  const [recLedger, setRecLedger] = useState<number | null>(null);
  const [amount, setAmount] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<L[]>([]);
  const [tab, setTab] = useState<'general' | 'warranty'>('warranty');
  const [busy, setBusy] = useState(false);

  const invoices = useRpc(kind === 'delivery' || kind === 'receive' ? 'stock.openInvoices' : null, [kind as 'delivery'], [kind]);
  const bad = useRpc(kind === 'bad_claim' || kind === 'self_bad' ? 'ops.badStockItems' : null, [], [kind]);

  useEffect(() => {
    if ((kind === 'delivery' || kind === 'receive') && docId) {
      rpc('stock.pendingFor', kind, docId).then(r => setLines(r.lines.filter((l: any) => l.rest > 0).map((l: any) => ({ key: uid(), doc_line_id: l.id, product_id: l.product_id, name: l.name, code: l.code, qty: l.rest, max: l.rest, extra: l })))).catch(e => toast(e.message, 'error'));
    }
  }, [docId, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (kind === 'transfer_w' && !from && setup.data?.warehouses.length) setFrom(setup.data.warehouses[0].value);
  }, [setup.data, kind, from]);

  const locs = setup.data ? [...setup.data.branches.map((b: any) => ({ ...b, label: `${b.label} (Branch)` })), ...setup.data.warehouses.map((w: any) => ({ ...w, label: `${w.label} (Warehouse)` }))] : [];
  const fromOpts = kind === 'transfer_w' ? setup.data?.warehouses ?? [] : kind === 'transfer_b' ? setup.data?.branches ?? [] : locs;
  const loadStock = useCallback(async (q: string) => (await rpc('stock.locationStock', from, q)).map((r: any) => ({ ...r, value: `${r.product_id}|${r.color_id ?? ''}|${r.size_id ?? ''}`, label: r.name, hint: `${r.code}${r.color ? ` · ${r.color}` : ''}${r.size ? ` · ${r.size}` : ''} · ${num(r.qty)} available` })), [from]);
  const addStock = (o: Opt | null | undefined) => {
    if (!o) return;
    if (lines.some(l => l.product_id === o.product_id && (l.color_id ?? null) === (o.color_id ?? null) && (l.size_id ?? null) === (o.size_id ?? null))) return;
    setLines([...lines, { key: uid(), product_id: o.product_id, color_id: o.color_id, size_id: o.size_id, name: o.name, code: o.code, mode: o.mode, qty: 1, max: o.qty }]);
  };
  const set = (k: string, p: Partial<L>) => setLines(ls => ls.map(l => (l.key === k ? { ...l, ...p } : l)));

  const save = async () => {
    setBusy(true);
    try {
      const r = await rpc('stock.saveStockDoc', kind, {
        date: dt, from, to, doc_id: docId ?? undefined, supplier_id: supplier ?? undefined, recover: Number(recover) || 0, recover_ledger: recLedger ?? undefined,
        amount: amount === '' ? undefined : Number(amount), note,
        lines: lines.map(l => ({ product_id: l.product_id, color_id: l.color_id, size_id: l.size_id, qty: l.qty, serial: l.serial, doc_line_id: l.doc_line_id, claim_id: l.claim_id, cost: l.cost, action: l.action })),
      });
      toast(`${m.label} ${r.no} saved`);
      router.push(`/stock/${kind}/${r.id}`);
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  if (!setup.data) return <Loading />;
  const showStockPicker = kind === 'transfer_b' || kind === 'transfer_w' || kind === 'disposal' || (kind === 'bad_claim' && tab === 'general');
  const showBad = kind === 'self_bad' || (kind === 'bad_claim' && tab === 'warranty');
  const badCost = lines.reduce((a, l) => a + (l.claim_id ? Number(l.cost) || 0 : 0), 0);

  return (
    <div>
      <PageHeader back={`/stock/${kind}`} title={`New ${m.label.toLowerCase()}`} subtitle={m.hint} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <div className="grid gap-3 sm:grid-cols-3">
              {(kind === 'transfer_b' || kind === 'transfer_w' || kind === 'disposal') && <Field label="From" required><Combobox value={from} onChange={v => { setFrom(v); setLines([]); }} options={(kind === 'disposal' ? locs : fromOpts) as Opt[]} clearable={false} /></Field>}
              {(kind === 'transfer_b' || kind === 'transfer_w') && <Field label="To" required><Combobox value={to} onChange={setTo} options={locs.filter(l => l.value !== from) as Opt[]} /></Field>}
              {(kind === 'delivery' || kind === 'receive') && <Field label={kind === 'delivery' ? 'Sales invoice' : 'Purchase invoice'} required className="sm:col-span-2"><Combobox value={docId} onChange={setDocId} options={(invoices.data ?? []) as Opt[]} placeholder="Choose an invoice with pending items…" /></Field>}
              {kind === 'bad_claim' && <Field label="Supplier" required className="sm:col-span-2"><Combobox value={supplier} onChange={setSupplier} options={setup.data.suppliers as Opt[]} /></Field>}
              <Field label="Date"><Input type="date" value={dt} onChange={e => setDt(e.target.value)} /></Field>
            </div>
          </Card>
          {kind === 'bad_claim' && <Tabs value={tab} onChange={setTab} tabs={[{ value: 'warranty', label: 'Warranty items' }, { value: 'general', label: 'General stock items' }]} />}
          {showStockPicker && (
            <Card title="Add items" subtitle="Only items available at the source location are listed.">
              <Combobox value={null} onChange={(_, o) => addStock(o)} load={loadStock} placeholder="Search product in this location…" disabled={!from} />
            </Card>
          )}
          {showBad && (
            <Card title="Faulty units in warranty bad stock" pad={false}>
              <div className="divide-y divide-line">
                {bad.data?.map((b: any) => {
                  const on = lines.some(l => l.claim_id === b.claim_id);
                  return (
                    <label key={b.claim_id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <input type="checkbox" className="accent-[var(--brand)]" checked={on} onChange={() => setLines(on ? lines.filter(l => l.claim_id !== b.claim_id) : [...lines, { key: uid(), claim_id: b.claim_id, product_id: b.product_id, name: b.name, code: b.code, qty: 1, serial: b.serial, cost: b.cost, action: 'restock' }])} />
                      <span className="flex-1 text-sm"><b>{b.name}</b> <span className="text-xs text-muted">{b.code} · claim {b.no} · {b.serial ?? 'no serial'}</span></span>
                      <span className="num text-sm">{money(b.cost)}</span>
                    </label>
                  );
                })}
                {bad.data && !bad.data.length && <p className="px-4 py-8 text-center text-sm text-muted">No faulty units waiting. Units enter bad stock when a warranty claim is resolved by replacement.</p>}
              </div>
            </Card>
          )}
          <Card title={`Items (${lines.length})`} pad={false}>
            {!lines.length ? <p className="px-4 py-10 text-center text-sm text-muted">No items yet.</p> : (
              <table className="w-full text-[13px]">
                <thead><tr className="text-[11px] uppercase tracking-wide text-muted"><th className="px-4 py-2 text-left">Item</th>{kind === 'self_bad' && <th className="px-2 py-2 text-left">Action</th>}<th className="w-28 px-2 py-2 text-right">{kind === 'delivery' || kind === 'receive' ? 'Now' : 'Qty'}</th>{(showStockPicker) && <th className="px-2 py-2 text-left">Serials</th>}<th className="w-10" /></tr></thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.key} className="border-t border-line">
                      <td className="px-4 py-2"><p className="font-medium">{l.name}</p><p className="text-xs text-muted">{l.code}{l.max !== undefined && ` · ${num(l.max)} ${kind === 'delivery' || kind === 'receive' ? 'pending' : 'available'}`}{l.serial && l.claim_id ? ` · ${l.serial}` : ''}</p></td>
                      {kind === 'self_bad' && <td className="px-2 py-2"><Select inputSize="sm" value={l.action} onChange={e => set(l.key, { action: e.target.value })}><option value="restock">Repaired → back to stock</option><option value="writeoff">Write off</option></Select></td>}
                      <td className="px-2 py-2"><Input inputSize="sm" type="number" className="num text-right" min={0} max={l.max} value={l.qty} readOnly={!!l.claim_id} onChange={e => set(l.key, { qty: Math.max(0, Math.min(l.max ?? Infinity, Number(e.target.value) || 0)) })} /></td>
                      {showStockPicker && <td className="px-2 py-2">{(l.mode === 'serial' || l.mode === 'imei') ? <SerialPick loc={from} productId={l.product_id!} value={l.serial ?? ''} onChange={v => set(l.key, { serial: v, qty: v.split(',').filter(Boolean).length || l.qty })} /> : <span className="text-xs text-muted">—</span>}</td>}
                      <td className="px-2"><IconButton label="Remove" onClick={() => setLines(lines.filter(x => x.key !== l.key))}><X className="size-4" /></IconButton></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
        <Card className="lg:sticky lg:top-[72px] lg:self-start">
          {kind === 'disposal' && (
            <div className="mb-3 grid gap-3">
              <Field label="Recovered amount" hint="Money recovered from scrap/salvage (optional)"><Input type="number" className="num text-right" value={recover} onChange={e => setRecover(e.target.value === '' ? '' : Number(e.target.value))} /></Field>
              <Field label="Recovered into"><Combobox value={recLedger} onChange={setRecLedger} options={setup.data.money as Opt[]} placeholder="Cash" /></Field>
            </div>
          )}
          {kind === 'bad_claim' && <Field label="Claim amount" hint={`Defaults to the cost of selected units (${money(badCost)} for warranty items)`} className="mb-3"><Input type="number" className="num text-right" value={amount} onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))} /></Field>}
          <Field label="Note"><Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} /></Field>
          <p className="mt-3 text-sm text-muted">{lines.length} line(s) · {num(lines.reduce((a, l) => a + l.qty, 0))} unit(s)</p>
          <Button variant="primary" size="lg" className="mt-3 w-full" loading={busy} disabled={!lines.length} onClick={save}>Save</Button>
        </Card>
      </div>
    </div>
  );
}

function SerialPick({ loc, productId, value, onChange }: { loc: string; productId: number; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<string[]>([]);
  useEffect(() => { if (open) rpc('stock.serialsAt', loc, productId).then(setList).catch(() => {}); }, [open, loc, productId]);
  const sel = value.split(',').filter(Boolean);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className={cx('rounded-md px-2 py-1 text-xs font-medium', sel.length ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn')}>{sel.length ? `${sel.length} selected` : 'Choose serials'}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 max-h-64 w-56 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-pop thin-scroll">
            {list.map(s => <label key={s} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-surface-2"><input type="checkbox" className="accent-[var(--brand)]" checked={sel.includes(s)} onChange={() => onChange((sel.includes(s) ? sel.filter(x => x !== s) : [...sel, s]).join(','))} /><span className="font-mono">{s}</span></label>)}
            {!list.length && <p className="px-2 py-3 text-xs text-muted">No serials here.</p>}
          </div>
        </>
      )}
    </div>
  );
}

export function StockList({ kind }: { kind: SKind }) {
  return <Guard module={META[kind].module}><SList kind={kind} /></Guard>;
}

function SList({ kind }: { kind: SKind }) {
  const m = META[kind];
  const router = useRouter();
  const { can } = useSession();
  const { toast, confirm } = useUI();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const args = useMemo(() => ({ q, from, to, page, size: 25 }), [q, from, to, page]);
  const { data, loading, error, reload } = useRpc('stock.listStockDocs', [kind, args], [kind, JSON.stringify(args)]);
  const del = async (r: any) => {
    if (!(await confirm({ title: `Delete ${r.no}?`, body: 'Stock movements and accounting entries are reversed.', confirm: 'Delete', danger: true }))) return;
    try { await rpc('stock.deleteStockDoc', r.id); toast('Deleted'); reload(); } catch (e: any) { toast(e.message, 'error'); }
  };
  const cols: Col[] = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'no', label: kind === 'delivery' || kind === 'receive' ? 'Challan No' : kind.includes('bad') ? 'Claim No' : 'No', render: r => <Link href={`/stock/${kind}/${r.id}`} className="font-medium text-brand hover:underline" onClick={e => e.stopPropagation()}>{r.no}</Link> },
    ...(kind === 'delivery' || kind === 'receive' ? [{ key: 'doc_no', label: kind === 'delivery' ? 'Invoice No' : 'Purchase No' } as Col] : []),
    ...(kind.startsWith('transfer') || kind === 'disposal' ? [{ key: 'from_name', label: 'From' } as Col] : []),
    ...(kind.startsWith('transfer') ? [{ key: 'to_name', label: 'To' } as Col] : []),
    ...(kind === 'bad_claim' ? [{ key: 'supplier', label: 'Supplier' } as Col] : []),
    { key: 'qty', label: 'Qty', type: 'number' },
    ...(kind === 'disposal' || kind.includes('bad') ? [{ key: 'amount', label: kind === 'disposal' ? 'Disposed value' : 'Amount', type: 'money' } as Col] : []),
    ...(kind === 'disposal' ? [{ key: 'recover', label: 'Recovered', type: 'money' } as Col] : []),
    { key: 'note', label: 'Note', render: r => <span className="line-clamp-1 text-xs text-muted">{r.note}</span> },
    { key: 'created_by_name', label: 'By', render: r => <span className="text-xs text-muted">{r.created_by_name}</span> },
    { key: '__a', label: '', align: 'right', width: '1%', render: r => (
      <div className="flex justify-end gap-0.5" onClick={e => e.stopPropagation()}>
        <IconButton label="View" onClick={() => router.push(`/stock/${kind}/${r.id}`)}><Eye className="size-4" /></IconButton>
        {can(m.module, 'delete') && <IconButton label="Delete" className="hover:!text-bad" onClick={() => del(r)}><Trash2 className="size-4" /></IconButton>}
      </div>
    ) },
  ];
  return (
    <div>
      <PageHeader title={m.plural} subtitle={m.hint} actions={<><HistoryButton entities={[kind]} />{can(m.module, 'write') && <Button variant="primary" icon={<Plus className="size-4" />} href={`/stock/${kind}/new`}>New</Button>}</>} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={q} onChange={v => { setQ(v); setPage(1); }} placeholder="Search number, invoice, note…" className="w-full sm:w-72" />
          <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); setPage(1); }} />
        </div>
        <DataTable columns={cols} rows={data?.rows ?? []} loading={loading} onRowClick={r => router.push(`/stock/${kind}/${r.id}`)} />
        {data && <Pager page={page} size={25} total={data.total} onPage={setPage} />}
      </Card>
    </div>
  );
}

export function StockDocView({ id, kind }: { id: number; kind: SKind }) {
  const { data, error } = useRpc('stock.getStockDoc', [id], [id]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const d = data.doc;
  return (
    <div>
      <PageHeader back={`/stock/${kind}`} title={d.no} subtitle={`${META[kind].label} · ${date(d.date)} · by ${d.created_by_name ?? ''}`} actions={<Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Print challan</Button>} />
      <div className="print-area mx-auto w-[210mm] max-w-full rounded-xl border border-line bg-white p-[12mm] text-[12px] text-black shadow-card">
        <div className="flex items-start justify-between border-b-2 border-black pb-3">
          <div><p className="text-xl font-bold">{data.company?.name}</p><p className="text-xs">{data.company?.address}</p></div>
          <div className="text-right"><p className="text-lg font-bold uppercase">{META[kind].label}</p><p className="font-semibold">{d.no}</p><p className="text-xs">Date: {date(d.date)}</p></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
          {d.from_name && <p><b>From:</b> {d.from_name}</p>}
          {d.to_name && <p><b>To:</b> {d.to_name}</p>}
          {d.doc_no && <p><b>Invoice:</b> {d.doc_no} {d.customer && `· ${d.customer}`}</p>}
          {d.supplier && <p><b>Supplier:</b> {d.supplier}</p>}
          {Number(d.amount) > 0 && <p><b>Amount:</b> {money(d.amount)}</p>}
          {Number(d.recover) > 0 && <p><b>Recovered:</b> {money(d.recover)}</p>}
        </div>
        <table className="mt-4 w-full border-collapse text-[11.5px]">
          <thead><tr className="border-y border-black bg-neutral-100 text-left"><th className="px-2 py-1.5">SL</th><th className="px-2 py-1.5">Item</th><th className="px-2 py-1.5">Color & size</th><th className="px-2 py-1.5">Serial</th><th className="px-2 py-1.5 text-right">Qty</th></tr></thead>
          <tbody>{data.lines.map((l: any, i: number) => <tr key={l.id} className="border-b border-neutral-300"><td className="px-2 py-1.5">{i + 1}</td><td className="px-2 py-1.5">{l.name} <span className="text-neutral-500">{l.code}</span>{l.note && <span className="block text-[10.5px] text-neutral-500">{l.note}</span>}</td><td className="px-2 py-1.5">{[l.color, l.size].filter(Boolean).join(' / ')}</td><td className="px-2 py-1.5 font-mono text-[10.5px]">{l.serial}</td><td className="num px-2 py-1.5 text-right">{num(l.qty)}</td></tr>)}</tbody>
        </table>
        {d.note && <p className="mt-3 text-xs"><b>Note:</b> {d.note}</p>}
        <div className="mt-20 grid grid-cols-3 gap-8 text-center text-[11px]">{['Delivered by', 'Received by', 'Authorised'].map(s => <div key={s} className="border-t border-black pt-1">{s}</div>)}</div>
      </div>
    </div>
  );
}

// ───────── Stock status (branch / warehouse / combined) ─────────
export function StockStatus({ scope }: { scope: 'branch' | 'warehouse' | 'combined' }) {
  return <Guard module="inventory"><Status scope={scope} /></Guard>;
}

function Status({ scope }: { scope: 'branch' | 'warehouse' | 'combined' }) {
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState<number | null>(null);
  const [cat, setCat] = useState<number | null>(null);
  const [only, setOnly] = useState(true);
  const [view, setView] = useState<number | null>(null);
  const setup = useRpc('docs.docSetup', ['sale'], []);
  const locs = useRpc('crud.lookup', [scope === 'warehouse' ? 'warehouse' : 'branch'], [scope]);
  const { data, loading } = useRpc('stock.stockStatus', [{ scope, loc_id: loc ?? undefined, q, category_id: cat ?? undefined, only_stock: only }], [scope, loc, q, cat, only]);
  const title = { branch: 'Branch Stock Status', warehouse: 'Warehouse Stock Status', combined: 'All Over Stock (Warehouse + Branch)' }[scope];
  const cols: Col[] = [
    { key: 'image', label: '', type: 'image', width: '44px' },
    { key: 'name', label: 'Item', render: r => <button className="text-left" onClick={() => setView(r.product_id)}><p className="font-medium hover:text-brand">{r.name}</p><p className="text-xs text-muted">{r.code}{r.color ? ` · ${r.color}` : ''}{r.size ? ` · ${r.size}` : ''}{r.warehouse ? ` · ${r.warehouse}` : ''}</p></button> },
    { key: 'purchase', label: 'Purchase', type: 'number', total: true },
    ...(scope !== 'warehouse' ? [{ key: 'received', label: 'Received', type: 'number', total: true } as Col] : []),
    { key: 'preturn', label: 'P.Return', type: 'number', total: true },
    { key: 't_in', label: 'Transfer in', type: 'number', total: true },
    { key: 't_out', label: 'Transfer out', type: 'number', total: true },
    ...(scope !== 'warehouse' ? [
      { key: 'sold', label: 'Sold', type: 'number', total: true } as Col, { key: 'delivered', label: 'Delivered', type: 'number', total: true } as Col,
      { key: 'undelivered', label: 'Undelivered', type: 'number', total: true } as Col, { key: 'sreturn', label: 'S.Return', type: 'number', total: true } as Col,
      { key: 'replaced', label: 'Replace', type: 'number', total: true } as Col, { key: 'exchange', label: 'Exchange', type: 'number', total: true } as Col,
    ] : []),
    { key: 'disposed', label: 'Disposed', type: 'number', total: true },
    { key: 'balance', label: 'In stock', align: 'right', total: true, type: 'number', render: r => <span className={cx('num font-semibold', r.balance <= 0 ? 'text-bad' : 'text-ink')}>{num(r.balance)}</span> },
    { key: 'avg_cost', label: 'Avg cost', type: 'money', total: false },
    { key: 'value', label: 'Value', type: 'money', total: true },
  ];
  const rows = data ?? [];
  return (
    <div>
      <PageHeader title={title} subtitle={`${rows.length} item line(s) · value ${money(rows.reduce((a: number, r: any) => a + r.value, 0))}`}
        actions={<><Button variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadCsv(title, cols.filter(c => c.key !== 'image').map(c => String(c.label)), rows.map((r: any) => cols.filter(c => c.key !== 'image').map(c => c.key === 'name' ? `${r.name} ${r.code}` : r[c.key])))}>CSV</Button><Button variant="ghost" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button></>} />
      <Card pad={false} className="print-area">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 no-print">
          <SearchInput value={q} onChange={setQ} placeholder="Search item, code, model…" className="w-full sm:w-72" />
          {scope !== 'combined' && <div className="w-52"><Combobox value={loc} onChange={setLoc} options={(locs.data ?? []) as Opt[]} placeholder={scope === 'warehouse' ? 'All warehouses' : 'All branches'} /></div>}
          <div className="w-52"><Combobox value={cat} onChange={setCat} options={(setup.data?.categories ?? []).map((c: any) => ({ value: c.id, label: c.name }))} placeholder="All categories" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--brand)]" checked={only} onChange={e => setOnly(e.target.checked)} />Hide zero balance</label>
        </div>
        <DataTable dense columns={cols} rows={rows} loading={loading} rowKey="__k" totals />
      </Card>
      <ProductDetails id={view} onClose={() => setView(null)} />
    </div>
  );
}

