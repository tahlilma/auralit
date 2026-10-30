'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeftRight, Barcode, Boxes, Coins, Hash, LayoutGrid, Pause, Play, Plus, Printer, Save, Search, Tag, Trash2, UserPlus, UserRound, X,
} from 'lucide-react';
import { DOC_META, docCalc, lineCalc, r2, type DocKind } from '@/lib/calc';
import { rpc, useRpc, type RpcResult } from '@/lib/client/rpc';
import { money, num, todayISO } from '@/lib/format';
import { Badge, Button, Card, cx, Field, IconButton, Input, Kbd, Loading, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { Combobox, invalidateLookups, RefSelect, type Opt } from '@/components/ui/combobox';
import { Drawer, Modal, useUI } from '@/components/ui/overlay';
import { FormGrid } from '@/components/forms';
import { ENTITIES } from '@/lib/entities';
import { ProductDetails } from '@/components/product-details';
import { Guard, useSession } from '@/components/shell/session';

type Setup = RpcResult<'docs.docSetup'>;
type Item = Record<string, any>;
export type Line = {
  key: string; product_id?: number | null; service_id?: number | null; name: string; code?: string; mode?: string; stock?: number; unit?: string;
  color_id?: number | null; size_id?: number | null; qty: number; rate: number; cost?: number; disc_pct: number; disc: number; vat_pct: number;
  warranty_days: number; note: string; serials: string[]; sale_price?: number; expected_qty?: number; offer?: string | null;
};
type Pay = { ledger_id: number | ''; amount: number | ''; cheque_no?: string; cheque_date?: string; ref?: string };
type Exch = { key: string; product_id?: number | null; name: string; serial?: string; qty: number; price: number };
type State = {
  date: string; customer: Item | null; supplier_id: number | null; walkin: { name: string; mobile: string; email: string; address: string; district_id: number | null; zone_id: number | null };
  sales_person_id: number | null; lines: Line[]; discountMode: 'pct' | 'amt'; discount_pct: number; discount: number; vat_pct: number; ait_pct: number;
  other_name: string; other: number; freight: number; redeem_points: number; less: number; coupon: string; exchange: Exch[]; payments: Pay[];
  note: string; delivery_date: string; ref_doc_id: number | null; tendered: number | '';
};

const uid = () => Math.random().toString(36).slice(2, 9);
const blank = (): State => ({
  date: todayISO(), customer: null, supplier_id: null, walkin: { name: '', mobile: '', email: '', address: '', district_id: null, zone_id: null },
  sales_person_id: null, lines: [], discountMode: 'amt', discount_pct: 0, discount: 0, vat_pct: 0, ait_pct: 0, other_name: '', other: 0, freight: 0,
  redeem_points: 0, less: 0, coupon: '', exchange: [], payments: [], note: '', delivery_date: '', ref_doc_id: null, tendered: '',
});

export function DocEditor({ kind, id }: { kind: DocKind; id?: number }) {
  const m = DOC_META[kind];
  return <Guard module={m.module} action={id ? 'edit' : 'write'}><Editor kind={kind} id={id} /></Guard>;
}

function Editor({ kind, id }: { kind: DocKind; id?: number }) {
  const m = DOC_META[kind];
  const router = useRouter();
  const params = useSearchParams();
  const { toast, confirm } = useUI();
  const { me } = useSession();
  const setupQ = useRpc('docs.docSetup', [kind], [kind]);
  const setup = setupQ.data;
  const draftKey = `auralit.draft.${kind}`;
  const [s, setS] = useState<State>(blank);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [serialFor, setSerialFor] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [heldOpen, setHeldOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState(false);
  const [showWalkin, setShowWalkin] = useState(false);
  const [docNo, setDocNo] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isSale = m.party === 'customer';
  const isPurchase = m.rate === 'cost';

  const up = useCallback((p: Partial<State>) => setS(x => ({ ...x, ...p })), []);
  const setLine = (key: string, p: Partial<Line>) => setS(x => ({ ...x, lines: x.lines.map(l => (l.key === key ? { ...l, ...p } : l)) }));

  // ───── load existing / convert / draft ─────
  useEffect(() => {
    let alive = true;
    (async () => {
      const fromId = Number(params.get('from')) || null;
      const srcId = id ?? fromId;
      if (srcId) {
        const d = await rpc('docs.getDoc', srcId);
        if (!alive) return;
        const st = blank();
        st.date = id ? d.doc.date : todayISO();
        st.customer = d.doc.customer_id && !d.party?.is_walkin ? d.party : null;
        st.supplier_id = d.doc.supplier_id ?? null;
        st.walkin = { name: d.doc.walkin_name ?? '', mobile: d.doc.walkin_mobile ?? '', email: d.doc.walkin_email ?? '', address: d.doc.walkin_address ?? '', district_id: d.doc.walkin_district_id, zone_id: d.doc.walkin_zone_id };
        st.sales_person_id = d.doc.sales_person_id;
        st.lines = d.lines.map((l: any) => ({
          key: uid(), product_id: l.product_id, service_id: l.service_id, name: l.name, code: l.code ?? l.service_code, mode: l.mode, color_id: l.color_id, size_id: l.size_id,
          qty: l.qty, rate: kind === 'purchase' && d.doc.kind === 'porder' ? l.price : l.price, cost: l.cost, disc_pct: l.disc_pct, disc: l.disc, vat_pct: l.vat_pct,
          warranty_days: l.warranty_days, note: l.note ?? '', serials: id ? l.serials : [], sale_price: l.sale_price, expected_qty: l.expected_qty,
        }));
        Object.assign(st, {
          discount_pct: d.doc.discount_pct, discount: d.doc.discount, discountMode: d.doc.discount_pct ? 'pct' : 'amt', vat_pct: d.doc.vat_pct, ait_pct: d.doc.ait_pct,
          other_name: d.doc.other_name ?? '', other: d.doc.other, freight: d.doc.freight, less: d.doc.less, note: d.doc.note ?? '', delivery_date: d.doc.delivery_date ?? '',
          coupon: d.doc.coupon ?? '',
        });
        if (id) {
          st.redeem_points = d.doc.redeem_points;
          st.exchange = d.exchange.map((e: any) => ({ key: uid(), product_id: e.product_id, name: e.name ?? '', serial: e.serial ?? '', qty: e.qty, price: e.price }));
          st.payments = d.payments.map((p: any) => ({ ledger_id: p.ledger_id, amount: p.amount, cheque_no: p.cheque_no ?? '', cheque_date: p.cheque_date ?? '', ref: p.ref ?? '' }));
          setDocNo(d.doc.no);
        } else st.ref_doc_id = fromId;
        setS(st);
        if (st.walkin.name || st.walkin.mobile) setShowWalkin(true);
      } else {
        try { const raw = localStorage.getItem(draftKey); if (raw) { const d = JSON.parse(raw); if (d?.lines?.length) setS({ ...blank(), ...d, date: todayISO() }); } } catch { /* ignore */ }
      }
      setReady(true);
    })().catch(e => toast(e.message, 'error'));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, kind]);

  // autosave draft for new docs
  useEffect(() => {
    if (!ready || id) return;
    const t = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify(s)); } catch { /* ignore */ } }, 400);
    return () => clearTimeout(t);
  }, [s, ready, id, draftKey]);

  // default payment row
  useEffect(() => {
    if (!setup || !m.payments || s.payments.length || id) return;
    const cash = setup.money.find(x => x.kind === 'cash');
    if (cash) up({ payments: [{ ledger_id: cash.id, amount: '' }] });
  }, [setup, m.payments, s.payments.length, id, up]);

  // ───── totals ─────
  const pointValue = setup?.reward.pointValue ?? 1;
  const exchangeTotal = r2(s.exchange.reduce((a, e) => a + e.qty * e.price, 0));
  const totals = useMemo(() => docCalc(s.lines.map(l => ({ qty: l.qty, rate: l.rate, disc_pct: l.disc_pct, disc: l.disc, vat_pct: l.vat_pct })), {
    discount_pct: s.discountMode === 'pct' ? s.discount_pct : 0, discount: s.discountMode === 'amt' ? s.discount : 0, vat_pct: s.vat_pct, ait_pct: s.ait_pct,
    other: s.other, freight: s.freight, redeem: s.redeem_points * pointValue, less: s.less, exchange: exchangeTotal,
  }), [s, exchangeTotal, pointValue]);
  const paid = r2(s.payments.reduce((a, p) => a + (Number(p.amount) || 0), 0));
  const due = r2(totals.total - paid);
  const change = s.tendered !== '' ? r2(Number(s.tendered) - totals.total) : null;

  // ───── adding items ─────
  const addItem = useCallback((it: Item, serial?: string | null) => {
    setS(x => {
      const lines = [...x.lines];
      const idKey = m.items === 'service' ? 'service_id' : 'product_id';
      const existing = !serial && it.mode !== 'serial' && it.mode !== 'imei' ? lines.find(l => l[idKey as 'product_id'] === it.id && !l.color_id && !l.size_id) : serial ? lines.find(l => l.product_id === it.id) : undefined;
      if (existing) {
        if (serial) { if (!existing.serials.includes(serial)) { existing.serials = [...existing.serials, serial]; existing.qty = existing.serials.length; } }
        else existing.qty = r2(existing.qty + 1);
        return { ...x, lines: lines.map(l => (l.key === existing.key ? { ...existing } : l)) };
      }
      const offer = it.offer;
      const line: Line = {
        key: uid(), [idKey]: it.id, name: it.name, code: it.code, mode: it.mode, stock: it.stock, qty: serial ? 1 : (it.mode === 'serial' || it.mode === 'imei') && !isPurchase && kind === 'sale' ? 0 : 1,
        rate: isPurchase ? Number(it.cost) || 0 : Number(it.price) || 0, cost: Number(it.cost) || 0,
        disc_pct: offer && isSale ? Number(offer.percent) || 0 : 0, disc: offer && isSale && !Number(offer.percent) ? Number(offer.fixed) || 0 : 0,
        vat_pct: isSale && m.items === 'product' ? Number(it.vat) || 0 : 0, warranty_days: Number(it.warranty_days) || 0, note: '', serials: serial ? [serial] : [],
        sale_price: isPurchase ? Number(it.price) || 0 : undefined, offer: offer?.name ?? null,
      };
      return { ...x, lines: [...lines, line] };
    });
    if ((it.mode === 'serial' || it.mode === 'imei') && !serial && m.stock !== 0) setTimeout(() => setSerialFor(prev => prev ?? '__last'), 50);
  }, [m.items, isPurchase, isSale, kind, m.stock]);

  useEffect(() => {
    if (serialFor === '__last' && s.lines.length) setSerialFor(s.lines[s.lines.length - 1].key);
  }, [serialFor, s.lines]);

  const scan = async (code: string) => {
    const r = await rpc('docs.scan', kind, code);
    if (!r?.item) return false;
    if (r.serial && kind === 'sale' && r.serial.status !== 'instock') { toast(`Serial ${code} is ${r.serial.status}`, 'warn'); return true; }
    addItem(r.item, r.serial && kind === 'sale' ? r.serial.serial : null);
    return true;
  };

  // ───── save ─────
  const payload = () => ({
    date: s.date, customer_id: isSale ? s.customer?.id ?? null : null, supplier_id: !isSale ? s.supplier_id : null,
    walkin: s.customer ? undefined : s.walkin, sales_person_id: s.sales_person_id,
    lines: s.lines.map(l => ({ product_id: l.product_id, service_id: l.service_id, name: l.name, color_id: l.color_id, size_id: l.size_id, qty: l.qty, rate: l.rate, cost: l.cost, disc_pct: l.disc_pct, disc: l.disc, vat_pct: l.vat_pct, warranty_days: l.warranty_days, note: l.note, serials: l.serials, sale_price: l.sale_price, expected_qty: l.expected_qty })),
    discount_pct: s.discountMode === 'pct' ? s.discount_pct : 0, discount: s.discountMode === 'amt' ? s.discount : 0, vat_pct: s.vat_pct, ait_pct: s.ait_pct,
    other_name: s.other_name, other: s.other, freight: s.freight, redeem_points: s.redeem_points, less: s.less, coupon: s.coupon,
    exchange: s.exchange.map(e => ({ product_id: e.product_id, name: e.name, serial: e.serial, qty: e.qty, price: e.price })),
    payments: s.payments.filter(p => p.ledger_id && Number(p.amount) > 0).map(p => ({ ledger_id: Number(p.ledger_id), amount: Number(p.amount), cheque_no: p.cheque_no, cheque_date: p.cheque_date, ref: p.ref })),
    note: s.note, ref_doc_id: s.ref_doc_id, delivery_date: s.delivery_date,
  });
  const save = async (print?: 'a4' | 'pos') => {
    if (!s.lines.length) { toast('Add at least one item', 'warn'); searchRef.current?.focus(); return; }
    if (!isSale && !s.supplier_id) { toast('Select a supplier', 'warn'); return; }
    const missing = s.lines.find(l => (l.mode === 'serial' || l.mode === 'imei') && m.stock !== 0 && l.serials.length !== l.qty);
    if (missing) { toast(`Enter ${missing.mode === 'imei' ? 'IMEI' : 'serial'} numbers for ${missing.name}`, 'warn'); setSerialFor(missing.key); return; }
    setSaving(true);
    try {
      const r = await rpc('docs.saveDoc', kind, payload() as any, id);
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      toast(`${m.label} ${r.no} saved`);
      router.push(`/doc/${kind}/${r.id}${print ? `?print=${print}` : ''}`);
    } catch (e: any) { toast(e.message, 'error'); } finally { setSaving(false); }
  };
  const clear = async () => {
    if (s.lines.length && !(await confirm({ title: 'Clear this cart?', body: 'All items and payments will be removed.', confirm: 'Clear', danger: true }))) return;
    setS(blank()); setShowWalkin(false);
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
  };
  const hold = async () => {
    if (!s.lines.length) return;
    const name = await confirm({ title: 'Hold this cart', input: { label: 'Name (customer or note)', placeholder: s.customer?.name ?? s.walkin.name ?? 'Cart' }, confirm: 'Hold' });
    if (!name) return;
    await rpc('docs.holdCart', kind, name, s);
    setS(blank()); toast('Cart held. Resume it from Held carts.');
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
  };

  // keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F3' || (e.key === '/' && !(e.target as HTMLElement)?.closest('input,textarea,select'))) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F8' && kind === 'sale') { e.preventDefault(); void hold(); }
      if (e.key === 'F9') { e.preventDefault(); void save(kind === 'sale' ? 'pos' : 'a4'); }
      if (e.key === 'F10') { e.preventDefault(); void save(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  if (!setup || !ready) return <Loading />;
  const serialLine = s.lines.find(l => l.key === serialFor) ?? null;

  return (
    <div className="pb-24 lg:pb-0">
      <PageHeader back={m.listPath} title={id ? `Edit ${m.label.toLowerCase()} ${docNo ?? ''}` : `New ${m.label.toLowerCase()}`}
        subtitle={s.ref_doc_id ? 'Converted from an earlier document' : <span className="hidden sm:inline">Shortcuts: <Kbd>F3</Kbd> search · {kind === 'sale' && <><Kbd>F8</Kbd> hold · </>}<Kbd>F9</Kbd> save & print · <Kbd>F10</Kbd> save</span>}
        actions={<>
          {kind === 'sale' && !id && <Button variant="ghost" icon={<Play className="size-4" />} onClick={() => setHeldOpen(true)}>Held carts</Button>}
          {kind === 'sale' && !id && <Button variant="ghost" icon={<Pause className="size-4" />} onClick={hold} disabled={!s.lines.length}>Hold</Button>}
          <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={clear}>Clear</Button>
        </>} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {/* party */}
          <Card pad>
            {isSale ? (
              <CustomerPicker value={s.customer} onChange={c => up({ customer: c, redeem_points: 0 })} onNew={() => setNewCustomer(true)}
                walkin={s.walkin} showWalkin={showWalkin} setShowWalkin={setShowWalkin} setWalkin={w => up({ walkin: { ...s.walkin, ...w } })} districts={setup.districts} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                <Field label="Supplier" required>
                  <Combobox value={s.supplier_id} onChange={v => up({ supplier_id: v })} options={(setup.suppliers as Opt[]).map(o => ({ ...o, hint: o.is_opening ? 'Use for opening stock entry' : undefined }))} placeholder="Choose supplier…" />
                </Field>
                <Field label="Date"><Input type="date" value={s.date} onChange={e => up({ date: e.target.value })} /></Field>
              </div>
            )}
          </Card>

          {/* item entry */}
          <Card pad={false}>
            <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
              <ItemSearch kind={kind} inputRef={searchRef} onPick={it => addItem(it)} onScan={scan} />
              <Button variant={browse ? 'soft' : 'secondary'} icon={<LayoutGrid className="size-4" />} onClick={() => setBrowse(b => !b)}>Browse</Button>
            </div>
            {browse && <Browser kind={kind} setup={setup} onPick={it => addItem(it)} />}
            <CartTable kind={kind} lines={s.lines} setup={setup} setLine={setLine} remove={k => setS(x => ({ ...x, lines: x.lines.filter(l => l.key !== k) }))}
              openSerials={setSerialFor} openDetails={setDetailsId} />
          </Card>

          {kind === 'sale' && <ExchangeBox items={s.exchange} setItems={exchange => up({ exchange })} />}
        </div>

        {/* summary */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card pad>
            <div className="grid grid-cols-2 gap-3">
              {isSale && <Field label="Date"><Input type="date" value={s.date} onChange={e => up({ date: e.target.value })} /></Field>}
              {isSale && <Field label={m.items === 'service' ? 'Service person' : 'Sales person'}>
                <Combobox value={s.sales_person_id} onChange={v => up({ sales_person_id: v })} options={setup.salesPersons as Opt[]} placeholder="—" />
              </Field>}
              {kind === 'sestimate' && <Field label="Delivery date" className="col-span-2"><Input type="date" value={s.delivery_date} onChange={e => up({ delivery_date: e.target.value })} /></Field>}
            </div>
            <div className="mt-4 space-y-2.5">
              <AdjRow label="Discount">
                <div className="relative w-36 flex-none">
                  <Input inputSize="sm" type="number" className="num w-full pr-12 text-right" value={(s.discountMode === 'pct' ? s.discount_pct : s.discount) || ''} placeholder="0" aria-label={s.discountMode === 'pct' ? 'Discount percent' : 'Discount amount'}
                    onChange={e => up(s.discountMode === 'pct' ? { discount_pct: Number(e.target.value) || 0 } : { discount: Number(e.target.value) || 0 })} />
                  <button type="button" onClick={() => up({ discountMode: s.discountMode === 'pct' ? 'amt' : 'pct' })} title="Switch between amount and percent"
                    className="absolute inset-y-1 right-1 w-9 rounded bg-surface-2 text-[14px] font-medium text-ink-2 hover:bg-surface-3">{s.discountMode === 'pct' ? '%' : '৳'}</button>
                </div>
              </AdjRow>
              <AdjRow label={isPurchase ? 'VAT %' : 'VAT %'}><Num value={s.vat_pct} onChange={v => up({ vat_pct: v })} /></AdjRow>
              <AdjRow label={isPurchase ? 'Tax %' : 'AIT %'}><Num value={s.ait_pct} onChange={v => up({ ait_pct: v })} /></AdjRow>
              <AdjRow label={<Input inputSize="sm" value={s.other_name} onChange={e => up({ other_name: e.target.value })} placeholder="Other charge" className="w-32" />}><Num value={s.other} onChange={v => up({ other: v })} /></AdjRow>
              <AdjRow label="Freight"><Num value={s.freight} onChange={v => up({ freight: v })} /></AdjRow>
              {kind === 'sale' && setup.reward.enabled && s.customer && Number(s.customer.points) > 0 && (
                <AdjRow label={<span>Redeem points <span className="text-xs text-muted">({num(s.customer.points)} avail.)</span></span>}><Num value={s.redeem_points} onChange={v => up({ redeem_points: Math.min(v, Number(s.customer?.points) || 0) })} /></AdjRow>
              )}
              <AdjRow label={isPurchase ? 'Less (received)' : 'Less / cash back'}><Num value={s.less} onChange={v => up({ less: v })} /></AdjRow>
            </div>
            <dl className="mt-4 space-y-1.5 border-t border-dashed border-line-strong pt-3 text-[13px]">
              <TotRow k="Items gross" v={totals.gross} />
              {totals.itemDiscount > 0 && <TotRow k="Item discounts" v={-totals.itemDiscount} />}
              {totals.discount > 0 && <TotRow k="Discount" v={-totals.discount} />}
              {totals.vat > 0 && <TotRow k="VAT" v={totals.vat} />}
              {totals.ait > 0 && <TotRow k={isPurchase ? 'Tax' : 'AIT'} v={totals.ait} />}
              {totals.other > 0 && <TotRow k={s.other_name || 'Other'} v={totals.other} />}
              {totals.freight > 0 && <TotRow k="Freight" v={totals.freight} />}
              {totals.redeem > 0 && <TotRow k="Points redeemed" v={-totals.redeem} />}
              {totals.less > 0 && <TotRow k="Less" v={-totals.less} />}
              {totals.exchange > 0 && <TotRow k="Exchange items" v={-totals.exchange} />}
            </dl>
            <div className="mt-4 flex items-baseline justify-between rounded-lg bg-surface-2 px-4 py-3.5">
              <span className="text-[14px] font-medium text-ink-2">Total</span>
              <span className="num text-[28px] font-semibold leading-none text-ink">{money(totals.total)}</span>
            </div>
          </Card>

          {m.payments && (
            <Card title="Payment" pad actions={<Button size="xs" variant="soft" onClick={() => { const p = [...s.payments]; if (!p.length) p.push({ ledger_id: setup.money[0]?.id ?? '', amount: '' }); const others = p.slice(1).reduce((a, x) => a + (Number(x.amount) || 0), 0); p[0] = { ...p[0], amount: r2(Math.max(0, totals.total - others)) }; up({ payments: p }); }}>Pay full</Button>}>
              <div className="space-y-2">
                {s.payments.map((p, i) => {
                  const acc = setup.money.find(x => x.id === p.ledger_id);
                  return (
                    <div key={i} className="rounded-lg border border-line p-2">
                      <div className="flex gap-2">
                        <Select inputSize="sm" value={p.ledger_id} onChange={e => up({ payments: s.payments.map((x, j) => (j === i ? { ...x, ledger_id: Number(e.target.value) } : x)) })} className="min-w-0 flex-1">
                          {setup.money.map(a => <option key={a.id} value={a.id}>{a.label} {a.kind !== 'cash' ? `(${a.kind})` : ''}</option>)}
                        </Select>
                        <Input inputSize="sm" type="number" className="num w-28 text-right" placeholder="0.00" value={p.amount} onChange={e => up({ payments: s.payments.map((x, j) => (j === i ? { ...x, amount: e.target.value === '' ? '' : Number(e.target.value) } : x)) })} />
                        <IconButton label="Remove payment" onClick={() => up({ payments: s.payments.filter((_, j) => j !== i) })}><X className="size-4" /></IconButton>
                      </div>
                      {acc && acc.kind === 'bank' && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Input inputSize="sm" placeholder="Cheque no (optional)" value={p.cheque_no ?? ''} onChange={e => up({ payments: s.payments.map((x, j) => (j === i ? { ...x, cheque_no: e.target.value } : x)) })} />
                          <Input inputSize="sm" type="date" value={p.cheque_date ?? ''} onChange={e => up({ payments: s.payments.map((x, j) => (j === i ? { ...x, cheque_date: e.target.value } : x)) })} />
                        </div>
                      )}
                      {acc && acc.kind !== 'cash' && <Input inputSize="sm" className="mt-2" placeholder="Reference / transaction ID" value={p.ref ?? ''} onChange={e => up({ payments: s.payments.map((x, j) => (j === i ? { ...x, ref: e.target.value } : x)) })} />}
                    </div>
                  );
                })}
                <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => up({ payments: [...s.payments, { ledger_id: setup.money[0]?.id ?? '', amount: '' }] })}>Split payment</Button>
              </div>
              <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd className="num font-medium">{money(paid)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">{due >= 0 ? 'Due' : 'Overpaid'}</dt><dd className={cx('num font-semibold', due > 0 ? 'text-bad' : due < 0 ? 'text-warn' : 'text-ok')}>{money(Math.abs(due))}</dd></div>
                {isSale && s.customer && <div className="flex justify-between text-xs"><dt className="text-muted">Previous due</dt><dd className="num">{money(s.customer.balance)}</dd></div>}
                {isSale && s.customer && Number(s.customer.credit_limit) > 0 && Number(s.customer.balance) + due > Number(s.customer.credit_limit) && <p className="rounded-md bg-warn-soft px-2 py-1 text-xs text-warn">Exceeds credit limit of {money(s.customer.credit_limit)}</p>}
              </dl>
              {kind === 'sale' && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface-2 p-2">
                  <Coins className="size-4 text-muted" />
                  <Input inputSize="sm" type="number" placeholder="Cash tendered" value={s.tendered} onChange={e => up({ tendered: e.target.value === '' ? '' : Number(e.target.value) })} className="num flex-1" />
                  <span className="text-xs text-muted">Change</span><span className={cx('num min-w-20 text-right font-semibold', change !== null && change < 0 && 'text-bad')}>{change === null ? '—' : money(change)}</span>
                </div>
              )}
            </Card>
          )}

          <Card pad>
            <Field label="Note"><Textarea rows={2} value={s.note} onChange={e => up({ note: e.target.value })} placeholder="Shown on the invoice" /></Field>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="primary" size="lg" className="col-span-2" icon={<Printer className="size-4" />} loading={saving} onClick={() => save(kind === 'sale' ? 'pos' : 'a4')}>Save & print <span className="ml-1 text-xs opacity-70">F9</span></Button>
              <Button size="lg" icon={<Save className="size-4" />} loading={saving} onClick={() => save()}>Save</Button>
              {kind === 'sale' ? <Button size="lg" loading={saving} onClick={() => save('a4')}>Save & A4</Button> : <Button size="lg" onClick={() => router.push(m.listPath)}>Cancel</Button>}
            </div>
            <p className="mt-3 text-center text-[11px] text-muted">Saved by {me.name}. {!id && 'Your cart is kept if you leave this page.'}</p>
          </Card>
        </div>
      </div>

      {/* mobile sticky total */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-line bg-surface px-4 py-3 shadow-pop lg:hidden no-print">
        <div className="flex-1"><p className="text-xs text-muted">{s.lines.length} item(s)</p><p className="num text-lg font-bold">{money(totals.total)}</p></div>
        <Button variant="primary" loading={saving} onClick={() => save(kind === 'sale' ? 'pos' : 'a4')}>Save & print</Button>
      </div>

      <SerialModal kind={kind} line={serialLine} onClose={() => setSerialFor(null)} onSave={serials => { if (serialLine) setLine(serialLine.key, { serials, qty: serials.length || serialLine.qty }); setSerialFor(null); }} />
      <ProductDetails id={detailsId} onClose={() => setDetailsId(null)} />
      <HeldCarts open={heldOpen} onClose={() => setHeldOpen(false)} kind={kind} onResume={st => { setS({ ...blank(), ...st, date: todayISO() }); setHeldOpen(false); }} />
      <NewCustomer open={newCustomer} onClose={() => setNewCustomer(false)} initial={{ name: s.walkin.name, mobile: s.walkin.mobile, email: s.walkin.email, address: s.walkin.address, district_id: s.walkin.district_id, zone_id: s.walkin.zone_id }}
        onCreated={async cid => { const c = await rpc('docs.partyInfo', 'customer', cid); up({ customer: c }); setNewCustomer(false); setShowWalkin(false); }} />
    </div>
  );
}

function AdjRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 text-[13px]"><span className="text-ink-2">{label}</span>{children}</div>;
}
function Num({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <Input inputSize="sm" type="number" className="num w-36 flex-none text-right" value={value || ''} placeholder="0" onChange={e => onChange(Number(e.target.value) || 0)} />;
}
function TotRow({ k, v }: { k: string; v: number }) {
  return <div className="flex justify-between"><dt className="text-muted">{k}</dt><dd className={cx('num', v < 0 && 'text-bad')}>{money(v)}</dd></div>;
}

// ───────── Customer picker ─────────
function CustomerPicker({ value, onChange, onNew, walkin, setWalkin, showWalkin, setShowWalkin, districts }: {
  value: Item | null; onChange: (c: Item | null) => void; onNew: () => void; walkin: State['walkin']; setWalkin: (w: Partial<State['walkin']>) => void;
  showWalkin: boolean; setShowWalkin: (b: boolean) => void; districts: any[];
}) {
  const load = useCallback(async (q: string) => (await rpc('docs.searchParties', 'customer', q)).map(c => ({ ...c, value: c.id, label: c.name, hint: `${c.code} · ${c.mobile ?? ''}${Number(c.balance) ? ` · due ${money(c.balance)}` : ''}` })), []);
  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Customer" className="min-w-[240px] flex-1">
          <Combobox value={value?.id ?? null} valueLabel={value ? `${value.name} · ${value.code}` : ''} onChange={(_, o) => onChange(o ?? null)} load={load} placeholder="Walk-in customer — type name, code or mobile…" emptyText="No customer found" />
        </Field>
        <Button icon={<UserPlus className="size-4" />} onClick={onNew}>New</Button>
        {!value && <Button variant={showWalkin ? 'soft' : 'ghost'} icon={<UserRound className="size-4" />} onClick={() => setShowWalkin(!showWalkin)}>Walk-in details</Button>}
      </div>
      {value && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
          <span><span className="text-muted">Mobile</span> {value.mobile || '—'}</span>
          <span><span className="text-muted">Due</span> <b className={cx('num', Number(value.balance) > 0 && 'text-bad')}>{money(value.balance)}</b></span>
          {Number(value.credit_limit) > 0 && <span><span className="text-muted">Limit</span> {money(value.credit_limit)}</span>}
          {Number(value.points) > 0 && <span><span className="text-muted">Points</span> {num(value.points)}</span>}
          {value.address && <span className="truncate text-muted">{value.address}</span>}
        </div>
      )}
      {!value && showWalkin && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Name"><Input value={walkin.name} onChange={e => setWalkin({ name: e.target.value })} placeholder="Walk-in customer" /></Field>
          <Field label="Mobile"><Input value={walkin.mobile} onChange={e => setWalkin({ mobile: e.target.value })} placeholder="01XXXXXXXXX" /></Field>
          <Field label="Email"><Input value={walkin.email} onChange={e => setWalkin({ email: e.target.value })} /></Field>
          <Field label="District"><Combobox value={walkin.district_id} onChange={v => setWalkin({ district_id: v, zone_id: null })} options={districts} /></Field>
          <Field label="Zone"><RefSelect refKey="zone" parent={walkin.district_id} value={walkin.zone_id} onChange={v => setWalkin({ zone_id: v })} /></Field>
          <Field label="Address"><Input value={walkin.address} onChange={e => setWalkin({ address: e.target.value })} /></Field>
        </div>
      )}
    </div>
  );
}

