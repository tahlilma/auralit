'use client';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Star, Trash2 } from 'lucide-react';
import { rpc, useRpc } from '@/lib/client/rpc';
import { date, isoOf, relative, todayISO } from '@/lib/format';
import { Badge, Button, Card, cx, Field, IconButton, Input, PageHeader, Select, Tabs, Textarea } from '@/components/ui/primitives';
import { Modal, useUI } from '@/components/ui/overlay';
import { Guard } from '@/components/shell/session';

const COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', '#fed7aa'];

export function Notes() {
  const { toast } = useUI();
  const { data, reload } = useRpc('admin.notes', [], []);
  const [edit, setEdit] = useState<Record<string, any> | null>(null);
  const [filter, setFilter] = useState<'all' | 'fav'>('all');
  const [label, setLabel] = useState('');
  const labels = useMemo(() => [...new Set((data ?? []).map((n: any) => n.label).filter(Boolean))] as string[], [data]);
  const list = (data ?? []).filter((n: any) => (filter === 'all' || n.favorite) && (!label || n.label === label));
  const save = async () => { await rpc('admin.saveNote', edit!, edit!.id); setEdit(null); reload(); toast('Note saved'); };
  return (
    <Guard module="personal">
      <PageHeader title="Personal notes" actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit({ title: '', body: '', color: COLORS[0] })}>New note</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={filter} onChange={setFilter} tabs={[{ value: 'all', label: 'All' }, { value: 'fav', label: 'Favourites' }]} />
        {labels.map(l => <button key={l} onClick={() => setLabel(label === l ? '' : l)} className={cx('rounded-full border px-2.5 py-1 text-[13px]', label === l ? 'border-brand bg-brand-soft text-brand' : 'border-line')}>{l}</button>)}
      </div>
      <div className="columns-1 gap-3 sm:columns-2 xl:columns-4">
        {list.map((n: any) => (
          <div key={n.id} onClick={() => setEdit(n)} className="mb-3 cursor-pointer break-inside-avoid rounded-lg border border-black/5 p-4 text-neutral-900 shadow-card transition hover:shadow-pop" style={{ background: n.color || COLORS[0] }}>
            <div className="flex items-start justify-between gap-2"><p className="font-semibold">{n.title || 'Untitled'}</p>
              <button onClick={async e => { e.stopPropagation(); await rpc('admin.saveNote', { ...n, favorite: !n.favorite }, n.id); reload(); }} aria-label="Favourite"><Star className="size-4" fill={n.favorite ? 'currentColor' : 'none'} /></button></div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
            <div className="mt-3 flex items-center justify-between text-[11px] opacity-70"><span>{n.label}</span><span>{relative(n.updated_at ?? n.created_at)}</span></div>
          </div>
        ))}
      </div>
      {!list.length && <p className="py-16 text-center text-sm text-muted">No notes yet.</p>}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit note' : 'New note'} footer={<>{edit?.id && <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={async () => { await rpc('admin.deleteNote', edit.id); setEdit(null); reload(); }}>Delete</Button>}<Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
        {edit && <div className="grid gap-3">
          <Input autoFocus placeholder="Title" value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} />
          <Textarea rows={8} placeholder="Write your note…" value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} />
          <div className="flex items-center gap-3"><Input placeholder="Label (optional)" value={edit.label ?? ''} onChange={e => setEdit({ ...edit, label: e.target.value })} className="w-48" />
            {COLORS.map(c => <button key={c} onClick={() => setEdit({ ...edit, color: c })} className={cx('size-6 rounded-full border-2', edit.color === c ? 'border-ink' : 'border-transparent')} style={{ background: c }} aria-label="Colour" />)}</div>
        </div>}
      </Modal>
    </Guard>
  );
}

export function Todos() {
  const { data, reload } = useRpc('admin.todos', [], []);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState('normal');
  const add = async () => { if (!title.trim()) return; await rpc('admin.saveTodo', { title, due, priority }); setTitle(''); setDue(''); reload(); };
  const open = (data ?? []).filter((t: any) => !t.done), done = (data ?? []).filter((t: any) => t.done);
  const row = (t: any) => (
    <li key={t.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
      <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={!!t.done} onChange={async () => { await rpc('admin.saveTodo', { done: !t.done, due: t.due }, t.id); reload(); }} />
      <span className={cx('flex-1 text-sm', t.done && 'text-muted line-through')}>{t.title}</span>
      {t.priority !== 'normal' && <Badge tone={t.priority === 'high' ? 'red' : 'gray'}>{t.priority}</Badge>}
      {t.due && <span className={cx('text-xs', !t.done && t.due < todayISO() ? 'font-medium text-bad' : 'text-muted')}>{date(t.due)}</span>}
      <IconButton label="Delete" onClick={async () => { await rpc('admin.deleteTodo', t.id); reload(); }}><Trash2 className="size-4" /></IconButton>
    </li>
  );
  return (
    <Guard module="personal">
      <PageHeader title="Todo list" subtitle={`${open.length} open · ${done.length} done`} />
      <Card className="max-w-3xl">
        <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void add(); }}>
          <Input autoFocus className="min-w-[220px] flex-1" value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs doing?" />
          <Input type="date" className="w-40" value={due} onChange={e => setDue(e.target.value)} />
          <Select className="w-32" value={priority} onChange={e => setPriority(e.target.value)}><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></Select>
          <Button type="submit" variant="primary" icon={<Plus className="size-4" />}>Add</Button>
        </form>
      </Card>
      <Card className="mt-4 max-w-3xl" pad={false}><ul>{open.map(row)}{!open.length && <li className="px-4 py-8 text-center text-sm text-muted">Nothing to do. 🎉</li>}</ul></Card>
      {done.length > 0 && <Card className="mt-4 max-w-3xl" pad={false} title="Done"><ul>{done.map(row)}</ul></Card>}
    </Guard>
  );
}

