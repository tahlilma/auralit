'use client';
import { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle2, Eye, Plus, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { rpc, useRpc } from '@/lib/client/rpc';
import { date, money, monthStart, todayISO } from '@/lib/format';
import { Button, Card, cx, Field, IconButton, Input, Loading, PageHeader, Tabs } from '@/components/ui/primitives';
import { Combobox, RefSelect, useLookup } from '@/components/ui/combobox';
import { DataTable, SearchInput, type Col } from '@/components/ui/table';
import { Drawer, Modal, useUI } from '@/components/ui/overlay';
import { HistoryButton } from '@/components/history';
import { Guard, useSession } from '@/components/shell/session';

export function OfferAssign() {
  const { toast } = useUI();
  const { can } = useSession();
  const offers = useLookup('offer');
  const [offer, setOffer] = useState<number | null>(null);
  const [type, setType] = useState<'product' | 'brand' | 'category' | 'subcategory'>('product');
  const [target, setTarget] = useState<number | null>(null);
  const { data, reload, loading } = useRpc('ops.offerItems', [offer ?? undefined], [offer]);
  const loadProducts = useCallback(async (q: string) => (await rpc('docs.searchItems', 'sale', { q, size: 20 })).map((p: any) => ({ value: p.id, label: p.name, hint: p.code })), []);
  const add = async () => {
    if (!offer || !target) return;
    try { await rpc('ops.setOfferItems', offer, [{ target_type: type, target_id: target }]); toast('Offer assigned'); setTarget(null); reload(); } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <Guard module="offer">
      <PageHeader title="Set coupon & offer on item" subtitle="Attach an offer to a product, a whole brand, category or sub-category. The discount is applied automatically at the POS." actions={<Button href="/data/offer">Manage offers</Button>} />
      <Card title="Assign">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_1.4fr_auto] md:items-end">
          <Field label="Offer"><Combobox value={offer} onChange={setOffer} options={offers.options} placeholder="Choose offer" /></Field>
          <Field label="Apply to"><Tabs value={type} onChange={t => { setType(t); setTarget(null); }} tabs={[{ value: 'product', label: 'Item' }, { value: 'brand', label: 'Brand' }, { value: 'category', label: 'Cat.' }, { value: 'subcategory', label: 'Sub' }]} /></Field>
          <Field label={type === 'product' ? 'Product' : type === 'brand' ? 'Brand' : type === 'category' ? 'Category' : 'Sub-category'}>
            {type === 'product' ? <Combobox value={target} onChange={setTarget} load={loadProducts} placeholder="Search product code or name…" /> : <RefSelect refKey={type} value={target} onChange={setTarget} />}
          </Field>
          <Button variant="primary" icon={<Plus className="size-4" />} disabled={!offer || !target || !can('offer', 'write')} onClick={add}>Add</Button>
        </div>
      </Card>
      <Card className="mt-4" pad={false} title={offer ? 'Items in this offer' : 'All offer assignments'}>
        <DataTable loading={loading} rows={data ?? []} columns={[
          { key: 'offer', label: 'Offer' }, { key: 'target_type', label: 'Applies to', type: 'badge' }, { key: 'target', label: 'Item' },
          { key: '__a', label: '', align: 'right', render: r => can('offer', 'delete') && <IconButton label="Remove" onClick={async () => { await rpc('ops.removeOfferItem', r.id); reload(); }}><Trash2 className="size-4" /></IconButton> },
        ]} />
      </Card>
    </Guard>
  );
}

