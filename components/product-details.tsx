'use client';
import Link from 'next/link';
import { useRpc } from '@/lib/client/rpc';
import { date, dateTime, KIND_LABEL, money, num } from '@/lib/format';
import { Badge, KeyVal, Loading, Tabs } from '@/components/ui/primitives';
import { Drawer } from '@/components/ui/overlay';
import { DataTable } from '@/components/ui/table';
import { useState } from 'react';

export function ProductDetails({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data } = useRpc(id ? 'stock.productDetails' : null, [id ?? 0], [id]);
  const [tab, setTab] = useState<'stock' | 'moves' | 'serials' | 'prices'>('stock');
  const p = data?.product;
  return (
    <Drawer open={!!id} onClose={onClose} title={p?.name ?? 'Product'} subtitle={p ? `${p.code}${p.model ? ` · ${p.model}` : ''}` : undefined} width="max-w-3xl">
      {!data || !p ? <Loading /> : (
        <div className="space-y-5">
          <div className="flex gap-4">
            {p.image ? <img src={p.image} alt="" className="size-28 rounded-xl border border-line object-cover" /> : <div className="size-28 rounded-xl bg-surface-3" />}
            <div className="flex-1">
              <KeyVal cols={3} items={[
                ['Price', money(p.price)], ['Cost (last)', money(p.cost)], ['Average cost', money(data.avg_cost)],
                ['In stock', num(data.stock.reduce((s: number, r: any) => s + r.qty, 0))], ['Category', p.category], ['Brand', p.brand],
                ['Mode', <Badge key="m">{p.mode}</Badge>], ['Warranty', p.warranty_days ? `${p.warranty_days} days` : 'None'], ['Min stock', p.min_stock],
              ]} />
            </div>
          </div>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'stock', label: 'Stock by location', count: data.stock.length }, { value: 'moves', label: 'Movements', count: data.moves.length }, { value: 'serials', label: 'Serials', count: data.serials.length }, { value: 'prices', label: 'Price history', count: data.prices.length }]} />
          <div className="rounded-xl border border-line">
            {tab === 'stock' && <DataTable dense rows={data.stock} rowKey="location" columns={[{ key: 'location', label: 'Location', render: r => `${r.location} (${r.loc_type === 'W' ? 'Warehouse' : 'Branch'})` }, { key: 'color', label: 'Color' }, { key: 'size', label: 'Size' }, { key: 'qty', label: 'Qty', type: 'number' }]} />}
            {tab === 'moves' && <DataTable dense rows={data.moves} rowKey="__i" columns={[{ key: 'date', label: 'Date', type: 'date' }, { key: 'kind', label: 'Type', render: r => <Badge>{KIND_LABEL[r.kind] ?? r.kind.replace('_', ' ')}</Badge> }, { key: 'ref_no', label: 'Reference', render: r => r.ref_type === 'doc' ? <Link className="text-brand hover:underline" href={`/doc/${r.kind === 'opening' || r.kind === 'exchange' ? (r.kind === 'opening' ? 'purchase' : 'sale') : r.kind}/${r.ref_id}`}>{r.ref_no}</Link> : r.ref_no }, { key: 'qty', label: 'Qty', type: 'number' }, { key: 'cost', label: 'Cost', type: 'money' }, { key: 'price', label: 'Price', type: 'money' }]} />}
            {tab === 'serials' && <DataTable dense rows={data.serials} rowKey="serial" columns={[{ key: 'serial', label: 'Serial', render: r => <span className="font-mono text-xs">{r.serial}</span> }, { key: 'status', label: 'Status', type: 'badge' }, { key: 'created_at', label: 'Added', type: 'datetime' }]} />}
            {tab === 'prices' && <DataTable dense rows={data.prices} columns={[{ key: 'at', label: 'When', render: r => dateTime(r.at) }, { key: 'old_price', label: 'Old', type: 'money' }, { key: 'new_price', label: 'New', type: 'money' }, { key: 'user_name', label: 'By' }]} />}
          </div>
          {p.description && <p className="whitespace-pre-line text-sm text-ink-2">{p.description}</p>}
          <p className="text-xs text-muted">Created {date(p.created_at)}{p.price_updated_at ? ` · price updated ${dateTime(p.price_updated_at)}` : ''}</p>
        </div>
      )}
    </Drawer>
  );
}
