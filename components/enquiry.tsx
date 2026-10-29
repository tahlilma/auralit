'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquarePlus, Plus, Trash2 } from 'lucide-react';
import { rpc, useRpc } from '@/lib/client/rpc';
import { date, dateTime, todayISO } from '@/lib/format';
import { Badge, Button, Card, Field, IconButton, Input, KeyVal, Loading, PageHeader, Select, Tabs, Textarea } from '@/components/ui/primitives';
import { Combobox, RefSelect, useLookup } from '@/components/ui/combobox';
import { DataTable, DateRange, SearchInput, type Col } from '@/components/ui/table';
import { Drawer, useUI } from '@/components/ui/overlay';
import { HistoryButton } from '@/components/history';
import { Guard, useSession } from '@/components/shell/session';

const STATUS = [{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'finished', label: 'Finished' }];

export function EnquiryPage() {
  return <Guard module="enquiry"><Inner /></Guard>;
}

function Inner() {
  const { can } = useSession();
  const { toast, confirm } = useUI();
  const params = useSearchParams();
  const [tab, setTab] = useState<'active' | 'due' | 'all' | 'finished'>('active');
  const [q, setQ] = useState('');
  const [product, setProduct] = useState('');
  const [location, setLocation] = useState<string | null>(null);
  const [action, setAction] = useState<number | null>(null);
  const [type, setType] = useState<number | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [open, setOpen] = useState<number | null>(Number(params.get('open')) || null);
  const locs = useLookup('location');
  const actions = useLookup('enquiry_action');
  const types = useLookup('enquiry_type');
  const args = { q, product, location: location ?? undefined, action_id: action ?? undefined, type_id: type ?? undefined, from, to, status: tab === 'all' || tab === 'due' ? undefined : tab, due: tab === 'due' };
  const { data, loading, reload } = useRpc('ops.listEnquiries', [args], [JSON.stringify(args)]);

  const save = async () => {
    try {
      const r = await rpc('ops.saveEnquiry', form!, form!.id);
      toast(form!.id ? 'Enquiry updated' : `Enquiry ${(r as any).no ?? ''} saved`); setForm(null); reload();
    } catch (e: any) { toast(e.message, 'error'); }
  };
  const cols: Col[] = [
    { key: 'date', label: 'Enquiry Date', type: 'date' },
    { key: 'customer_name', label: 'Customer', render: r => <div><p className="font-medium">{r.customer_name}</p><p className="text-xs text-muted">{r.mobile} · {r.no}</p></div> },
    { key: 'product_name', label: 'Model' }, { key: 'location', label: 'Location' }, { key: 'ppdate', label: 'P.Purchase', type: 'date' },
    { key: 'source', label: 'Source' }, { key: 'type', label: 'Type' },
    { key: 'next_followup', label: 'Follow-Up', render: r => r.next_followup ? <span className={r.status === 'active' && r.next_followup <= todayISO() ? 'font-medium text-bad' : ''}>{date(r.next_followup)}</span> : '—' },
    { key: 'status', label: 'Status', type: 'badge' }, { key: 'action', label: 'C.Action' },
    { key: 'followups', label: '#', type: 'number' },
    { key: '__a', label: '', align: 'right', render: r => can('enquiry', 'delete') && <IconButton label="Delete" className="hover:!text-bad" onClick={async e => { e.stopPropagation(); if (await confirm({ title: 'Delete enquiry?', danger: true, confirm: 'Delete' })) { await rpc('ops.deleteEnquiry', r.id); reload(); } }}><Trash2 className="size-4" /></IconButton> },
  ];
  return (
    <div>
      <PageHeader title="Customer Enquiry" subtitle="Capture sales leads, schedule follow-ups and track the course of action."
        actions={<><HistoryButton entities={['enquiry']} />{can('enquiry', 'write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setForm({ date: todayISO(), status: 'active' })}>New enquiry</Button>}</>} />
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'active', label: 'Active' }, { value: 'due', label: 'Follow-up due' }, { value: 'finished', label: 'Finished' }, { value: 'all', label: 'All' }]} />
          <SearchInput value={q} onChange={setQ} placeholder="Enquiry no, customer or mobile…" className="w-full sm:w-64" />
          <Input value={product} onChange={e => setProduct(e.target.value)} placeholder="Product / model" className="w-40" />
          <div className="w-44"><Combobox value={location} onChange={setLocation} options={locs.options} placeholder="Location" /></div>
          <div className="w-40"><Combobox value={action} onChange={setAction} options={actions.options} placeholder="C.O.A" /></div>
          <div className="w-40"><Combobox value={type} onChange={setType} options={types.options} placeholder="Type" /></div>
          <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
        </div>
        <DataTable columns={cols} rows={data ?? []} loading={loading} onRowClick={r => setOpen(r.id)} />
      </Card>
      <Drawer open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit enquiry' : 'New enquiry'} footer={<><Button onClick={() => setForm(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
        {form && <EnquiryForm v={form} set={p => setForm({ ...form, ...p })} />}
      </Drawer>
      <FollowUp id={open} onClose={() => setOpen(null)} onEdit={e => { setOpen(null); setForm(e); }} onChanged={reload} />
    </div>
  );
}

