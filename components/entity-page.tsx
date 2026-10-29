'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Eye, FileText, Pencil, Plus, Printer, Trash2, Upload } from 'lucide-react';
import { entity as getEntity, type Entity } from '@/lib/entities';
import { rpc, useRpc } from '@/lib/client/rpc';
import { downloadCsv, parseCsv } from '@/lib/format';
import { Button, Card, ErrorBox, IconButton, PageHeader } from '@/components/ui/primitives';
import { DataTable, Pager, SearchInput, cell, type Col } from '@/components/ui/table';
import { Drawer, Modal, useUI } from '@/components/ui/overlay';
import { invalidateLookups } from '@/components/ui/combobox';
import { FieldInput, FormGrid } from '@/components/forms';
import { HistoryButton } from '@/components/history';
import { LedgerStatement } from '@/components/statement';
import { ProductDetails } from '@/components/product-details';
import { Guard, useSession } from '@/components/shell/session';

export function EntityPage({ entityKey }: { entityKey: string }) {
  let e: Entity;
  try { e = getEntity(entityKey); } catch { return <ErrorBox error={`Unknown screen "${entityKey}".`} />; }
  return <Guard module={e.module}><EntityScreen key={entityKey} e={e} /></Guard>;
}

function EntityScreen({ e }: { e: Entity }) {
  const { can, company } = useSession();
  const { toast, confirm } = useUI();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | undefined>();
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [editing, setEditing] = useState<{ id?: number; values: Record<string, any> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [stmt, setStmt] = useState<{ ledgerId: number; title: string } | null>(null);
  const [view, setView] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const args = useMemo(() => ({ q, filters, sort: sort?.key, dir: sort?.dir, page, size }), [q, filters, sort, page, size]);
  const { data, error, loading, reload } = useRpc('crud.list', [e.key, args], [e.key, JSON.stringify(args)]);

  // deep links: ?new=1, ?view=ID
  useEffect(() => {
    if (params.get('new') && can(e.module, 'write')) openNew();
    const v = Number(params.get('view'));
    if (v) {
      if (e.key === 'product') setView(v);
      else if (e.statement) rpc('crud.getOne', e.key, v).then(r => setStmt({ ledgerId: e.key === 'ledger' ? r.id : r.ledger_id, title: r.name ?? r.acno })).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const openNew = () => {
    const values: Record<string, any> = {};
    for (const f of e.fields) if (f.default !== undefined) values[f.name] = f.default;
    for (const [k, v] of Object.entries(filters)) if (v) values[k] = v;
    setEditing({ values });
  };
  const openEdit = async (id: number) => {
    try { setEditing({ id, values: await rpc('crud.getOne', e.key, id) }); } catch (err: any) { toast(err.message, 'error'); }
  };
  const save = async (andNew = false) => {
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) await rpc('crud.updateOne', e.key, editing.id, editing.values);
      else await rpc('crud.create', e.key, editing.values);
      toast(`${e.label} ${editing.id ? 'updated' : 'saved'}`);
      invalidateLookups(e.key);
      if (andNew) openNew(); else setEditing(null);
      if (params.get('new')) router.replace(window.location.pathname);
      reload();
    } catch (err: any) { toast(err.message, 'error'); } finally { setSaving(false); }
  };
  const del = async (row: any) => {
    if (!(await confirm({ title: `Delete ${e.label.toLowerCase()}?`, body: <>“{row.name ?? row.acno ?? row.code}” will be removed permanently.</>, confirm: 'Delete', danger: true }))) return;
    try { await rpc('crud.remove', e.key, row.id); toast(`${e.label} deleted`); invalidateLookups(e.key); reload(); } catch (err: any) { toast(err.message, 'error'); }
  };
  const exportCsv = async () => {
    const all = await rpc('crud.list', e.key, { ...args, page: 1, size: 5000 });
    const cols = e.columns.filter(c => c.type !== 'image');
    downloadCsv(e.plural.toLowerCase().replace(/\s+/g, '-'), cols.map(c => c.label), all.rows.map((r: any) => cols.map(c => r[c.key])));
  };

  const columns: Col[] = [
    ...e.columns.map(c => ({ ...c, sortable: true, render: c.key === 'name' && (e.key === 'product' || e.statement) ? (r: any) => <span className="font-medium text-ink">{r.name}</span> : undefined } as Col)),
    {
      key: '__actions', label: '', align: 'right', width: '1%', sortable: false,
      render: (r: any) => (
        <div className="flex justify-end gap-0.5 opacity-60 group-hover:opacity-100 no-print" onClick={ev => ev.stopPropagation()}>
          {e.key === 'product' && <IconButton label="Details" onClick={() => setView(r.id)}><Eye className="size-4" /></IconButton>}
          {e.statement && (r.ledger_id || e.key === 'ledger') && <IconButton label="Statement" onClick={() => setStmt({ ledgerId: e.key === 'ledger' ? r.id : r.ledger_id, title: r.name ?? r.acno })}><FileText className="size-4" /></IconButton>}
          {!e.readOnly && can(e.module, 'edit') && <IconButton label="Edit" onClick={() => openEdit(r.id)}><Pencil className="size-4" /></IconButton>}
          {!e.readOnly && !e.noDelete && can(e.module, 'delete') && <IconButton label="Delete" onClick={() => del(r)} className="hover:!text-bad"><Trash2 className="size-4" /></IconButton>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="hidden print:block mb-4"><p className="text-lg font-bold">{company?.name}</p><p className="text-sm">{e.plural}</p></div>
      <PageHeader title={e.plural} subtitle={data ? `${data.total} record${data.total === 1 ? '' : 's'}` : ' '}
        actions={<>
          <HistoryButton entities={[e.key]} />
          {!e.readOnly && can(e.module, 'write') && <Button variant="ghost" icon={<Upload className="size-4" />} onClick={() => setImportOpen(true)}>Import</Button>}
          <Button variant="ghost" icon={<Download className="size-4" />} onClick={exportCsv}>Export</Button>
          {can(e.module, 'print') && <Button variant="ghost" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>}
          {!e.readOnly && can(e.module, 'write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNew}>New {e.label.toLowerCase()}</Button>}
        </>} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      <Card pad={false} className="print-area">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 no-print">
          <SearchInput value={q} onChange={v => { setQ(v); setPage(1); }} placeholder={`Search ${e.plural.toLowerCase()}…`} className="w-full sm:w-72" />
          {e.filters?.map(f => (
            <div key={f.name} className="w-full sm:w-48">
              <FieldInput f={{ ...f, placeholder: f.label }} value={filters[f.name] ?? ''} values={filters} onChange={v => { setFilters(x => ({ ...x, [f.name]: v })); setPage(1); }} />
            </div>
          ))}
          {Object.values(filters).some(Boolean) && <Button size="sm" variant="ghost" onClick={() => setFilters({})}>Clear filters</Button>}
        </div>
        <DataTable columns={columns} rows={data?.rows ?? []} loading={loading} sort={sort} onSort={s => { setSort(s); setPage(1); }}
          onRowClick={e.key === 'product' ? r => setView(r.id) : !e.readOnly && can(e.module, 'edit') ? r => openEdit(r.id) : undefined}
          empty={<div className="py-14 text-center"><p className="text-sm font-medium">No {e.plural.toLowerCase()} yet</p>{!e.readOnly && can(e.module, 'write') && <Button className="mt-3" variant="soft" icon={<Plus className="size-4" />} onClick={openNew}>Add the first one</Button>}</div>} />
        {data && <Pager page={page} size={size} total={data.total} onPage={setPage} onSize={s => { setSize(s); setPage(1); }} />}
      </Card>

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${e.label.toLowerCase()}` : `New ${e.label.toLowerCase()}`} subtitle={editing?.values.code ? `Code ${editing.values.code}` : undefined}
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button>{!editing?.id && <Button onClick={() => save(true)} loading={saving}>Save & add another</Button>}<Button variant="primary" onClick={() => save(false)} loading={saving}>Save</Button></>}>
        {editing && (
          <form onSubmit={ev => { ev.preventDefault(); void save(false); }} onKeyDown={ev => { if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') void save(false); }}>
            <FormGrid fields={e.fields} values={editing.values} creating={!editing.id} onChange={(n, v) => setEditing(s => (s ? { ...s, values: { ...s.values, [n]: v } } : s))} />
            <button type="submit" className="hidden" />
          </form>
        )}
      </Drawer>

      <Drawer open={!!stmt} onClose={() => { setStmt(null); if (params.get('view')) router.replace(window.location.pathname); }} title="Account statement" width="max-w-4xl">
        {stmt && <LedgerStatement ledgerId={stmt.ledgerId} title={stmt.title} />}
      </Drawer>
      {e.key === 'product' && <ProductDetails id={view} onClose={() => { setView(null); if (params.get('view')) router.replace(window.location.pathname); }} />}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} e={e} onDone={() => { reload(); invalidateLookups(e.key); }} />
    </div>
  );
}

function ImportModal({ open, onClose, e, onDone }: { open: boolean; onClose: () => void; e: Entity; onDone: () => void }) {
  const { toast } = useUI();
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; errors: string[] } | null>(null);
  const fields = e.fields.filter(f => !f.auto && f.type !== 'image');
  const template = () => downloadCsv(`${e.key}-template`, fields.map(f => f.label), []);
  const run = async () => {
    setBusy(true);
    try { const r = await rpc('crud.importRows', e.key, rows); setResult(r); toast(`${r.ok} row(s) imported`); onDone(); } catch (err: any) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={() => { onClose(); setRows([]); setResult(null); }} title={`Import ${e.plural.toLowerCase()} from CSV`} size="lg"
      footer={<><Button onClick={template} icon={<Download className="size-4" />}>Download template</Button><Button variant="primary" disabled={!rows.length} loading={busy} onClick={run}>Import {rows.length || ''} row(s)</Button></>}>
      <p className="text-sm text-muted">Use column headers matching the field labels ({fields.slice(0, 6).map(f => f.label).join(', ')}…). Reference columns (category, brand, group…) can contain names.</p>
      <button type="button" onClick={() => file.current?.click()} className="mt-4 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line-strong py-8 text-sm text-muted hover:border-brand hover:text-brand">
        <Upload className="size-6" />{rows.length ? `${rows.length} rows ready — click to choose another file` : 'Choose a .csv file'}
      </button>
      <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={async ev => { const f = ev.target.files?.[0]; if (f) { setRows(parseCsv(await f.text())); setResult(null); } ev.target.value = ''; }} />
      {rows.length > 0 && !result && (
        <div className="mt-4 max-h-56 overflow-auto rounded-lg border border-line text-xs">
          <table className="w-full"><thead><tr>{Object.keys(rows[0]).map(k => <th key={k} className="bg-surface-2 px-2 py-1 text-left">{k}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 8).map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j} className="border-t border-line px-2 py-1">{cell('text', v)}</td>)}</tr>)}</tbody></table>
        </div>
      )}
      {result && <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm"><p className="font-medium text-ok">{result.ok} imported</p>{result.errors.map((er, i) => <p key={i} className="text-xs text-bad">{er}</p>)}</div>}
    </Modal>
  );
}
