'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, ClipboardCheck, PackageCheck, Plus, Printer, Search, Trash2, Wrench } from 'lucide-react';
import { rpc, useRpc } from '@/lib/client/rpc';
import { date, dateTime, todayISO } from '@/lib/format';
import { Badge, Button, Field, IconButton, Input, KeyVal, Loading, PageHeader, Select, Tabs, Textarea } from '@/components/ui/primitives';
import { Combobox, RefSelect, type Opt } from '@/components/ui/combobox';
import { DataTable, SearchInput, type Col } from '@/components/ui/table';
import { Drawer, Modal, useUI } from '@/components/ui/overlay';
import { HistoryButton } from '@/components/history';
import { Guard, useSession } from '@/components/shell/session';

const STATUS: Record<string, [string, 'green' | 'amber' | 'blue' | 'red' | 'gray' | 'brand']> = {
  received: ['Received', 'amber'], checked: ['Checked', 'blue'], in_service: ['At service center', 'amber'], ready: ['Ready to deliver', 'green'],
  delivered: ['Delivered', 'green'], replaced: ['Replaced', 'blue'], rejected: ['Rejected', 'red'], sent_supplier: ['Claimed to supplier', 'brand'],
  written_off: ['Written off', 'gray'], restocked: ['Restocked', 'green'],
};
export const ClaimBadge = ({ s }: { s: string }) => <Badge tone={STATUS[s]?.[1] ?? 'gray'}>{STATUS[s]?.[0] ?? s}</Badge>;

type Stage = 'claims' | 'checking' | 'manage' | 'delivered';
const TITLES: Record<Stage, [string, string]> = {
  claims: ['Warranty claims', 'Receive faulty products from customers. Look up by serial or invoice number.'],
  checking: ['Product checking', 'Technician verdict for received claims.'],
  manage: ['Manage product', 'Send to a service center, mark repaired, or replace from stock.'],
  delivered: ['Warranty delivered', 'Hand repaired or replaced products back to customers.'],
};

export function WarrantyPage({ stage }: { stage: Stage }) {
  return <Guard module="warranty"><Inner stage={stage} /></Guard>;
}