function EnquiryForm({ v, set }: { v: Record<string, any>; set: (p: Record<string, any>) => void }) {
  const loadProducts = useCallback(async (q: string) => (await rpc('docs.searchItems', 'sale', { q, size: 15 })).map((p: any) => ({ value: p.id, label: p.name, hint: p.code })), []);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Customer name" required><Input autoFocus value={v.customer_name ?? ''} onChange={e => set({ customer_name: e.target.value })} placeholder="e.g. Md. Nur-e-Alam" /></Field>
      <Field label="Phone / mobile"><Input value={v.mobile ?? ''} onChange={e => set({ mobile: e.target.value })} /></Field>
      <Field label="Required model" className="sm:col-span-2"><Combobox value={v.product_id ?? null} valueLabel={v.product_name} load={loadProducts} onChange={(id, o) => set({ product_id: id, product_name: o?.label ?? '' })} placeholder="Type product code, name or model…" /></Field>
      {!v.product_id && <Field label="…or describe the product" className="sm:col-span-2"><Input value={v.product_name ?? ''} onChange={e => set({ product_name: e.target.value })} /></Field>}
      <Field label="Location"><RefSelect refKey="location" value={v.location} onChange={x => set({ location: x })} /></Field>
      <Field label="Type"><RefSelect refKey="enquiry_type" value={v.type_id} onChange={x => set({ type_id: x })} /></Field>
      <Field label="Source"><RefSelect refKey="enquiry_source" value={v.source_id} onChange={x => set({ source_id: x })} /></Field>
      <Field label="Course of action"><RefSelect refKey="enquiry_action" value={v.action_id} onChange={x => set({ action_id: x })} /></Field>
      <Field label="Enquiry date"><Input type="date" value={v.date ?? ''} onChange={e => set({ date: e.target.value })} /></Field>
      <Field label="Status"><Select value={v.status ?? 'active'} onChange={e => set({ status: e.target.value })}>{STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
      <Field label="Probable purchase date"><Input type="date" value={v.ppdate ?? ''} onChange={e => set({ ppdate: e.target.value })} /></Field>
      <Field label="Next follow-up date"><Input type="date" value={v.next_followup ?? ''} onChange={e => set({ next_followup: e.target.value })} /></Field>
      <Field label="Remarks" className="sm:col-span-2"><Textarea value={v.remarks ?? ''} onChange={e => set({ remarks: e.target.value })} /></Field>
    </div>
  );
}

function FollowUp({ id, onClose, onEdit, onChanged }: { id: number | null; onClose: () => void; onEdit: (e: any) => void; onChanged: () => void }) {
  const { toast } = useUI();
  const { can } = useSession();
  const { data, reload } = useRpc(id ? 'ops.getEnquiry' : null, [id ?? 0], [id]);
  const [f, setF] = useState<Record<string, any>>({});
  useEffect(() => { if (data) setF({ date: todayISO(), status: data.enquiry.status, action_id: data.enquiry.action_id, next_followup: '', details: '' }); }, [data]);
  const e = data?.enquiry;
  const add = async () => {
    if (!f.details?.trim()) { toast('Write the follow-up details', 'warn'); return; }
    try { await rpc('ops.addFollowup', id!, f as any); toast('Follow-up added'); reload(); onChanged(); } catch (err: any) { toast(err.message, 'error'); }
  };
  return (
    <Drawer open={!!id} onClose={onClose} title={e ? `${e.customer_name} — ${e.no}` : 'Enquiry'} width="max-w-2xl" footer={e && can('enquiry', 'edit') && <Button onClick={() => onEdit(e)}>Edit enquiry</Button>}>
      {!e ? <Loading /> : (
        <div className="space-y-5">
          <KeyVal cols={3} items={[['Mobile', e.mobile], ['Model', e.product_name], ['Location', e.location], ['Type', e.type], ['Source', e.source], ['Course of action', e.action], ['Status', <Badge key="s">{e.status}</Badge>], ['Probable purchase', date(e.ppdate)], ['Next follow-up', date(e.next_followup)]]} />
          {e.remarks && <p className="rounded-lg bg-surface-2 p-3 text-sm">{e.remarks}</p>}
          {can('enquiry', 'write') && (
            <Card title="Add follow-up">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Follow-up date"><Input type="date" value={f.date ?? ''} onChange={x => setF({ ...f, date: x.target.value })} /></Field>
                <Field label="Status"><Select value={f.status} onChange={x => setF({ ...f, status: x.target.value })}>{STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></Field>
                <Field label="Course of action"><RefSelect refKey="enquiry_action" value={f.action_id} onChange={x => setF({ ...f, action_id: x })} /></Field>
                <Field label="Next follow-up"><Input type="date" value={f.next_followup ?? ''} onChange={x => setF({ ...f, next_followup: x.target.value })} /></Field>
                <Field label="Follow-up details" className="sm:col-span-2"><Textarea value={f.details ?? ''} onChange={x => setF({ ...f, details: x.target.value })} placeholder="What did the customer say?" /></Field>
              </div>
              <Button className="mt-3" variant="primary" icon={<MessageSquarePlus className="size-4" />} onClick={add}>Add follow-up</Button>
            </Card>
          )}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">History ({data.followups.length})</p>
            <ol className="relative space-y-4 border-l border-line pl-5">
              {data.followups.map((x: any) => (
                <li key={x.id}><span className="absolute -left-[6px] mt-1.5 size-3 rounded-full border-2 border-surface bg-brand" />
                  <p className="text-sm">{x.details}</p>
                  <p className="text-xs text-muted">{date(x.date)} · {x.action ?? ''} · {x.status} {x.next_followup && `· next ${date(x.next_followup)}`} · {x.user_name} · {dateTime(x.created_at)}</p>
                </li>
              ))}
              {!data.followups.length && <li className="text-sm text-muted">No follow-ups yet.</li>}
            </ol>
          </div>
        </div>
      )}
    </Drawer>
  );
}