export function Events() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const from = isoOf(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const to = isoOf(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
  const { data, reload } = useRpc('admin.events', [from, to], [from]);
  const upcoming = useRpc('admin.events', [todayISO(), undefined], []);
  const [edit, setEdit] = useState<Record<string, any> | null>(null);
  const days = useMemo(() => {
    const start = new Date(cursor); start.setDate(1 - ((cursor.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [cursor]);
  const byDay = useMemo(() => { const m: Record<string, any[]> = {}; for (const e of data ?? []) (m[e.date] ??= []).push(e); return m; }, [data]);
  const save = async () => { await rpc('admin.saveEvent', edit!, edit!.id); setEdit(null); reload(); upcoming.reload(); };
  return (
    <Guard module="personal">
      <PageHeader title="Events" subtitle="Your schedule" actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit({ date: todayISO(), title: '', color: '#c27a43' })}>New event</Button>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card pad={false}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <IconButton label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="size-4" /></IconButton>
            <p className="font-semibold">{cursor.toLocaleString('en', { month: 'long', year: 'numeric' })}</p>
            <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</Button><IconButton label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="size-4" /></IconButton></div>
          </div>
          <div className="grid grid-cols-7 text-center text-[12.5px] text-muted">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7 border-t border-line">
            {days.map(d => {
              const iso = isoOf(d), inMonth = d.getMonth() === cursor.getMonth();
              return (
                <div key={iso} onDoubleClick={() => setEdit({ date: iso, title: '', color: '#c27a43' })} className={cx('min-h-24 border-b border-r border-line p-1.5', !inMonth && 'bg-surface-2/60')}>
                  <p className={cx('mb-1 text-xs', iso === todayISO() ? 'inline-flex size-6 items-center justify-center rounded-full bg-primary font-semibold text-on-primary' : inMonth ? 'text-ink-2' : 'text-muted/60')}>{d.getDate()}</p>
                  {(byDay[iso] ?? []).map(e => <button key={e.id} onClick={() => setEdit(e)} className="mb-0.5 block w-full truncate rounded px-1 py-0.5 text-left text-[11px] text-white" style={{ background: e.color || '#c27a43' }}>{e.start_time && `${e.start_time} `}{e.title}</button>)}
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Upcoming">
          <ul className="space-y-2">{(upcoming.data ?? []).slice(0, 12).map((e: any) => <li key={e.id} className="flex gap-2 text-sm"><span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: e.color }} /><button className="text-left" onClick={() => setEdit(e)}><p className="font-medium">{e.title}</p><p className="text-xs text-muted">{date(e.date)} {e.start_time}</p></button></li>)}</ul>
          {!upcoming.data?.length && <p className="text-sm text-muted">No upcoming events.</p>}
        </Card>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit event' : 'New event'} footer={<>{edit?.id && <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={async () => { await rpc('admin.deleteEvent', edit.id); setEdit(null); reload(); upcoming.reload(); }}>Delete</Button>}<Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
        {edit && <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Title" className="sm:col-span-3"><Input autoFocus value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /></Field>
          <Field label="Date"><Input type="date" value={edit.date} onChange={e => setEdit({ ...edit, date: e.target.value })} /></Field>
          <Field label="Start"><Input type="time" value={edit.start_time ?? ''} onChange={e => setEdit({ ...edit, start_time: e.target.value })} /></Field>
          <Field label="End"><Input type="time" value={edit.end_time ?? ''} onChange={e => setEdit({ ...edit, end_time: e.target.value })} /></Field>
          <Field label="Details" className="sm:col-span-3"><Textarea value={edit.details ?? ''} onChange={e => setEdit({ ...edit, details: e.target.value })} /></Field>
          <Field label="Colour" className="sm:col-span-3"><div className="flex gap-2">{['#c27a43', '#2563eb', '#16a34a', '#dc2626', '#9333ea', '#0891b2'].map(c => <button key={c} onClick={() => setEdit({ ...edit, color: c })} className={cx('size-7 rounded-full border-2', edit.color === c ? 'border-ink' : 'border-transparent')} style={{ background: c }} aria-label="Colour" />)}</div></Field>
        </div>}
      </Modal>
    </Guard>
  );
}
