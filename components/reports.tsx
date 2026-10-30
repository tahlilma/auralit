'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, FileBarChart, Play, Printer, Search, Star } from 'lucide-react';
import { rpc, useRpc, type RpcResult } from '@/lib/client/rpc';
import { REPORT_GROUPS, REPORT_MAP, STD_FILTERS } from '@/lib/reports-meta';
import { date, downloadCsv, monthStart, todayISO } from '@/lib/format';
import { Button, Card, cx, ErrorBox, Field, Input, PageHeader, Spinner } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/table';
import { FieldInput } from '@/components/forms';
import { Guard, useSession } from '@/components/shell/session';

const FAV = 'auralit.report-favs';

export function ReportCenter() {
  const { data } = useRpc('reports.reportCatalog', [], []);
  const [q, setQ] = useState('');
  const [favs, setFavs] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(FAV) ?? '[]'); } catch { return []; } });
  const toggle = (k: string) => { const n = favs.includes(k) ? favs.filter(x => x !== k) : [...favs, k]; setFavs(n); try { localStorage.setItem(FAV, JSON.stringify(n)); } catch { /* ignore */ } };
  const term = q.toLowerCase();
  const list = (data ?? []).filter((r: any) => !term || `${r.title} ${r.desc} ${r.group}`.toLowerCase().includes(term));
  const tile = (r: any) => (
    <div key={r.key} className="group relative rounded-lg border border-line bg-surface p-3.5 transition-colors hover:border-line-strong hover:bg-surface-2">
      <Link href={`/reports/${r.key}`} className="block pr-6"><p className="text-[14px] font-medium text-ink">{r.title}</p><p className="mt-0.5 text-[13px] text-muted">{r.desc}</p></Link>
      <button onClick={() => toggle(r.key)} className={cx('absolute right-2.5 top-2.5', favs.includes(r.key) ? 'text-ink-2' : 'text-line-strong hover:text-muted')} aria-label="Favourite"><Star className="size-4" fill={favs.includes(r.key) ? 'currentColor' : 'none'} /></button>
    </div>
  );
  return (
    <Guard module="report">
      <PageHeader title="Report center" subtitle={data ? `${data.length} reports available to you` : ' '} actions={<div className="relative w-72"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input className="pl-8" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Find a report…" /></div>} />
      {!data ? <Spinner /> : (
        <div className="space-y-6">
          {favs.length > 0 && !term && <div><p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink-2"><Star className="size-3.5" /> Favourites</p><div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{data.filter((r: any) => favs.includes(r.key)).map(tile)}</div></div>}
          {REPORT_GROUPS.map(g => {
            const items = list.filter((r: any) => r.group === g);
            if (!items.length) return null;
            return <div key={g}><h2 className="mb-2.5 text-[15px] font-semibold text-ink">{g} <span className="ml-1 text-[13px] font-normal text-muted">{items.length}</span></h2><div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map(tile)}</div></div>;
          })}
          {!list.length && <p className="py-10 text-center text-sm text-muted">No report matches “{q}”.</p>}
        </div>
      )}
    </Guard>
  );
}

type Res = RpcResult<'reports.runReport'>;

