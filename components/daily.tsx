'use client';
import { useMemo, useState } from 'react';
import { Barcode, Download, Printer, Save } from 'lucide-react';
import { rpc, useRpc } from '@/lib/client/rpc';
import { barcodeSvg } from '@/lib/barcode';
import { downloadCsv, money } from '@/lib/format';
import { Button, Card, Checkbox, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { Combobox, useLookup } from '@/components/ui/combobox';
import { DataTable, SearchInput, type Col } from '@/components/ui/table';
import { useUI } from '@/components/ui/overlay';
import { HistoryButton } from '@/components/history';
import { ProductDetails } from '@/components/product-details';
import { Guard, useSession } from '@/components/shell/session';

function Filters({ q, setQ, cat, setCat, brand, setBrand }: { q: string; setQ: (v: string) => void; cat: number | null; setCat: (v: number | null) => void; brand: number | null; setBrand: (v: number | null) => void }) {
  const cats = useLookup('category');
  const brands = useLookup('brand');
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 no-print">
      <SearchInput value={q} onChange={setQ} placeholder="Name, code, barcode, model…" className="w-full sm:w-72" />
      <div className="w-48"><Combobox value={cat} onChange={setCat} options={cats.options} placeholder="All categories" /></div>
      <div className="w-48"><Combobox value={brand} onChange={setBrand} options={brands.options} placeholder="All brands" /></div>
    </div>
  );
}

export function PriceList() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<number | null>(null);
  const [brand, setBrand] = useState<number | null>(null);
  const [view, setView] = useState<number | null>(null);
  const { data, loading } = useRpc('stock.priceList', [{ q, category_id: cat ?? undefined, brand_id: brand ?? undefined }], [q, cat, brand]);
  const cols: Col[] = [
    { key: 'name', label: 'Name', render: r => <button className="text-left font-medium hover:text-brand" onClick={() => setView(r.id)}>{r.name}</button> },
    { key: 'colors', label: 'Color' }, { key: 'sizes', label: 'Size' }, { key: 'code', label: 'Code' }, { key: 'last_purchase', label: 'Pur. Inv' },
    { key: 'barcode', label: 'Barcode', render: r => <span className="font-mono text-xs">{r.barcode}</span> },
    { key: 'qty', label: 'Available', type: 'number' }, { key: 'old_price', label: 'Old Price', type: 'money' }, { key: 'price', label: 'Current Price', type: 'money' },
    { key: 'warranty_days', label: 'Warranty', render: r => r.warranty_days ? `${r.warranty_days} days` : '—' }, { key: 'price_updated_at', label: 'Last Update', type: 'datetime' },
  ];
  return (
    <Guard module="daily">
      <PageHeader title="Price List" actions={<>
        <HistoryButton entities={['price']} />
        <Button variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadCsv('price-list', ['Name', 'Code', 'Barcode', 'Qty', 'Old price', 'Price', 'Warranty'], (data ?? []).map((r: any) => [r.name, r.code, r.barcode, r.qty, r.old_price, r.price, r.warranty_days]))}>CSV</Button>
        <Button variant="ghost" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>
        <Button icon={<Barcode className="size-4" />} href="/daily/barcodes">Barcodes</Button>
        <Button variant="primary" href="/daily/prices/update">Update prices</Button>
      </>} />
      <Card pad={false} className="print-area">
        <Filters q={q} setQ={setQ} cat={cat} setCat={setCat} brand={brand} setBrand={setBrand} />
        <DataTable dense columns={cols} rows={data ?? []} loading={loading} />
      </Card>
      <ProductDetails id={view} onClose={() => setView(null)} />
    </Guard>
  );
}