export function Rebates() {
  const { toast, confirm } = useUI();
  const { can } = useSession();
  const { data, loading, reload } = useRpc('ops.listRebates', [], []);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<number | null>(null);
  return (
    <Guard module="offer">
      <PageHeader title="Rebate claims" subtitle="Claim supplier-funded offer discounts back from suppliers." actions={<><HistoryButton entities={['rebate']} />{can('offer', 'write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Claim rebate</Button>}</>} />
      <DataTable bleed loading={loading} rows={data ?? []} columns={[
          { key: 'date', label: 'Date', type: 'date' }, { key: 'no', label: 'No', type: 'id' }, { key: 'supplier', label: 'Supplier' }, { key: 'from_date', label: 'From', type: 'date' }, { key: 'to_date', label: 'To', type: 'date' },
          { key: 'items', label: 'Items', type: 'number' }, { key: 'amount', label: 'Amount', type: 'money' },
          { key: '__a', label: '', align: 'right', render: r => <div className="flex justify-end"><IconButton label="View" onClick={() => setView(r.id)}><Eye className="size-4" /></IconButton>{can('offer', 'delete') && <IconButton label="Delete" onClick={async () => { if (await confirm({ title: `Delete ${r.no}?`, danger: true, confirm: 'Delete' })) { await rpc('ops.deleteRebate', r.id); toast('Deleted'); reload(); } }}><Trash2 className="size-4" /></IconButton>}</div> },
        ]} totals />
      <NewRebate open={open} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />
      <RebateView id={view} onClose={() => setView(null)} />
    </Guard>
  );
}

function NewRebate({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUI();
  const [sup, setSup] = useState<number | null>(null);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState<any[] | null>(null);
  const [sel, setSel] = useState<Set<any>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setRows(null); setSel(new Set()); } }, [open]);
  const load = async () => { if (!sup) return; const r = await rpc('ops.rebateCandidates', sup, from, to); setRows(r); setSel(new Set(r.map((x: any) => x.line_id))); };
  const total = (rows ?? []).filter(r => sel.has(r.line_id)).reduce((a, r) => a + r.rebate, 0);
  const save = async () => {
    setBusy(true);
    try { const r = await rpc('ops.saveRebate', { supplier_id: sup!, from, to, line_ids: [...sel] as number[] }); toast(`Rebate ${r.no} claimed`); onSaved(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Drawer open={open} onClose={onClose} title="Add rebate claim" width="max-w-4xl" footer={<><span className="mr-auto text-sm">Claim total <b className="num">{money(total)}</b></span><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!sel.size} onClick={save}>Save claim</Button></>}>
      <div className="grid gap-3 sm:grid-cols-[1fr_160px_160px_auto] sm:items-end">
        <Field label="Supplier"><RefSelect refKey="supplier_real" value={sup} onChange={setSup} /></Field>
        <Field label="From"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
        <Button onClick={load} disabled={!sup}>Find items</Button>
      </div>
      {rows && <div className="mt-4 rounded-xl border border-line"><DataTable dense selectable selected={sel} onSelect={setSel} rowKey="line_id" rows={rows} columns={[{ key: 'item', label: 'Item' }, { key: 'invoice', label: 'Invoice' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'customer', label: 'Customer' }, { key: 'qty', label: 'Qty', type: 'number' }, { key: 'rebate', label: 'Rebate', type: 'money' }]} empty={<p className="py-10 text-center text-sm text-muted">No sales under this supplier&apos;s offers in the period.</p>} /></div>}
    </Drawer>
  );
}

function RebateView({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data } = useRpc(id ? 'ops.getRebate' : null, [id ?? 0], [id]);
  return (
    <Drawer open={!!id} onClose={onClose} title={data ? `Rebate ${data.rebate.no}` : 'Rebate'} width="max-w-3xl" footer={<Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>}>
      {!data ? <Loading /> : (
        <div className="print-area">
          <p className="text-sm">{data.rebate.supplier} · {date(data.rebate.from_date)} – {date(data.rebate.to_date)} · <b>{money(data.rebate.amount)}</b></p>
          <div className="mt-3 rounded-xl border border-line"><DataTable dense rows={data.lines} columns={[{ key: 'item', label: 'Item' }, { key: 'invoice', label: 'Invoice' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'customer', label: 'Customer' }, { key: 'qty', label: 'Qty', type: 'number' }, { key: 'rebate', label: 'Rebate', type: 'money' }]} totals /></div>
        </div>
      )}
    </Drawer>
  );
}

export function Cheques() {
  const { toast } = useUI();
  const { can } = useSession();
  const [tab, setTab] = useState<'in' | 'out' | 'cleared'>('in');
  const [q, setQ] = useState('');
  const { data, loading, reload } = useRpc('vouchers.listCheques', [tab === 'cleared' ? { status: 'cleared', q } : { direction: tab, q }], [tab, q]);
  const [act, setAct] = useState<{ row: any; action: 'clear' | 'bounce' | 'pending' } | null>(null);
  const [note, setNote] = useState('');
  const cols: Col[] = [
    { key: 'date', label: 'Date', type: 'date' }, { key: 'ref_no', label: 'Invoice / receipt', type: 'id' }, { key: 'cheque_no', label: 'Cheque no', type: 'id' },
    { key: 'cheque_date', label: 'Cheque date', render: r => <span className={cx('whitespace-nowrap', r.status === 'pending' && r.cheque_date && r.cheque_date <= todayISO() && 'font-medium text-warn')}>{date(r.cheque_date)}</span> },
    { key: 'amount', label: 'Amount', type: 'money' }, { key: 'status', label: 'Status', type: 'badge' }, ...(tab === 'cleared' ? [{ key: 'mode', label: 'Mode' } as Col, { key: 'direction', label: 'In/Out', render: (r: any) => r.direction === 'in' ? 'Received' : 'Paid' } as Col] : []),
    { key: 'account', label: 'Account' }, { key: 'party', label: 'Party' }, ...((data ?? []).some((r: any) => r.note) ? [{ key: 'note', label: 'Note', render: (r: any) => <span className="text-xs text-muted">{r.note}</span> } as Col] : []),
    { key: '__a', label: '', align: 'right', render: r => can('acctra', 'edit') && (
      <div className="flex justify-end gap-1">
        {r.status !== 'cleared' && <Button size="xs" variant="success" icon={<CheckCircle2 className="size-3.5" />} onClick={() => { setNote(''); setAct({ row: r, action: 'clear' }); }}>Clear</Button>}
        {r.status === 'pending' && <Button size="xs" variant="dangerOutline" icon={<Ban className="size-3.5" />} onClick={() => { setNote(''); setAct({ row: r, action: 'bounce' }); }}>Bounce</Button>}
        {r.status !== 'pending' && <Button size="xs" icon={<RotateCcw className="size-3.5" />} onClick={() => { setNote(''); setAct({ row: r, action: 'pending' }); }}>Reset</Button>}
      </div>
    ) },
  ];
  const run = async () => {
    try { await rpc('vouchers.updateCheque', act!.row.id, act!.action, note || undefined); toast('Cheque updated'); setAct(null); reload(); } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <Guard module="acctra">
      <PageHeader title="Cheque management" subtitle="Cheques recorded on invoices and vouchers. Clearing marks them done; bouncing reverses the money against the party." actions={<HistoryButton entities={['cheque']} />} />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'in', label: 'Received' }, { value: 'out', label: 'Issued' }, { value: 'cleared', label: 'Cleared' }]} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Cheque no, reference, party…" className="w-full sm:w-80" />
        {data && <span className="ml-auto text-[13px] text-muted">{data.length} cheque{data.length === 1 ? '' : 's'}</span>}
      </div>
      <DataTable bleed loading={loading} rows={data ?? []} columns={cols} totals />
      <Modal open={!!act} onClose={() => setAct(null)} title={act ? `${act.action === 'clear' ? 'Clear' : act.action === 'bounce' ? 'Bounce' : 'Reset'} cheque ${act.row.cheque_no}` : ''} size="sm"
        footer={<><Button onClick={() => setAct(null)}>Cancel</Button><Button variant={act?.action === 'bounce' ? 'danger' : 'primary'} onClick={run}>Confirm</Button></>}>
        {act?.action === 'bounce' && <p className="mb-3 text-sm text-ink-2">The {money(act.row.amount)} will be moved back to the party&apos;s balance.</p>}
        <Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} /></Field>
      </Modal>
    </Guard>
  );
}

