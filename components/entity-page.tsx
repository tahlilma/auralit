'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Eye, FileText, History, ListFilter, Pencil, Plus, Printer, Trash2, Upload } from 'lucide-react';
import { entity as getEntity, type Entity } from '@/lib/entities';
import { rpc, useRpc } from '@/lib/client/rpc';
import { downloadCsv, num, parseCsv } from '@/lib/format';
import { Button, ErrorBox, PageHeader } from '@/components/ui/primitives';
import { DataTable, Pager, RowMenu, SearchInput, cell, type Col } from '@/components/ui/table';
import { Drawer, Modal, useUI } from '@/components/ui/overlay';
import { invalidateLookups } from '@/components/ui/combobox';
import { FieldInput, FormGrid } from '@/components/forms';
import { HistoryDrawer } from '@/components/history';
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
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | undefined>();
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [editing, setEditing] = useState<{ id?: number; values: Record<string, any> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [stmt, setStmt] = useState<{ ledgerId: number; title: string } | null>(null);
  const [view, setView] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const noun = e.label.toLowerCase();

  const args = useMemo(() => ({ q, filters, sort: sort?.key, dir: sort?.dir, page, size }), [q, filters, sort, page, size]);
  const { data, error, loading, reload } = useRpc('crud.list', [e.key, args], [e.key, JSON.stringify(args)]);

  const openNew = () => {
    const values: Record<string, any> = {};
    for (const f of e.fields) if (f.default !== undefined) values[f.name] = f.default;
    for (const [k, v] of Object.entries(filters)) if (v) values[k] = v;
    setEditing({ values });
  };
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
    if (!(await confirm({ title: `Delete this ${noun}?`, body: <>“{row.name ?? row.acno ?? row.code}” will be removed permanently.</>, confirm: 'Delete', danger: true }))) return;
    try { await rpc('crud.remove', e.key, row.id); toast(`${e.label} deleted`); invalidateLookups(e.key); reload(); } catch (err: any) { toast(err.message, 'error'); }
  };
  const exportCsv = async () => {
    const all = await rpc('crud.list', e.key, { ...args, page: 1, size: 5000 });
    const cols = e.columns.filter(c => c.type !== 'image');
    downloadCsv(e.plural.toLowerCase().replace(/\s+/g, '-'), cols.map(c => c.label), all.rows.map((r: any) => cols.map(c => r[c.key])));
  };

  const canEdit = !e.readOnly && can(e.module, 'edit');
  // the identity cell carries the code and mobile as a grey subline instead of two digit columns
  const hasName = e.columns.some(c => c.key === 'name');
  const merged = new Set(hasName ? ['code', 'mobile'].filter(k => e.columns.some(c => c.key === k)) : []);
  const columns: Col[] = [
    ...e.columns.filter(c => !merged.has(c.key) && (c.type !== 'image' || (data?.rows ?? []).some((r: any) => r[c.key]))).map(c => ({
      ...c, sortable: true,
      type: c.key === 'code' ? 'id' : c.type,
      render: c.key === 'name' ? (r: any) => (
        <div className="min-w-0 max-w-[340px]">
          <p className="truncate font-medium text-ink">{r.name}</p>
          {merged.size > 0 && (r.code || r.mobile) && <p className="truncate text-[12.5px] text-muted">{r.code && <span className="id">{r.code}</span>}{r.code && r.mobile ? ' · ' : ''}{merged.has('mobile') ? r.mobile : ''}</p>}
        </div>
      ) : undefined,
    } as Col)),
    {
      key: '__actions', label: <span className="sr-only">Actions</span>, align: 'right', width: '1%', sortable: false,
      render: (r: any) => (
        <RowMenu label={`Actions for ${r.name ?? r.acno ?? r.code}`} actions={[
          { label: 'View details', icon: <Eye className="size-4" />, onClick: () => setView(r.id), hidden: e.key !== 'product' },
          { label: 'Account statement', icon: <FileText className="size-4" />, onClick: () => setStmt({ ledgerId: e.key === 'ledger' ? r.id : r.ledger_id, title: r.name ?? r.acno }), hidden: !(e.statement && (r.ledger_id || e.key === 'ledger')) },
          { label: 'Edit', icon: <Pencil className="size-4" />, onClick: () => openEdit(r.id), hidden: !canEdit },
          { label: 'Delete', icon: <Trash2 className="size-4" />, onClick: () => del(r), danger: true, hidden: e.readOnly || e.noDelete || !can(e.module, 'delete') },
        ]} />
      ),
    },
  ];
  const hasFilters = Object.values(filters).some(Boolean) || !!q;

  return (
    <div>
      <div className="mb-4 hidden print:block"><p className="text-lg font-bold">{company?.name}</p><p className="text-sm">{e.plural}</p></div>
      <PageHeader title={e.plural} subtitle={e.description}
        actions={<>
          <RowMenu button="More" actions={[
            { label: 'Import from CSV', icon: <Upload className="size-4" />, onClick: () => setImportOpen(true), hidden: e.readOnly || !can(e.module, 'write') },
            { label: 'Export to CSV', icon: <Download className="size-4" />, onClick: exportCsv },
            { label: 'Print this list', icon: <Printer className="size-4" />, onClick: () => window.print(), hidden: !can(e.module, 'print') },
            { label: 'Change history', icon: <History className="size-4" />, onClick: () => setHistoryOpen(true) },
          ]} />
          {!e.readOnly && can(e.module, 'write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNew}>New {noun}</Button>}
        </>} />
      {error && <ErrorBox error={error} onRetry={reload} />}
      <div className="mb-3 flex flex-wrap items-center gap-2 no-print">
        <SearchInput value={q} onChange={v => { setQ(v); setPage(1); }} placeholder={`Search ${e.plural.toLowerCase()}`} className="min-w-0 flex-1 sm:w-80 sm:flex-none" />
        {/* On a phone the filters fold behind one button so the list starts on the first screen. */}
        {!!e.filters?.length && (
          <Button className="sm:hidden" icon={<ListFilter className="size-4" />} onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}>
            Filters{Object.values(filters).filter(Boolean).length ? ` (${Object.values(filters).filter(Boolean).length})` : ''}
          </Button>
        )}
        {e.filters?.map(f => (
          <div key={f.name} className={showFilters ? 'w-full sm:w-48' : 'hidden sm:block sm:w-48'}>
            <FieldInput f={{ ...f, placeholder: f.label }} value={filters[f.name] ?? ''} values={filters} onChange={v => { setFilters(x => ({ ...x, [f.name]: v })); setPage(1); }} />
          </div>
        ))}
        {Object.values(filters).some(Boolean) && <Button size="sm" variant="ghost" onClick={() => setFilters({})}>Clear filters</Button>}
        {data && <span className="ml-auto text-[13px] text-muted">{num(data.total)} {data.total === 1 ? noun : e.plural.toLowerCase()}</span>}
      </div>
      <div className="print-area">
        <DataTable bleed columns={columns} rows={data?.rows ?? []} loading={loading} sort={sort} onSort={s => { setSort(s); setPage(1); }}
          onRowClick={e.key === 'product' ? r => setView(r.id) : canEdit ? r => openEdit(r.id) : undefined}
          empty={
            <div className="py-14 text-center">
              <p className="text-[14px] font-medium text-ink">{hasFilters ? `No ${e.plural.toLowerCase()} match these filters` : `No ${e.plural.toLowerCase()} yet`}</p>
              {!hasFilters && !e.readOnly && can(e.module, 'write') && <Button className="mt-3" icon={<Plus className="size-4" />} onClick={openNew}>Add the first {noun}</Button>}
            </div>
          } />
        {data && data.total > size && <Pager flush page={page} size={size} total={data.total} onPage={setPage} onSize={s => { setSize(s); setPage(1); }} />}
      </div>

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${noun}` : `New ${noun}`} subtitle={editing?.values.code ? `Code ${editing.values.code}` : undefined}
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button>{!editing?.id && <Button onClick={() => save(true)} loading={saving}>Save and add another</Button>}<Button variant="primary" onClick={() => save(false)} loading={saving}>Save</Button></>}>
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
      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} entities={[e.key]} />
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
      <p className="text-[14px] text-muted">Use column headers that match the field names ({fields.slice(0, 6).map(f => f.label).join(', ')}…). Columns that point to other lists (category, brand, group) can hold the name.</p>
      <button type="button" onClick={() => file.current?.click()} className="mt-4 flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong py-8 text-[14px] text-muted hover:border-ink-2 hover:text-ink">
        <Upload className="size-5" />{rows.length ? `${rows.length} rows ready. Choose another file` : 'Choose a .csv file'}
      </button>
      <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={async ev => { const f = ev.target.files?.[0]; if (f) { setRows(parseCsv(await f.text())); setResult(null); } ev.target.value = ''; }} />
      {rows.length > 0 && !result && (
        <div className="thin-scroll mt-4 max-h-56 overflow-auto rounded-lg border border-line text-[12.5px]">
          <table className="w-full"><thead><tr>{Object.keys(rows[0]).map(k => <th key={k} className="border-b border-line px-2 py-1.5 text-left font-normal text-muted">{k}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 8).map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j} className="border-b border-rule px-2 py-1.5">{cell('text', v)}</td>)}</tr>)}</tbody></table>
        </div>
      )}
      {result && <div className="mt-4 rounded-lg bg-surface-2 p-3 text-[14px]"><p className="font-medium text-ok">{result.ok} imported</p>{result.errors.map((er, i) => <p key={i} className="text-[12.5px] text-bad">{er}</p>)}</div>}
    </Modal>
  );
}