function NewCustomer({ open, onClose, initial, onCreated }: { open: boolean; onClose: () => void; initial: Record<string, any>; onCreated: (id: number) => void }) {
  const { toast } = useUI();
  const [v, setV] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setV({ status: 'active', get_reward: 0, ...initial }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const fields = ENTITIES.customer.fields.filter(f => ['name', 'mobile', 'email', 'district_id', 'zone_id', 'group_id', 'address', 'credit_limit', 'get_reward'].includes(f.name));
  const save = async () => {
    setBusy(true);
    try { const r = await rpc('crud.create', 'customer', v); invalidateLookups('customer'); toast('Customer added'); onCreated(r.id); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Drawer open={open} onClose={onClose} title="New customer" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save & select</Button></>}>
      <FormGrid fields={fields} values={v} creating onChange={(n, x) => setV(s => ({ ...s, [n]: x }))} />
    </Drawer>
  );
}

// ───────── Item search ─────────
function ItemSearch({ kind, inputRef, onPick, onScan }: { kind: DocKind; inputRef: React.RefObject<HTMLInputElement | null>; onPick: (it: Item) => void; onScan: (code: string) => Promise<boolean> }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const isSvc = DOC_META[kind].items === 'service';
  useEffect(() => {
    if (!q.trim()) { setRes([]); return; }
    const t = setTimeout(() => rpc('docs.searchItems', kind, { q, size: 12 }).then(r => { setRes(r); setActive(0); setOpen(true); }).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [q, kind]);
  const pick = (it: Item) => { onPick(it); setQ(''); setRes([]); setOpen(false); inputRef.current?.focus(); };
  const onKey = async (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, res.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Enter') {
      e.preventDefault();
      const code = q.trim();
      if (!code) return;
      // exact barcode / code / serial first
      if (await onScan(code)) { setQ(''); setRes([]); setOpen(false); return; }
      if (res[active]) pick(res[active]);
    }
  };
  return (
    <div className="relative min-w-[240px] flex-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input ref={inputRef} inputSize="lg" value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} onFocus={() => res.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={isSvc ? 'Search service by name or code…' : 'Scan barcode / serial or type product name, code, model…'} className="pl-9 pr-10" autoFocus />
        <Barcode className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      </div>
      {open && res.length > 0 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-96 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-pop thin-scroll">
          {res.map((it, i) => (
            <button key={it.id} type="button" onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(it)}
              className={cx('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left', i === active && 'bg-surface-2')}>
              {!isSvc && (it.image ? <img src={it.image} alt="" className="size-9 rounded-md object-cover" /> : <span className="flex size-9 items-center justify-center rounded-md bg-surface-3 text-muted"><Boxes className="size-4" /></span>)}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{it.name}</span><span className="block truncate text-xs text-muted">{it.code}{it.model ? ` · ${it.model}` : ''}{it.brand ? ` · ${it.brand}` : ''}{it.category ? ` · ${it.category}` : ''}</span></span>
              {it.offer && <Badge tone="green">{it.offer.percent ? `${it.offer.percent}% off` : `${money(it.offer.fixed)} off`}</Badge>}
              {it.mode && it.mode !== 'nonserial' && <Badge tone="blue">{it.mode}</Badge>}
              <span className="text-right"><span className="num block text-sm font-semibold">{money(DOC_META[kind].rate === 'cost' ? it.cost : it.price)}</span>{!isSvc && <span className={cx('num block text-xs', it.stock > 0 ? 'text-ok' : 'text-bad')}>{num(it.stock)} in stock</span>}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────── Browser (category / brand / subcategory) ─────────
function Browser({ kind, setup, onPick }: { kind: DocKind; setup: Setup; onPick: (it: Item) => void }) {
  const [cat, setCat] = useState<number | undefined>();
  const [sub, setSub] = useState<number | undefined>();
  const [brand, setBrand] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const isSvc = DOC_META[kind].items === 'service';
  const { data, loading } = useRpc('docs.searchItems', [kind, { category_id: cat, subcategory_id: sub, brand_id: brand, page, size: 24 }], [cat, sub, brand, page]);
  const chip = (on: boolean) => cx('whitespace-nowrap rounded-full border px-3 py-1 text-[13px] font-medium transition', on ? 'border-line-strong bg-surface-3 text-ink' : 'border-line bg-surface text-muted hover:text-ink');
  return (
    <div className="border-b border-line bg-surface-2 px-5 py-3">
      <div className="thin-scroll flex gap-1.5 overflow-x-auto pb-2">
        <button className={chip(!cat)} onClick={() => { setCat(undefined); setSub(undefined); setPage(1); }}>All categories</button>
        {setup.categories.map((c: any) => <button key={c.id} className={chip(cat === c.id)} onClick={() => { setCat(c.id); setSub(undefined); setPage(1); }}>{c.name}</button>)}
      </div>
      {cat && setup.subcategories.some((x: any) => x.category_id === cat) && (
        <div className="thin-scroll flex gap-1.5 overflow-x-auto pb-2">
          {setup.subcategories.filter((x: any) => x.category_id === cat).map((x: any) => <button key={x.id} className={chip(sub === x.id)} onClick={() => { setSub(sub === x.id ? undefined : x.id); setPage(1); }}>{x.name}</button>)}
        </div>
      )}
      {!isSvc && (
        <div className="thin-scroll flex gap-1.5 overflow-x-auto pb-2">
          <button className={chip(!brand)} onClick={() => { setBrand(undefined); setPage(1); }}>All brands</button>
          {setup.brands.map((b: any) => <button key={b.id} className={chip(brand === b.id)} onClick={() => { setBrand(b.id); setPage(1); }}>{b.name}</button>)}
        </div>
      )}
      <div className={cx('mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4', loading && 'opacity-60')}>
        {data?.map((it: Item) => (
          <button key={it.id} type="button" onClick={() => onPick(it)} className="group flex items-center gap-2.5 rounded-lg border border-line bg-surface p-2 text-left transition hover:border-line-strong hover:bg-surface-2">
            {!isSvc && (it.image ? <img src={it.image} alt="" className="size-11 rounded-lg object-cover" /> : <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-muted"><Tag className="size-4" /></span>)}
            <span className="min-w-0 flex-1"><span className="line-clamp-2 text-[12.5px] font-medium leading-snug">{it.name}</span><span className="num mt-0.5 block text-xs text-muted">{money(DOC_META[kind].rate === 'cost' ? it.cost : it.price)}{!isSvc && ` · ${num(it.stock)}`}</span></span>
          </button>
        ))}
      </div>
      {data && (data.length === 24 || page > 1) && (
        <div className="mt-2 flex justify-center gap-2"><Button size="xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><Button size="xs" disabled={data.length < 24} onClick={() => setPage(p => p + 1)}>Next</Button></div>
      )}
      {data && !data.length && <p className="py-6 text-center text-sm text-muted">No items in this filter.</p>}
    </div>
  );
}

// ───────── Cart ─────────
function CartTable({ kind, lines, setup, setLine, remove, openSerials, openDetails }: { kind: DocKind; lines: Line[]; setup: Setup; setLine: (k: string, p: Partial<Line>) => void; remove: (k: string) => void; openSerials: (k: string) => void; openDetails: (id: number) => void }) {
  const m = DOC_META[kind];
  const isPurchase = m.rate === 'cost';
  const isProduct = m.items === 'product';
  const [more, setMore] = useState<string | null>(null);
  if (!lines.length) return (
    <div className="flex flex-col items-center gap-2 py-14 text-center text-sm text-muted">
      <Barcode className="size-8 text-line-strong" />
      <p>Scan a barcode or search above to add items.</p>
    </div>
  );
  const inp = 'h-8 rounded-md border border-transparent bg-transparent px-1.5 text-right num text-[13px] outline-none hover:border-line-strong focus:border-brand focus:bg-surface';
  return (
    <div className="thin-scroll overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[12.5px] text-muted [&>th]:font-normal">
            <th className="w-8 px-3 py-2 text-left">#</th><th className="px-2 py-2 text-left">Item</th>
            {kind === 'porder' && <th className="w-20 px-2 py-2 text-right">E.Qty</th>}
            <th className="w-20 px-2 py-2 text-right">Qty</th><th className="w-28 px-2 py-2 text-right">{isPurchase ? 'Cost' : 'Price'}</th>
            <th className="w-20 px-2 py-2 text-right">Disc %</th><th className="w-24 px-2 py-2 text-right">Subtotal</th><th className="w-16" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const c = lineCalc({ qty: l.qty, rate: l.rate, disc_pct: l.disc_pct, disc: l.disc, vat_pct: l.vat_pct });
            const needSerial = (l.mode === 'serial' || l.mode === 'imei') && m.stock !== 0;
            const low = kind === 'sale' && l.stock !== undefined && l.qty > (l.stock ?? 0);
            return [
              <tr key={l.key} className="border-t border-line align-top hover:bg-surface-2/60">
                <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                <td className="px-2 py-2">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <button type="button" className="text-left font-medium text-ink hover:text-brand" onClick={() => l.product_id && openDetails(l.product_id)}>{l.name}</button>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {l.code && <span>{l.code}</span>}
                        {l.stock !== undefined && isProduct && <span className={cx(low && 'font-medium text-bad')}>stock {num(l.stock)}</span>}
                        {l.offer && <Badge tone="green">{l.offer}</Badge>}
                        {l.disc > 0 && <span>− {money(l.disc)}</span>}
                        {l.vat_pct > 0 && <span>VAT {l.vat_pct}%</span>}
                        {l.warranty_days > 0 && <span>warranty {l.warranty_days}d</span>}
                        {l.note && <span className="italic">“{l.note}”</span>}
                      </div>
                      {needSerial && (
                        <button type="button" onClick={() => openSerials(l.key)} className={cx('mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium', l.serials.length === l.qty && l.qty > 0 ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn')}>
                          <Hash className="size-3" />{l.serials.length ? `${l.serials.length} serial(s): ${l.serials.slice(0, 2).join(', ')}${l.serials.length > 2 ? '…' : ''}` : `Add ${l.mode === 'imei' ? 'IMEI' : 'serials'}`}
                        </button>
                      )}
                    </div>
                  </div>
                </td>
                {kind === 'porder' && <td className="px-2 py-2"><input className={cx(inp, 'w-full')} type="number" value={l.expected_qty || ''} onChange={e => setLine(l.key, { expected_qty: Number(e.target.value) || 0 })} /></td>}
                <td className="px-2 py-2"><input className={cx(inp, 'w-full', low && 'text-bad')} type="number" min={0} step="any" value={l.qty} readOnly={needSerial && kind !== 'purchase'} onChange={e => setLine(l.key, { qty: Number(e.target.value) || 0 })} /></td>
                <td className="px-2 py-2"><input className={cx(inp, 'w-full')} type="number" step="0.01" value={l.rate} onChange={e => setLine(l.key, { rate: Number(e.target.value) || 0 })} /></td>
                <td className="px-2 py-2"><input className={cx(inp, 'w-full')} type="number" step="any" value={l.disc_pct || ''} placeholder="0" onChange={e => setLine(l.key, { disc_pct: Number(e.target.value) || 0 })} /></td>
                <td className="num px-2 py-2.5 text-right font-medium">{money(c.subtotal, false)}</td>
                <td className="px-1 py-1.5 text-right whitespace-nowrap">
                  <IconButton label="More options" onClick={() => setMore(more === l.key ? null : l.key)}><ArrowLeftRight className="size-3.5 rotate-90" /></IconButton>
                  <IconButton label="Remove" onClick={() => remove(l.key)} className="hover:!text-bad"><Trash2 className="size-4" /></IconButton>
                </td>
              </tr>,
              more === l.key && (
                <tr key={l.key + 'x'} className="bg-surface-2">
                  <td />
                  <td colSpan={kind === 'porder' ? 7 : 6} className="px-2 pb-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      <Field label="Discount (fixed)"><Input inputSize="sm" type="number" value={l.disc || ''} onChange={e => setLine(l.key, { disc: Number(e.target.value) || 0 })} /></Field>
                      <Field label="VAT %"><Input inputSize="sm" type="number" value={l.vat_pct || ''} onChange={e => setLine(l.key, { vat_pct: Number(e.target.value) || 0 })} /></Field>
                      {isProduct && <Field label="Warranty (days)"><Input inputSize="sm" type="number" value={l.warranty_days || ''} onChange={e => setLine(l.key, { warranty_days: Number(e.target.value) || 0 })} /></Field>}
                      {isProduct && <Field label="Color"><Combobox size="sm" value={l.color_id} onChange={v => setLine(l.key, { color_id: v })} options={setup.colors as Opt[]} placeholder="—" /></Field>}
                      {isProduct && <Field label="Size"><Combobox size="sm" value={l.size_id} onChange={v => setLine(l.key, { size_id: v })} options={setup.sizes as Opt[]} placeholder="—" /></Field>}
                      {kind === 'purchase' && <Field label="Sale price"><Input inputSize="sm" type="number" value={l.sale_price || ''} onChange={e => setLine(l.key, { sale_price: Number(e.target.value) || 0 })} /></Field>}
                      {m.items === 'service' && <Field label="Cost"><Input inputSize="sm" type="number" value={l.cost || ''} onChange={e => setLine(l.key, { cost: Number(e.target.value) || 0 })} /></Field>}
                      <Field label="Line note" className="col-span-2"><Input inputSize="sm" value={l.note} onChange={e => setLine(l.key, { note: e.target.value })} placeholder={l.mode === 'expiry' ? 'Expiry date / batch' : 'Optional'} /></Field>
                    </div>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

// ───────── Serial picker ─────────
function SerialModal({ kind, line, onClose, onSave }: { kind: DocKind; line: Line | null; onClose: () => void; onSave: (s: string[]) => void }) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const isSale = kind === 'sale';
  const avail = useRpc(line && isSale && line.product_id ? 'docs.availableSerials' : null, [line?.product_id ?? 0, q], [line?.key, q]);
  useEffect(() => { if (line) { setText(line.serials.join('\n')); setPicked(line.serials); setQ(''); } }, [line]);
  if (!line) return null;
  const list = text.split(/[\n,;\t]+/).map(x => x.trim()).filter(Boolean);
  const dup = list.length !== new Set(list).size;
  return (
    <Modal open onClose={onClose} title={`${line.mode === 'imei' ? 'IMEI' : 'Serial'} numbers — ${line.name}`} size="md"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!isSale && dup} onClick={() => onSave(isSale ? picked : list)}>Use {isSale ? picked.length : list.length} serial(s)</Button></>}>
      {isSale ? (
        <div>
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter serials…" autoFocus />
          <div className="thin-scroll mt-3 max-h-80 space-y-1 overflow-y-auto">
            {avail.data?.map((r: any) => (
              <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                <input type="checkbox" className="accent-[var(--brand)]" checked={picked.includes(r.serial)} onChange={() => setPicked(p => (p.includes(r.serial) ? p.filter(x => x !== r.serial) : [...p, r.serial]))} />
                <span className="font-mono text-sm">{r.serial}</span>{r.expiry && <span className="text-xs text-muted">exp {r.expiry}</span>}
              </label>
            ))}
            {avail.data && !avail.data.length && <p className="py-6 text-center text-sm text-muted">No serials in stock for this product at your branch.</p>}
          </div>
          <p className="mt-2 text-xs text-muted">Tip: you can also scan a serial directly into the main search box.</p>
        </div>
      ) : (
        <div>
          <Textarea rows={10} value={text} onChange={e => setText(e.target.value)} autoFocus className="font-mono" placeholder="Scan or paste one serial per line" />
          <p className={cx('mt-2 text-xs', dup ? 'text-bad' : 'text-muted')}>{list.length} serial(s){dup && ' — duplicates found'}. Quantity will be set to the number of serials.</p>
        </div>
      )}
    </Modal>
  );
}

// ───────── Exchange (trade-in) ─────────
function ExchangeBox({ items, setItems }: { items: Exch[]; setItems: (x: Exch[]) => void }) {
  const [open, setOpen] = useState(items.length > 0);
  const load = useCallback(async (q: string) => (await rpc('docs.searchItems', 'purchase', { q, size: 15 })).map(p => ({ ...p, value: p.id, label: p.name, hint: p.code })), []);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong py-3 text-sm text-muted hover:border-brand hover:text-brand"><ArrowLeftRight className="size-4" /> Add exchange / trade-in item</button>;
  const total = r2(items.reduce((a, e) => a + e.qty * e.price, 0));
  return (
    <Card title="Exchange items" subtitle="Items the customer gives back; value is deducted from the bill and the item enters stock." actions={<Button size="xs" icon={<Plus className="size-3.5" />} onClick={() => setItems([...items, { key: uid(), name: '', qty: 1, price: 0 }])}>Add</Button>}>
      <div className="space-y-2">
        {items.map(e => (
          <div key={e.key} className="grid grid-cols-[1fr_120px_70px_110px_32px] items-center gap-2">
            <Combobox size="sm" value={e.product_id ?? null} valueLabel={e.name} load={load} onChange={(v, o) => setItems(items.map(x => (x.key === e.key ? { ...x, product_id: v, name: o?.label ?? '' } : x)))} placeholder="Product…" />
            <Input inputSize="sm" placeholder="Serial" value={e.serial ?? ''} onChange={ev => setItems(items.map(x => (x.key === e.key ? { ...x, serial: ev.target.value } : x)))} />
            <Input inputSize="sm" type="number" className="num text-right" value={e.qty} onChange={ev => setItems(items.map(x => (x.key === e.key ? { ...x, qty: Number(ev.target.value) || 0 } : x)))} />
            <Input inputSize="sm" type="number" className="num text-right" placeholder="Value" value={e.price || ''} onChange={ev => setItems(items.map(x => (x.key === e.key ? { ...x, price: Number(ev.target.value) || 0 } : x)))} />
            <IconButton label="Remove" onClick={() => setItems(items.filter(x => x.key !== e.key))}><X className="size-4" /></IconButton>
          </div>
        ))}
        {!items.length && <p className="text-sm text-muted">No exchange items.</p>}
        {items.length > 0 && <p className="text-right text-sm">Exchange value <b className="num">{money(total)}</b></p>}
      </div>
    </Card>
  );
}

function HeldCarts({ open, onClose, kind, onResume }: { open: boolean; onClose: () => void; kind: string; onResume: (s: State) => void }) {
  const { data, reload } = useRpc(open ? 'docs.heldCarts' : null, [kind], [open]);
  return (
    <Drawer open={open} onClose={onClose} title="Held carts" width="max-w-md">
      <div className="space-y-2">
        {data?.map((c: any) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
            <div className="flex-1"><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-muted">{c.data.lines?.length ?? 0} items · {c.created_at}</p></div>
            <Button size="sm" variant="primary" onClick={async () => { await rpc('docs.dropHeldCart', c.id); onResume(c.data); }}>Resume</Button>
            <IconButton label="Discard" onClick={async () => { await rpc('docs.dropHeldCart', c.id); reload(); }}><Trash2 className="size-4" /></IconButton>
          </div>
        ))}
        {data && !data.length && <p className="py-10 text-center text-sm text-muted">No held carts.</p>}
      </div>
    </Drawer>
  );
}