export function PriceUpdate() {
  const { toast } = useUI();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<number | null>(null);
  const [brand, setBrand] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, { price?: string; currency_id?: number | null }>>({});
  const [pct, setPct] = useState('');
  const [busy, setBusy] = useState(false);
  const currencies = useLookup('currency');
  const { data, loading, reload } = useRpc('stock.priceList', [{ q, category_id: cat ?? undefined, brand_id: brand ?? undefined }], [q, cat, brand]);
  const changed = Object.entries(edits).filter(([, v]) => v.price !== undefined && v.price !== '' || v.currency_id);
  const save = async () => {
    setBusy(true);
    try {
      const r = await rpc('stock.updatePrices', changed.map(([id, v]) => ({ id: Number(id), price: v.price === undefined || v.price === '' ? (data ?? []).find((x: any) => x.id === Number(id))?.price : Number(v.price), currency_id: v.currency_id ?? null })));
      toast(`${r.updated} price(s) updated`); setEdits({}); reload();
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const applyPct = () => {
    const p = Number(pct);
    if (!p || !data) return;
    const next = { ...edits };
    for (const r of data as any[]) next[r.id] = { ...next[r.id], price: String(Math.round(r.price * (1 + p / 100) * 100) / 100) };
    setEdits(next);
  };
  const cols: Col[] = [
    { key: 'name', label: 'Name', render: r => <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.code}</p></div> },
    { key: 'qty', label: 'Available', type: 'number' }, { key: 'cost', label: 'Cost', type: 'money' }, { key: 'old_price', label: 'Old Price', type: 'money' }, { key: 'price', label: 'Current Price', type: 'money' },
    { key: 'currency', label: 'Currency', render: r => <Select inputSize="sm" className="w-36" value={edits[r.id]?.currency_id ?? r.currency_id ?? ''} onChange={e => setEdits({ ...edits, [r.id]: { ...edits[r.id], currency_id: Number(e.target.value) || null } })}><option value="">—</option>{currencies.options.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</Select> },
    { key: 'new', label: 'Update Price', render: r => <Input inputSize="sm" type="number" className="num w-32 text-right" value={edits[r.id]?.price ?? ''} placeholder={String(r.price)} onChange={e => setEdits({ ...edits, [r.id]: { ...edits[r.id], price: e.target.value } })} /> },
  ];
  return (
    <Guard module="daily" action="edit">
      <PageHeader back="/daily/prices" title="Add or Update Price" subtitle="Type new prices and save once. Every change is kept in the product's price history."
        actions={<Button variant="primary" icon={<Save className="size-4" />} disabled={!changed.length} loading={busy} onClick={save}>Update {changed.length || ''} price(s)</Button>} />
      <Card pad={false}>
        <Filters q={q} setQ={setQ} cat={cat} setCat={setCat} brand={brand} setBrand={setBrand} />
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 text-sm">
          <span className="text-muted">Bulk change listed items by</span><Input inputSize="sm" type="number" className="w-20" value={pct} onChange={e => setPct(e.target.value)} placeholder="%" /><span className="text-muted">%</span>
          <Button size="sm" onClick={applyPct}>Apply</Button>{changed.length > 0 && <Button size="sm" variant="ghost" onClick={() => setEdits({})}>Discard changes</Button>}
        </div>
        <DataTable dense columns={cols} rows={data ?? []} loading={loading} />
      </Card>
    </Guard>
  );
}

export function Barcodes() {
  const { company } = useSession();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<number | null>(null);
  const [brand, setBrand] = useState<number | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [opts, setOpts] = useState({ name: true, price: true, company: true, cols: 4, height: 38 });
  const { data, loading } = useRpc('stock.priceList', [{ q, category_id: cat ?? undefined, brand_id: brand ?? undefined }], [q, cat, brand]);
  const labels = useMemo(() => (data ?? []).flatMap((r: any) => Array.from({ length: qty[r.id] ?? 0 }, () => r)), [data, qty]);
  return (
    <Guard module="daily" action="print">
      <PageHeader back="/daily/prices" title="Barcode & Price Stickers" subtitle="Choose how many stickers to print for each product. Barcodes use the product barcode, or its code when no barcode is set."
        actions={<Button variant="primary" icon={<Printer className="size-4" />} disabled={!labels.length} onClick={() => window.print()}>Print {labels.length} sticker(s)</Button>} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] no-print">
        <Card pad={false}>
          <Filters q={q} setQ={setQ} cat={cat} setCat={setCat} brand={brand} setBrand={setBrand} />
          <DataTable dense loading={loading} rows={data ?? []} columns={[
            { key: 'name', label: 'Product', render: r => <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.barcode || r.code} · {money(r.price)}</p></div> },
            { key: 'qty', label: 'In stock', type: 'number' },
            { key: 'n', label: 'Stickers', render: r => <div className="flex items-center justify-end gap-1"><Input inputSize="sm" type="number" min={0} className="num w-20 text-right" value={qty[r.id] ?? ''} onChange={e => setQty({ ...qty, [r.id]: Math.max(0, Number(e.target.value) || 0) })} /><Button size="xs" variant="ghost" onClick={() => setQty({ ...qty, [r.id]: Math.max(0, Number(r.qty) || 1) })}>= stock</Button></div> },
          ]} />
        </Card>
        <Card title="Layout">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Columns per row"><Select value={opts.cols} onChange={e => setOpts({ ...opts, cols: Number(e.target.value) })}>{[2, 3, 4, 5, 6].map(n => <option key={n}>{n}</option>)}</Select></Field>
            <Field label="Bar height"><Input type="number" value={opts.height} onChange={e => setOpts({ ...opts, height: Number(e.target.value) || 38 })} /></Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-4"><Checkbox label="Product name" checked={opts.name} onChange={v => setOpts({ ...opts, name: v })} /><Checkbox label="Price" checked={opts.price} onChange={v => setOpts({ ...opts, price: v })} /><Checkbox label="Company" checked={opts.company} onChange={v => setOpts({ ...opts, company: v })} /></div>
          <p className="mt-4 text-xs text-muted">Preview</p>
          <div className="mt-2 rounded-lg border border-dashed border-line-strong p-2">{labels[0] ? <Sticker r={labels[0]} o={opts} company={company?.name} /> : <p className="py-6 text-center text-xs text-muted">Set a sticker count to preview.</p>}</div>
        </Card>
      </div>
      <div className="hidden print:grid" style={{ gridTemplateColumns: `repeat(${opts.cols}, minmax(0, 1fr))`, gap: '4mm' }}>
        {labels.map((r: any, i: number) => <Sticker key={i} r={r} o={opts} company={company?.name} />)}
      </div>
    </Guard>
  );
}

function Sticker({ r, o, company }: { r: any; o: { name: boolean; price: boolean; company: boolean; height: number }; company?: string }) {
  const code = String(r.barcode || r.code);
  const b = barcodeSvg(code);
  return (
    <div className="break-inside-avoid rounded border border-neutral-300 bg-white p-1.5 text-center text-black">
      {o.company && <p className="truncate text-[9px] font-semibold uppercase">{company}</p>}
      {o.name && <p className="truncate text-[10px]">{r.name}</p>}
      <svg viewBox={`0 0 ${b.width} ${o.height}`} className="mx-auto w-full" style={{ height: o.height }} preserveAspectRatio="none">{b.rects.map((x, i) => <rect key={i} x={x.x} y={0} width={x.w} height={o.height} fill="#000" />)}</svg>
      <p className="font-mono text-[9px] tracking-wider">{code}</p>
      {o.price && <p className="text-[11px] font-bold">{money(r.price)}</p>}
    </div>
  );
}