function Inner({ stage }: { stage: Stage }) {
  const { can } = useSession();
  const { toast, confirm } = useUI();
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [sub, setSub] = useState<'pending' | 'done'>('pending');
  const listStage = stage === 'delivered' ? (sub === 'pending' ? undefined : 'delivered') : stage === 'claims' ? 'all' : stage;
  const { data, loading, reload } = useRpc('ops.listClaims', [{ stage: listStage as any, q, status: stage === 'delivered' && sub === 'pending' ? 'ready' : undefined }], [stage, q, sub]);
  const [creating, setCreating] = useState(false);
  const [act, setAct] = useState<{ claim: any; mode: 'check' | 'manage' | 'deliver' } | null>(null);
  const [view, setView] = useState<number | null>(null);
  useEffect(() => { if (params.get('new')) setCreating(true); }, [params]);

  const del = async (r: any) => {
    if (!(await confirm({ title: `Delete claim ${r.no}?`, confirm: 'Delete', danger: true }))) return;
    try { await rpc('ops.deleteClaim', r.id); toast('Claim deleted'); reload(); } catch (e: any) { toast(e.message, 'error'); }
  };
  const cols: Col[] = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'no', label: 'Claim no', render: r => <button className="font-medium text-brand hover:underline" onClick={() => setView(r.id)}>{r.no}</button> },
    { key: 'product', label: 'Product', render: r => <div><p className="font-medium">{r.product}</p><p className="text-xs text-muted">{r.code}</p></div> },
    { key: 'serial', label: 'Serial', render: r => <span className="font-mono text-xs">{r.serial}</span> },
    { key: 'customer', label: 'Customer', render: r => <div className="text-[13px]">{r.customer}<p className="text-xs text-muted">{r.mobile}</p></div> },
    { key: 'invoice', label: 'Invoice' },
    { key: 'sale_date', label: 'Sales date', type: 'date' },
    { key: 'warranty_expiry', label: 'Warranty expiry', render: r => r.warranty_expiry ? <span className={r.warranty_expiry < todayISO() ? 'text-bad' : ''}>{date(r.warranty_expiry)}</span> : '—' },
    ...(stage !== 'claims' ? [{ key: 'claim_note', label: 'Claim note', render: (r: any) => <span className="line-clamp-2 text-xs">{r.claim_note}</span> } as Col] : []),
    ...(stage === 'checking' || stage === 'manage' ? [{ key: 'check_note', label: 'Checking note', render: (r: any) => <span className="line-clamp-2 text-xs">{r.check_note}</span> } as Col] : []),
    ...(stage === 'manage' || stage === 'delivered' ? [{ key: 'delivery_note', label: 'Delivery note', render: (r: any) => <span className="line-clamp-2 text-xs">{r.service_center ? `${r.service_center}: ` : ''}{r.delivery_note}</span> } as Col] : []),
    { key: 'status', label: 'Status', render: r => <ClaimBadge s={r.status} /> },
    { key: '__a', label: '', align: 'right', render: r => (
      <div className="flex justify-end gap-1">
        {stage === 'checking' && ['received', 'checked'].includes(r.status) && can('warranty', 'edit') && <Button size="xs" variant="soft" icon={<ClipboardCheck className="size-3.5" />} onClick={() => setAct({ claim: r, mode: 'check' })}>Check</Button>}
        {stage === 'manage' && ['checked', 'in_service'].includes(r.status) && can('warranty', 'edit') && <Button size="xs" variant="soft" icon={<Wrench className="size-3.5" />} onClick={() => setAct({ claim: r, mode: 'manage' })}>Manage</Button>}
        {stage === 'delivered' && r.status === 'ready' && can('warranty', 'edit') && <Button size="xs" variant="success" icon={<PackageCheck className="size-3.5" />} onClick={() => setAct({ claim: r, mode: 'deliver' })}>Deliver</Button>}
        {stage === 'claims' && can('warranty', 'delete') && <IconButton label="Delete" className="hover:!text-bad" onClick={() => del(r)}><Trash2 className="size-4" /></IconButton>}
      </div>
    ) },
  ];
  return (
    <div>
      <PageHeader title={TITLES[stage][0]} subtitle={TITLES[stage][1]} actions={<><HistoryButton entities={['claim']} />{stage === 'claims' && can('warranty', 'write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New claim</Button>}</>} />
      {stage === 'delivered' && <Tabs className="mb-4" value={sub} onChange={setSub} tabs={[{ value: 'pending', label: 'Ready to deliver' }, { value: 'done', label: 'Delivered' }]} />}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Claim no, serial, product, customer, invoice…" className="w-full sm:w-80" />
        {data && <span className="ml-auto text-[13px] text-muted">{data.length} claim{data.length === 1 ? '' : 's'}</span>}
      </div>
      <DataTable bleed columns={cols} rows={data ?? []} loading={loading} />
      <NewClaim open={creating} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />
      <ClaimAction act={act} onClose={() => setAct(null)} onDone={() => { setAct(null); reload(); }} />
      <ClaimView id={view} onClose={() => setView(null)} />
    </div>
  );
}

function NewClaim({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useUI();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<any>(null);
  const [line, setLine] = useState<any>(null);
  const [serial, setSerial] = useState('');
  const [note, setNote] = useState('');
  const [manual, setManual] = useState<{ product_id: number | null; customer_name: string; mobile: string }>({ product_id: null, customer_name: '', mobile: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setQ(''); setFound(null); setLine(null); setSerial(''); setNote(''); setManual({ product_id: null, customer_name: '', mobile: '' }); } }, [open]);
  const lookup = async () => {
    const r = await rpc('ops.warrantyLookup', q);
    if (!r) { toast('Nothing found — enter the claim manually below.', 'warn'); setFound(false); return; }
    setFound(r);
    const l = r.serial ? r.lines.find((x: any) => x.product_id === r.serial_product_id) : r.lines.length === 1 ? r.lines[0] : null;
    setLine(l); setSerial(r.serial ?? '');
  };
  const save = async () => {
    setBusy(true);
    try {
      const payload = found && line
        ? { product_id: line.product_id, serial, sale_doc_id: found.doc.id, customer_id: found.customer?.id, customer_name: found.customer?.name, mobile: found.customer?.mobile, sale_date: found.doc.date, warranty_expiry: line.expiry, claim_note: note }
        : { product_id: manual.product_id, serial, customer_name: manual.customer_name, mobile: manual.mobile, claim_note: note };
      const r = await rpc('ops.saveClaim', payload);
      toast(`Claim ${r.no} received`); onSaved();
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Drawer open={open} onClose={onClose} title="New warranty claim" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save} disabled={!(line || manual.product_id)}>Receive claim</Button></>}>
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void lookup(); }}>
        <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Scan serial / IMEI or type invoice no" inputSize="lg" />
        <Button type="submit" size="lg" icon={<Search className="size-4" />}>Find</Button>
      </form>
      {found && (
        <div className="mt-5 space-y-4">
          <KeyVal items={[['Invoice', found.doc.no], ['Sold on', date(found.doc.date)], ['Customer', found.customer?.name], ['Mobile', found.customer?.mobile]]} />
          <Field label="Product">
            <div className="space-y-1.5">
              {found.lines.map((l: any) => (
                <label key={l.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${line?.id === l.id ? 'border-line-strong bg-surface-2' : 'border-line'}`}>
                  <input type="radio" checked={line?.id === l.id} onChange={() => setLine(l)} className="accent-[var(--brand)]" />
                  <span className="flex-1 text-sm"><b>{l.name}</b> <span className="text-xs text-muted">{l.code}</span></span>
                  {l.days ? <Badge tone={l.expired ? 'red' : 'green'}>{l.expired ? 'Expired' : 'In warranty'} · {date(l.expiry)}</Badge> : <Badge tone="gray">No warranty</Badge>}
                </label>
              ))}
            </div>
          </Field>
          {line && line.serials.length > 0 && <Field label="Serial"><Select value={serial} onChange={e => setSerial(e.target.value)}><option value="">—</option>{line.serials.map((s: string) => <option key={s}>{s}</option>)}</Select></Field>}
        </div>
      )}
      {found === false && (
        <div className="mt-5 grid gap-3">
          <Field label="Product" required><RefSelect refKey="product" value={manual.product_id} onChange={v => setManual({ ...manual, product_id: v })} /></Field>
          <Field label="Serial"><Input value={serial} onChange={e => setSerial(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Customer name"><Input value={manual.customer_name} onChange={e => setManual({ ...manual, customer_name: e.target.value })} /></Field><Field label="Mobile"><Input value={manual.mobile} onChange={e => setManual({ ...manual, mobile: e.target.value })} /></Field></div>
        </div>
      )}
      {(found || found === false) && <Field label="Problem / claim note" className="mt-4"><Textarea rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="What is wrong with the product?" /></Field>}
    </Drawer>
  );
}

function ClaimAction({ act, onClose, onDone }: { act: { claim: any; mode: 'check' | 'manage' | 'deliver' } | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useUI();
  const [note, setNote] = useState('');
  const [verdict, setVerdict] = useState<'ok' | 'faulty' | 'repairable' | 'rejected'>('repairable');
  const [action, setAction] = useState<'service' | 'ready' | 'replace' | 'reject'>('ready');
  const [center, setCenter] = useState<number | null>(null);
  const [rp, setRp] = useState<number | null>(null);
  const [rs, setRs] = useState('');
  const [serials, setSerials] = useState<Opt[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (act) { setNote(act.mode === 'check' ? act.claim.check_note ?? '' : ''); setRp(act.claim.product_id); setRs(''); setCenter(null); } }, [act]);
  useEffect(() => { if (rp) rpc('docs.availableSerials', rp).then(r => setSerials(r.map((x: any) => ({ value: x.serial, label: x.serial })))).catch(() => setSerials([])); }, [rp]);
  if (!act) return null;
  const run = async () => {
    setBusy(true);
    try {
      if (act.mode === 'check') await rpc('ops.checkClaim', act.claim.id, { check_note: note, check_status: verdict });
      else if (act.mode === 'manage') await rpc('ops.manageClaim', act.claim.id, { action, service_center_id: center ?? undefined, note, replace_product_id: rp ?? undefined, replace_serial: rs || undefined });
      else await rpc('ops.deliverClaim', act.claim.id, note);
      toast('Claim updated'); onDone();
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${act.mode === 'check' ? 'Check' : act.mode === 'manage' ? 'Manage' : 'Deliver'} — ${act.claim.no}`} subtitle={`${act.claim.product} ${act.claim.serial ? `· ${act.claim.serial}` : ''}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={run} icon={<CheckCircle2 className="size-4" />}>Save</Button></>}>
      {act.claim.claim_note && <p className="mb-3 rounded-lg bg-surface-2 p-3 text-sm"><b>Customer complaint:</b> {act.claim.claim_note}</p>}
      {act.mode === 'check' && <Field label="Verdict"><Select value={verdict} onChange={e => setVerdict(e.target.value as any)}><option value="repairable">Faulty — repairable</option><option value="faulty">Faulty — needs replacement</option><option value="ok">No fault found</option><option value="rejected">Not covered — reject</option></Select></Field>}
      {act.mode === 'manage' && (
        <div className="grid gap-3">
          <Field label="Action"><Select value={action} onChange={e => setAction(e.target.value as any)}><option value="ready">Repaired in-house — ready to deliver</option><option value="service">Send to service center</option><option value="replace">Replace with a new unit from stock</option><option value="reject">Reject claim</option></Select></Field>
          {action === 'service' && <Field label="Service center" required><RefSelect refKey="service_center" value={center} onChange={setCenter} /></Field>}
          {action === 'replace' && <div className="grid grid-cols-2 gap-3"><Field label="Replacement product"><RefSelect refKey="product" value={rp} onChange={setRp} /></Field><Field label="Replacement serial"><Combobox value={rs} onChange={v => setRs(v ?? '')} options={serials} placeholder={serials.length ? 'Choose serial' : 'No serials (non-serial item)'} /></Field></div>}
          {action === 'replace' && <p className="text-xs text-muted">The new unit leaves stock and the faulty unit moves to warranty bad stock (handle it later via Claim To Supplier or Self Stock Manage).</p>}
        </div>
      )}
      <Field label="Note" className="mt-3"><Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

function ClaimView({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data } = useRpc(id ? 'ops.getClaim' : null, [id ?? 0], [id]);
  const c = data?.claim;
  return (
    <Drawer open={!!id} onClose={onClose} title={c ? `Claim ${c.no}` : 'Claim'} footer={<Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Print claim slip</Button>}>
      {!c ? <Loading /> : (
        <div className="print-area space-y-5">
          <div className="hidden print:block"><p className="text-lg font-bold">{data.company?.name}</p><p className="text-sm">Warranty claim slip {c.no}</p></div>
          <div className="flex items-center gap-2"><ClaimBadge s={c.status} /></div>
          <KeyVal items={[['Product', `${c.product} (${c.code})`], ['Serial', c.serial], ['Customer', c.customer], ['Mobile', c.mobile], ['Invoice', c.invoice], ['Sold on', date(c.sale_date)], ['Warranty until', date(c.warranty_expiry)], ['Received', date(c.date)], ['Checked', c.checked_at ? dateTime(c.checked_at) : ''], ['Verdict', c.check_status], ['Service center', c.service_center], ['Replacement', c.replaced_product ? `${c.replaced_product} ${c.replaced_serial ?? ''}` : ''], ['Delivered', c.delivered_at ? dateTime(c.delivered_at) : '']]} />
          {c.claim_note && <div><p className="text-xs text-muted">Complaint</p><p className="text-sm">{c.claim_note}</p></div>}
          {c.check_note && <div><p className="text-xs text-muted">Checking note</p><p className="text-sm">{c.check_note}</p></div>}
          {c.delivery_note && <div><p className="text-xs text-muted">Delivery note</p><p className="text-sm">{c.delivery_note}</p></div>}
          <div className="no-print"><p className="mb-2 text-[13px] font-medium text-ink">Timeline</p>
            <ol className="relative space-y-3 border-l border-line pl-4">{data.history.map((h: any) => <li key={h.id} className="text-sm"><span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-line-strong" />{h.summary}<p className="text-xs text-muted">{h.user_name} · {dateTime(h.at)}</p></li>)}</ol>
          </div>
        </div>
      )}
    </Drawer>
  );
}

export function WarrantyStock() {
  const { data, loading } = useRpc('ops.warrantyStock', [], []);
  return (
    <Guard module="warranty">
      <PageHeader title="Warranty product stock" subtitle="Claims received vs delivered, and faulty units in bad stock." />
      <DataTable bleed loading={loading} rows={data ?? []} totals columns={[
          ...((data ?? []).some((r: any) => r.image) ? [{ key: 'image', label: '', type: 'image', width: '44px' } as Col] : []), { key: 'name', label: 'Name', render: r => <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.code}</p></div> },
          { key: 'claims_in', label: 'Claims in', type: 'number', total: true }, { key: 'delivered', label: 'Delivered', type: 'number', total: true }, { key: 'available', label: 'In process', type: 'number', total: true },
          { key: 'bad_in', label: 'Bad stock in', type: 'number', total: true }, { key: 'bad_out', label: 'Bad stock out', type: 'number', total: true }, { key: 'bad_available', label: 'Bad stock available', type: 'number', total: true },
        ]} />
    </Guard>
  );
}
