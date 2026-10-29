'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRightLeft, Pencil, Printer, ReceiptText, Trash2, Truck, Undo2 } from 'lucide-react';
import { DOC_META, type DocKind } from '@/lib/calc';
import { rpc, useRpc, type RpcResult } from '@/lib/client/rpc';
import { date, dateTime, inWords, KIND_LABEL, money, num } from '@/lib/format';
import { Badge, Button, Card, cx, ErrorBox, KeyVal, Loading, PageHeader, Tabs } from '@/components/ui/primitives';
import { useUI } from '@/components/ui/overlay';
import { HistoryButton } from '@/components/history';
import { Guard, useSession } from '@/components/shell/session';

type D = RpcResult<'docs.getDoc'>;

export function DocView({ kind, id }: { kind: DocKind; id: number }) {
  return <Guard module={DOC_META[kind].module}><View kind={kind} id={id} /></Guard>;
}

function View({ kind, id }: { kind: DocKind; id: number }) {
  const m = DOC_META[kind];
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const { toast, confirm } = useUI();
  const { data, error } = useRpc('docs.getDoc', [id], [id]);
  const [mode, setMode] = useState<'a4' | 'pos' | 'challan'>((params.get('print') as any) || 'a4');

  useEffect(() => {
    if (data && params.get('print')) {
      const t = setTimeout(() => window.print(), 350);
      return () => clearTimeout(t);
    }
  }, [data, params]);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const d = data.doc;
  const convertTo = kind === 'estimate' ? 'sale' : kind === 'sestimate' ? 'service' : kind === 'porder' ? 'purchase' : null;
  const del = async () => {
    if (!(await confirm({ title: `Delete ${d.no}?`, body: 'Stock, serials and accounting entries are reversed.', confirm: 'Delete', danger: true }))) return;
    try { await rpc('docs.deleteDoc', id); toast(`${d.no} deleted`); router.push(m.listPath); } catch (e: any) { toast(e.message, 'error'); }
  };
  const printAs = (pm: typeof mode) => { setMode(pm); setTimeout(() => window.print(), 100); };

  return (
    <div>
      <PageHeader back={m.listPath} title={<span className="flex items-center gap-3">{d.no} {d.status === 'invoiced' && <Badge tone="blue">Invoiced</Badge>}{kind === 'porder' && <Badge tone={d.approved ? 'green' : 'amber'}>{d.approved ? 'Approved' : 'Pending approval'}</Badge>}</span>}
        subtitle={`${m.label} · ${date(d.date)} · by ${d.created_by_name ?? '—'}`}
        actions={<>
          <HistoryButton entities={[kind]} />
          {convertTo && d.status !== 'invoiced' && <Button icon={<ArrowRightLeft className="size-4" />} href={`/doc/${convertTo}/new?from=${id}`}>Convert to {DOC_META[convertTo as DocKind].label.toLowerCase()}</Button>}
          {(kind === 'sale' || kind === 'purchase') && can(m.module, 'write') && <Button icon={<Undo2 className="size-4" />} href={`/doc/${kind === 'sale' ? 'sreturn' : 'preturn'}/new?inv=${encodeURIComponent(d.no)}`}>Return</Button>}
          {kind === 'sale' && can('inventory', 'write') && <Button icon={<Truck className="size-4" />} href={`/stock/delivery/new?doc=${id}`}>Deliver</Button>}
          {kind === 'purchase' && can('inventory', 'write') && <Button icon={<Truck className="size-4" />} href={`/stock/receive/new?doc=${id}`}>Receive</Button>}
          {kind !== 'sreturn' && kind !== 'preturn' && can(m.module, 'edit') && <Button icon={<Pencil className="size-4" />} href={`/doc/${kind}/${id}/edit`}>Edit</Button>}
          {can(m.module, 'delete') && <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={del}>Delete</Button>}
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-2 no-print">
        <Tabs value={mode} onChange={setMode} tabs={[{ value: 'a4', label: 'Invoice (A4)' }, ...(m.party === 'customer' ? [{ value: 'pos' as const, label: 'POS receipt' }] : []), ...(m.items === 'product' ? [{ value: 'challan' as const, label: m.party === 'customer' ? 'Delivery challan' : 'Receive challan' }] : [])]} />
        <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => printAs(mode)}>Print</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className={cx('overflow-x-auto', mode === 'pos' && 'flex justify-center')}>
          {mode === 'pos' ? <PosReceipt data={data} /> : <A4 data={data} challan={mode === 'challan'} />}
        </div>
        <div className="space-y-4 no-print">
          <Card title="Summary">
            <KeyVal cols={1} items={[
              [m.party === 'customer' ? 'Customer' : 'Supplier', data.party ? <Link href={`/data/${m.party}?view=${data.party.id}`} className="text-brand hover:underline">{d.walkin_name && data.party.is_walkin ? d.walkin_name : data.party.name}</Link> : '—'],
              ['Total', money(d.total)], ['Paid at invoice', money(d.paid)],
              ...(data.party && !data.party.is_walkin ? [[m.party === 'customer' ? 'Current customer due' : 'Current payable', money(data.party.balance)] as [string, string]] : []),
              ...(d.sales_person ? [['Sales person', d.sales_person] as [string, string]] : []),
              ...(d.ref_no ? [['Created from', <Link key="r" href={`/doc/${d.ref_kind}/${d.ref_doc_id}`} className="text-brand hover:underline">{d.ref_no}</Link>] as [string, React.ReactNode]] : []),
              ...(d.updated_at ? [['Last edited', `${dateTime(d.updated_at)} by ${d.updated_by_name ?? ''}`] as [string, string]] : []),
              ...(kind === 'sale' && Number(d.points_earned) ? [['Points earned', num(d.points_earned)] as [string, string]] : []),
            ]} />
          </Card>
          {data.related.length > 0 && (
            <Card title="Related documents" pad={false}>
              <ul className="divide-y divide-line">{data.related.map((r: any) => <li key={r.id}><Link href={`/doc/${r.kind}/${r.id}`} className="flex justify-between px-4 py-2.5 text-sm hover:bg-surface-2"><span><span className="font-medium">{r.no}</span> <span className="text-xs text-muted">{KIND_LABEL[r.kind]}</span></span><span className="num">{money(r.total)}</span></Link></li>)}</ul>
            </Card>
          )}
          {m.payments && can('acctra', 'write') && kind !== 'sreturn' && kind !== 'preturn' && (
            <Button className="w-full" icon={<ReceiptText className="size-4" />} href={`/vouchers/${m.party === 'customer' ? 'receipt' : 'payment'}/new?inv=${encodeURIComponent(d.no)}`}>
              {m.party === 'customer' ? 'Collect payment' : 'Pay supplier'} against this invoice
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Letterhead({ company, title, no, d }: { company: any; title: string; no: string; d: any }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
      <div className="flex items-start gap-3">
        {company?.logo && <img src={company.logo} alt="" className="size-16 object-contain" />}
        <div>
          <p className="text-xl font-bold tracking-tight">{company?.name}</p>
          {company?.slogan && <p className="text-xs italic text-neutral-600">{company.slogan}</p>}
          <p className="mt-1 whitespace-pre-line text-xs text-neutral-600">{company?.address}</p>
          <p className="text-xs text-neutral-600">{[company?.mobile, company?.phone, company?.email, company?.web].filter(Boolean).join(' · ')}</p>
          {(company?.tin || company?.vat) && <p className="text-xs text-neutral-600">{company.tin && `TIN ${company.tin}`} {company.vat && `· BIN/VAT ${company.vat}`}</p>}
        </div>
      </div>
      <div className="text-right">
        <p className="text-lg font-bold uppercase tracking-wide">{title}</p>
        <p className="num mt-1 text-sm font-semibold">{no}</p>
        <p className="text-xs text-neutral-600">Date: {date(d.date)}</p>
        {d.delivery_date && <p className="text-xs text-neutral-600">Delivery: {date(d.delivery_date)}</p>}
      </div>
    </div>
  );
}

function A4({ data, challan }: { data: D; challan: boolean }) {
  const d = data.doc;
  const m = DOC_META[d.kind as DocKind];
  const p = data.party;
  const showSerial = data.notes.show_serial;
  const isWalk = p?.is_walkin;
  const title = challan ? (m.party === 'customer' ? 'Delivery Challan' : 'Receive Challan') : m.label.replace('Sales Invoice', 'Invoice');
  const lines = data.lines;
  const totalDue = p && !isWalk ? Number(p.balance) : Number(d.total) - Number(d.paid);
  return (
    <div className="print-area mx-auto min-h-[297mm] w-[210mm] max-w-full rounded-xl border border-line bg-white p-[12mm] text-[12px] text-black shadow-card">
      <Letterhead company={data.company} title={title} no={d.no} d={d} />
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{m.party === 'customer' ? 'Bill to' : 'Supplier'}</p>
          <p className="mt-1 text-sm font-semibold">{isWalk ? d.walkin_name || 'Walk-in Customer' : p?.name}</p>
          {!isWalk && p?.code && <p className="text-xs">{p.code}</p>}
          <p className="text-xs">{isWalk ? d.walkin_mobile : p?.mobile}</p>
          <p className="whitespace-pre-line text-xs">{isWalk ? [d.walkin_address, d.walkin_zone, d.walkin_district].filter(Boolean).join(', ') : [p?.address, p?.zone, p?.district].filter(Boolean).join(', ')}</p>
        </div>
        <div className="text-right text-xs">
          {d.ref_no && <p>Ref: {d.ref_no}</p>}
          {d.sales_person && <p>Sales person: {d.sales_person}</p>}
          <p>Prepared by: {d.created_by_name}</p>
          {d.branch_name && <p>Branch: {d.branch_name}</p>}
        </div>
      </div>
      <table className="mt-5 w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border-y border-black bg-neutral-100 text-left">
            <th className="px-2 py-1.5 w-8">SL</th><th className="px-2 py-1.5">Description</th>
            <th className="px-2 py-1.5 text-right w-14">Qty</th>
            {!challan && <><th className="px-2 py-1.5 text-right w-24">Rate</th><th className="px-2 py-1.5 text-right w-20">Disc.</th><th className="px-2 py-1.5 text-right w-28">Amount</th></>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l: any, i: number) => {
            const disc = l.qty * l.price * l.disc_pct / 100 + l.disc;
            return (
              <tr key={l.id} className="border-b border-neutral-300 align-top">
                <td className="px-2 py-1.5">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <p className="font-medium">{l.name}</p>
                  <p className="text-[10.5px] text-neutral-600">{[l.code ?? l.service_code, l.model, l.color, l.size, l.warranty_days ? `Warranty ${l.warranty_days} days` : '', l.note].filter(Boolean).join(' · ')}</p>
                  {showSerial && l.serials.length > 0 && <p className="font-mono text-[10px] text-neutral-700">S/N: {l.serials.join(', ')}</p>}
                </td>
                <td className="num px-2 py-1.5 text-right">{num(l.qty)} {l.unit ?? ''}</td>
                {!challan && <>
                  <td className="num px-2 py-1.5 text-right">{money(l.price, false)}</td>
                  <td className="num px-2 py-1.5 text-right">{disc ? money(disc, false) : '—'}</td>
                  <td className="num px-2 py-1.5 text-right font-medium">{money(l.subtotal, false)}</td>
                </>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!challan && (
        <div className="mt-3 flex justify-between gap-6">
          <div className="max-w-[55%] text-xs">
            <p className="font-semibold">In words:</p><p className="italic">{inWords(Number(d.total))}</p>
            {data.payments.length > 0 && <div className="mt-3"><p className="font-semibold">Payment</p>{data.payments.map((x: any) => <p key={x.id}>{x.ledger_name}: {money(x.amount)}{x.cheque_no ? ` (Chq ${x.cheque_no}${x.cheque_date ? `, ${date(x.cheque_date)}` : ''})` : ''}{x.ref ? ` · ${x.ref}` : ''}</p>)}</div>}
            {data.exchange.length > 0 && <div className="mt-3"><p className="font-semibold">Exchange items received</p>{data.exchange.map((x: any) => <p key={x.id}>{x.name} {x.serial ? `(${x.serial})` : ''} × {x.qty} — {money(x.price * x.qty)}</p>)}</div>}
            {d.note && <p className="mt-3"><span className="font-semibold">Note:</span> {d.note}</p>}
          </div>
          <table className="w-64 text-xs">
            <tbody>
              {([['Subtotal', d.gross], ['Item discount', -d.item_discount], ['Discount', -d.discount], ['VAT', d.vat], [m.rate === 'cost' ? 'Tax' : 'AIT', d.ait], [d.other_name || 'Other charges', d.other], ['Freight', d.freight], ['Points redeemed', -d.redeem], ['Less', -d.less], ['Exchange', -d.exchange]] as [string, number][]).filter(([, v]) => Number(v)).map(([k, v]) => (
                <tr key={k}><td className="py-0.5 text-neutral-600">{k}</td><td className="num py-0.5 text-right">{money(v, false)}</td></tr>
              ))}
              <tr className="border-t border-black text-sm font-bold"><td className="py-1">Total</td><td className="num py-1 text-right">{money(d.total)}</td></tr>
              {m.payments && <tr><td className="py-0.5">{d.kind.includes('return') ? 'Refund' : 'Paid'}</td><td className="num py-0.5 text-right">{money(d.paid, false)}</td></tr>}
              {m.payments && !d.kind.includes('return') && <tr className="font-semibold"><td className="py-0.5">Invoice due</td><td className="num py-0.5 text-right">{money(Number(d.total) - Number(d.paid), false)}</td></tr>}
              {m.payments && p && !isWalk && m.party === 'customer' && <tr><td className="py-0.5 text-neutral-600">Total due (all invoices)</td><td className="num py-0.5 text-right">{money(totalDue, false)}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {challan && <p className="mt-4 text-xs">Total items: {num(lines.reduce((a: number, l: any) => a + l.qty, 0))}</p>}
      {data.notes.invoice_terms && !challan && <p className="mt-6 whitespace-pre-line border-t border-neutral-300 pt-2 text-[10.5px] text-neutral-600">{data.notes.invoice_terms}</p>}
      <div className="mt-16 grid grid-cols-3 gap-8 text-center text-[11px]">
        <div className="border-t border-black pt-1">{m.party === 'customer' ? 'Customer signature' : 'Supplier signature'}</div>
        <div className="border-t border-black pt-1">Checked by</div>
        <div className="border-t border-black pt-1">Authorised signature</div>
      </div>
      {data.notes.invoice_note && <p className="mt-6 text-center text-[11px] text-neutral-600">{data.notes.invoice_note}</p>}
    </div>
  );
}

function PosReceipt({ data }: { data: D }) {
  const d = data.doc;
  const p = data.party;
  return (
    <div className="print-area pos-receipt rounded-lg border border-line bg-white p-3 font-mono text-black shadow-card">
      <div className="text-center">
        {data.company?.logo && <img src={data.company.logo} alt="" className="mx-auto mb-1 h-10 object-contain" />}
        <p className="text-sm font-bold">{data.notes.pos_name || data.company?.name}</p>
        <p className="text-[10px]">{data.company?.saddress || data.company?.address}</p>
        <p className="text-[10px]">{data.company?.mobile}</p>
      </div>
      <div className="my-2 border-y border-dashed border-black py-1 text-[10px]">
        <p>{d.no}</p><p>{dateTime(d.created_at)}</p>
        <p>Customer: {p?.is_walkin ? d.walkin_name || 'Walk-in' : p?.name} {(p?.is_walkin ? d.walkin_mobile : p?.mobile) ?? ''}</p>
        <p>Served by: {d.created_by_name}</p>
      </div>
      {data.lines.map((l: any) => (
        <div key={l.id} className="mb-1 text-[10.5px]">
          <p>{l.name}</p>
          {l.serials.length > 0 && <p className="text-[9.5px]">SN {l.serials.join(', ')}</p>}
          <div className="flex justify-between"><span>{num(l.qty)} × {money(l.price, false)}{(l.disc_pct || l.disc) ? ' (disc)' : ''}</span><span>{money(l.subtotal, false)}</span></div>
        </div>
      ))}
      <div className="mt-2 space-y-0.5 border-t border-dashed border-black pt-1 text-[10.5px]">
        {([['Subtotal', d.gross], ['Discount', -(Number(d.item_discount) + Number(d.discount))], ['VAT', d.vat], ['AIT', d.ait], [d.other_name || 'Other', d.other], ['Freight', d.freight], ['Points', -d.redeem], ['Less', -d.less], ['Exchange', -d.exchange]] as [string, number][]).filter(([, v]) => Number(v)).map(([k, v]) => (
          <div key={k} className="flex justify-between"><span>{k}</span><span>{money(v, false)}</span></div>
        ))}
        <div className="flex justify-between border-t border-black pt-0.5 text-[12px] font-bold"><span>TOTAL</span><span>{money(d.total, false)}</span></div>
        {data.payments.map((x: any) => <div key={x.id} className="flex justify-between"><span>{x.ledger_name}</span><span>{money(x.amount, false)}</span></div>)}
        <div className="flex justify-between font-bold"><span>Due</span><span>{money(Number(d.total) - Number(d.paid), false)}</span></div>
      </div>
      <p className="mt-3 text-center text-[10px]">{data.notes.pos_receipt_note}</p>
    </div>
  );
}