export function ReportRunner({ reportKey }: { reportKey: string }) {
  const meta = REPORT_MAP[reportKey];
  const { company } = useSession();
  const router = useRouter();
  const sp = useSearchParams();
  const fields = useMemo(() => meta ? [...meta.filters.flatMap(f => STD_FILTERS[f] ?? []), ...(meta.extra ?? [])] : [], [meta]);
  const [params, setParams] = useState<Record<string, any>>(() => {
    const p: Record<string, any> = {};
    for (const f of fields) if (f.default !== undefined) p[f.name] = f.default;
    if (meta?.filters.includes('range')) { p.from = monthStart(); p.to = todayISO(); }
    if (meta?.filters.includes('asof')) p.to = todayISO();
    sp.forEach((v, k) => { p[k] = v; });
    return p;
  });
  const [res, setRes] = useState<Res | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const run = async (auto = false) => {
    setBusy(true); setError(null); setHint(null);
    try { setRes(await rpc('reports.runReport', reportKey, params)); } catch (e: any) { if (auto) setHint(e.message); else setError(e.message); setRes(null); } finally { setBusy(false); }
  };
  useEffect(() => { if (meta) void run(true); }, [reportKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!meta) return <ErrorBox error="Unknown report." />;
  const csv = () => {
    if (!res) return;
    const rows: (string | number)[][] = [];
    for (const s of res.sections) {
      if (s.title) rows.push([s.title]);
      rows.push(s.columns.map(c => c.label));
      for (const r of s.rows) rows.push(s.columns.map(c => r[c.key] ?? ''));
      if (s.totals) rows.push(s.columns.map((c, i) => (c.key in s.totals! ? s.totals![c.key] : i === 0 ? 'Total' : '')));
      rows.push([]);
    }
    downloadCsv(meta.title, [meta.title], rows);
  };
  return (
    <Guard module="report">
      <PageHeader back="/reports" title={meta.title} subtitle={meta.desc}
        actions={res && <><Button variant="ghost" icon={<Download className="size-4" />} onClick={csv}>CSV</Button><Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button></>} />
      <Card className="no-print">
        <form onSubmit={e => { e.preventDefault(); void run(); }} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {fields.map(f => (
            <Field key={f.name} label={f.label}>
              <FieldInput f={f} value={params[f.name] ?? ''} values={params} onChange={v => setParams(p => { const n = { ...p, [f.name]: v }; for (const d of fields.filter(x => x.dependsOn === f.name)) n[d.name] = null; return n; })} />
            </Field>
          ))}
          <div className="flex items-end"><Button type="submit" variant="primary" icon={<Play className="size-4" />} loading={busy} className="w-full">Run report</Button></div>
        </form>
      </Card>
      {error && <div className="mt-4"><ErrorBox error={error} /></div>}
      {!res && !error && <div className="mt-10 flex flex-col items-center gap-2 text-sm text-muted">{busy ? <Spinner /> : <><FileBarChart className="size-8 text-line-strong" />{hint ? `${hint.replace(/\.$/, '')}, then run the report.` : 'Set the filters and run the report.'}</>}</div>}
      {res && (
        <div className={cx('print-area mt-4', meta.landscape && 'print:[zoom:0.8]')}>
          <div className="mb-3 text-center">
            <p className="text-lg font-bold">{company?.name}</p>
            <p className="text-[15px] font-semibold">{meta.title}</p>
            <p className="text-xs text-muted">{params.from || params.to ? `${params.from ? date(params.from) : 'Beginning'} → ${date(params.to || todayISO())}` : `As of ${date(todayISO())}`}</p>
          </div>
          {res.sections.map((s, i) => (
            <Card key={i} pad={false} title={s.title} className="mb-4 break-inside-avoid">
              <DataTable dense rows={s.rows} rowKey="__i" totals={s.totals} stickyHead={false}
                columns={s.columns.map(c => ({ key: c.key, label: c.label, type: c.type as any, render: c.key === 'no' ? (r: any) => linkFor(r, router) : undefined }))} />
            </Card>
          ))}
        </div>
      )}
    </Guard>
  );
}

function linkFor(r: any, router: ReturnType<typeof useRouter>) {
  const no = r.no;
  if (!no) return '';
  return <button type="button" className="whitespace-nowrap font-medium text-brand hover:underline" onClick={async () => { const s = await rpc('admin.globalSearch', String(no)); const d = s.docs.find((x: any) => x.no === no); const v = s.vouchers.find((x: any) => x.no === no); if (d) router.push(`/doc/${d.kind}/${d.id}`); else if (v) router.push(`/vouchers/${v.type}/${v.id}`); }}>{no}</button>;
}

