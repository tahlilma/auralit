'use client';
import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { rpc, useRpc } from '@/lib/client/rpc';
import { ACTIONS, ALL_MODULES } from '@/lib/permissions';
import { REPORT_GROUPS, REPORTS } from '@/lib/reports-meta';
import { dateTime, relative } from '@/lib/format';
import { Badge, Button, Card, Checkbox, Field, IconButton, Input, Loading, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { RefSelect, invalidateLookups } from '@/components/ui/combobox';
import { DataTable, DateRange, SearchInput } from '@/components/ui/table';
import { Drawer, useUI } from '@/components/ui/overlay';
import { ImageInput } from '@/components/forms';
import { Guard, useSession } from '@/components/shell/session';

export function Users() {
  const { toast, confirm } = useUI();
  const { can, me } = useSession();
  const { data, loading, reload } = useRpc('admin.listUsers', [], []);
  const [sel, setSel] = useState<Set<any>>(new Set());
  const [edit, setEdit] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await rpc('admin.saveUser', edit!, edit!.id); toast('User saved'); setEdit(null); reload(); invalidateLookups('user'); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const bulk = async (status: 'active' | 'inactive') => { await rpc('admin.setUsersStatus', [...sel] as number[], status); setSel(new Set()); reload(); };
  return (
    <Guard module="user">
      <PageHeader title="Users" subtitle="People who can sign in. Their role decides what they can see and do."
        actions={<>{sel.size > 0 && <><Button onClick={() => bulk('active')}>Activate {sel.size}</Button><Button onClick={() => bulk('inactive')}>Deactivate {sel.size}</Button></>}{can('user', 'write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit({ status: 'active', branch_id: 1 })}>New user</Button>}</>} />
      <Card pad={false}>
        <DataTable loading={loading} rows={data ?? []} selectable selected={sel} onSelect={setSel} onRowClick={r => setEdit({ ...r, password: '' })} columns={[
          { key: 'image', label: '', type: 'image', width: '44px' },
          { key: 'name', label: 'Name', render: r => <div><p className="font-medium">{r.name} {r.id === me.id && <Badge tone="brand">You</Badge>}</p><p className="text-xs text-muted">{r.email}</p></div> },
          { key: 'role', label: 'Access', render: r => <Badge tone="blue">{r.role ?? '—'}</Badge> }, { key: 'branch', label: 'Branch' }, { key: 'mobile', label: 'Mobile' },
          { key: 'last_active', label: 'Last active', render: r => <span className="text-xs text-muted">{r.last_active ? relative(r.last_active) : 'Never'}</span> },
          { key: 'status', label: 'Status', type: 'badge' },
          { key: '__a', label: '', align: 'right', render: r => <div className="flex justify-end" onClick={e => e.stopPropagation()}>{can('user', 'edit') && <IconButton label="Edit" onClick={() => setEdit({ ...r, password: '' })}><Pencil className="size-4" /></IconButton>}{can('user', 'delete') && r.id !== me.id && <IconButton label="Remove" onClick={async () => { if (await confirm({ title: `Deactivate ${r.name}?`, danger: true, confirm: 'Deactivate' })) { await rpc('admin.deleteUser', r.id); reload(); } }}><Trash2 className="size-4" /></IconButton>}</div> },
        ]} />
      </Card>
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit user' : 'New user'} footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
        {edit && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required><Input autoFocus value={edit.name ?? ''} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Email (login)" required><Input type="email" value={edit.email ?? ''} onChange={e => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Role" required><RefSelect refKey="role" value={edit.role_id} onChange={v => setEdit({ ...edit, role_id: v })} /></Field>
            <Field label="Branch"><RefSelect refKey="branch" value={edit.branch_id} onChange={v => setEdit({ ...edit, branch_id: v })} /></Field>
            <Field label="Linked employee" hint="Optional — used as default sales person"><RefSelect refKey="employee" value={edit.employee_id} onChange={v => setEdit({ ...edit, employee_id: v })} /></Field>
            <Field label="Mobile"><Input value={edit.mobile ?? ''} onChange={e => setEdit({ ...edit, mobile: e.target.value })} /></Field>
            <Field label={edit.id ? 'New password' : 'Password'} required={!edit.id} hint={edit.id ? 'Leave blank to keep the current password' : 'At least 6 characters'}><Input type="password" value={edit.password ?? ''} onChange={e => setEdit({ ...edit, password: e.target.value })} /></Field>
            <Field label="Status"><Select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
            <Field label="Photo" className="sm:col-span-2"><ImageInput value={edit.image} onChange={v => setEdit({ ...edit, image: v })} /></Field>
          </div>
        )}
      </Drawer>
    </Guard>
  );
}

export function Roles() {
  const { can } = useSession();
  const { toast, confirm } = useUI();
  const { data, loading, reload } = useRpc('admin.listRoles', [], []);
  const [edit, setEdit] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await rpc('admin.saveRole', { name: edit.name, status: edit.status, description: edit.description, perms: edit.perms }, edit.id); toast('Role saved'); setEdit(null); reload(); invalidateLookups('role'); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const setPerm = (mod: string, act: string, v: boolean) => setEdit((e: any) => ({ ...e, perms: { ...e.perms, [mod]: { ...(e.perms[mod] ?? {}), [act]: v } } }));
  const setRow = (mod: string, v: boolean) => setEdit((e: any) => ({ ...e, perms: { ...e.perms, [mod]: Object.fromEntries(ACTIONS.map(a => [a, v])) } }));
  const setCol = (act: string, v: boolean) => setEdit((e: any) => ({ ...e, perms: Object.fromEntries(ALL_MODULES.map(m => [m.key, { ...(e.perms[m.key] ?? {}), [act]: v }])) }));
  return (
    <Guard module="user">
      <PageHeader title="Roles & Permissions" subtitle="Each role is a matrix of modules × read / write / edit / delete / print." actions={can('user', 'write') && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit({ name: '', status: 'active', perms: {} })}>New role</Button>} />
      <Card pad={false}>
        <DataTable loading={loading} rows={data ?? []} onRowClick={r => setEdit(r)} columns={[
          { key: 'name', label: 'Role', render: r => <span className="font-medium">{r.name} {r.is_admin ? <Badge tone="brand">Full access</Badge> : null}</span> },
          { key: 'description', label: 'Description' }, { key: 'modules', label: 'Modules', render: r => r.is_admin ? 'All' : `${Object.values(r.perms).filter((p: any) => p.read).length} of ${ALL_MODULES.length}` },
          { key: 'reports', label: 'Reports', render: r => r.is_admin || r.report_perms.includes('*') ? 'All' : r.report_perms.length },
          { key: 'users', label: 'Users', type: 'number' }, { key: 'status', label: 'Status', type: 'badge' },
          { key: '__a', label: '', align: 'right', render: r => <div className="flex justify-end" onClick={e => e.stopPropagation()}><Button size="xs" variant="ghost" href={`/users/report-roles?role=${r.id}`}>Report access</Button>{!r.is_admin && can('user', 'delete') && <IconButton label="Delete" onClick={async () => { if (await confirm({ title: `Delete role ${r.name}?`, danger: true, confirm: 'Delete' })) { try { await rpc('admin.deleteRole', r.id); reload(); } catch (e: any) { toast(e.message, 'error'); } } }}><Trash2 className="size-4" /></IconButton>}</div> },
        ]} />
      </Card>
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit role — ${edit.name}` : 'New role'} width="max-w-4xl" footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={save} icon={<Save className="size-4" />}>Save role</Button></>}>
        {edit && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name" required><Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Status"><Select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
              <Field label="Description" className="sm:col-span-3"><Textarea rows={2} value={edit.description ?? ''} onChange={e => setEdit({ ...edit, description: e.target.value })} /></Field>
            </div>
            {edit.is_admin ? <p className="flex items-center gap-2 rounded-lg bg-brand-soft p-3 text-sm text-brand"><ShieldCheck className="size-4" />The administrator role always has full access.</p> : (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead><tr className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-muted"><th className="px-3 py-2 text-left">Module</th>{ACTIONS.map(a => <th key={a} className="px-3 py-2 text-center"><label className="inline-flex cursor-pointer flex-col items-center gap-1">{a}<input type="checkbox" className="accent-[var(--brand)]" checked={ALL_MODULES.every(m => edit.perms[m.key]?.[a])} onChange={e => setCol(a, e.target.checked)} /></label></th>)}<th className="px-3 py-2">All</th></tr></thead>
                  <tbody>
                    {ALL_MODULES.map(m => (
                      <tr key={m.key} className="border-t border-line hover:bg-surface-2">
                        <td className="px-3 py-2 font-medium">{m.label}</td>
                        {ACTIONS.map(a => <td key={a} className="px-3 py-2 text-center"><input type="checkbox" className="size-4 accent-[var(--brand)]" checked={!!edit.perms[m.key]?.[a]} onChange={e => setPerm(m.key, a, e.target.checked)} /></td>)}
                        <td className="px-3 py-2 text-center"><input type="checkbox" className="size-4 accent-[var(--brand)]" checked={ACTIONS.every(a => edit.perms[m.key]?.[a])} onChange={e => setRow(m.key, e.target.checked)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </Guard>
  );
}

export function ReportRoles({ initialRole }: { initialRole?: number }) {
  const { toast } = useUI();
  const roles = useRpc('admin.listRoles', [], []);
  const [roleId, setRoleId] = useState<number | null>(initialRole ?? null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const role = roles.data?.find((r: any) => r.id === roleId);
  useEffect(() => { if (role) setSel(new Set(role.report_perms.includes('*') ? REPORTS.map(r => r.key) : role.report_perms)); }, [role]);
  useEffect(() => { if (!roleId && roles.data?.length) setRoleId(roles.data.find((r: any) => !r.is_admin)?.id ?? roles.data[0].id); }, [roles.data, roleId]);
  const list = useMemo(() => REPORTS.filter(r => !q || `${r.title} ${r.group}`.toLowerCase().includes(q.toLowerCase())), [q]);
  const save = async () => {
    try { await rpc('admin.saveRole', { name: role.name, status: role.status, description: role.description, report_perms: sel.size === REPORTS.length ? ['*'] : [...sel] }, role.id); toast('Report access saved'); roles.reload(); } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <Guard module="user">
      <PageHeader title="Report Access" subtitle="Choose which reports each role can open (the role also needs the Report module)." actions={<Button variant="primary" icon={<Save className="size-4" />} onClick={save} disabled={!role}>Save</Button>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-60"><Select value={roleId ?? ''} onChange={e => setRoleId(Number(e.target.value))}>{roles.data?.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></div>
          <SearchInput value={q} onChange={setQ} placeholder="Search reports…" className="w-64" />
          <Checkbox label="Select all" checked={sel.size === REPORTS.length} onChange={v => setSel(new Set(v ? REPORTS.map(r => r.key) : []))} />
          <span className="text-sm text-muted">{sel.size} of {REPORTS.length} selected</span>
        </div>
      </Card>
      {!roles.data ? <Loading /> : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {REPORT_GROUPS.map(g => {
            const items = list.filter(r => r.group === g);
            if (!items.length) return null;
            return (
              <Card key={g} title={g} actions={<Checkbox label="All" checked={items.every(i => sel.has(i.key))} onChange={v => { const n = new Set(sel); for (const i of items) v ? n.add(i.key) : n.delete(i.key); setSel(n); }} />}>
                <div className="space-y-1.5">{items.map(r => <Checkbox key={r.key} label={r.title} checked={sel.has(r.key)} onChange={v => { const n = new Set(sel); v ? n.add(r.key) : n.delete(r.key); setSel(n); }} />)}</div>
              </Card>
            );
          })}
        </div>
      )}
    </Guard>
  );
}

export function ActivityLog() {
  const [q, setQ] = useState('');
  const [user, setUser] = useState<number | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading } = useRpc('admin.activityLog', [{ q, user_id: user ?? undefined, from, to, page }], [q, user, from, to, page]);
  return (
    <Guard module="user">
      <PageHeader title="Activity Log" subtitle="Every create, edit, delete and sign-in across the system." />
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search activity…" className="w-72" />
          <div className="w-52"><RefSelect refKey="user" value={user} onChange={setUser} placeholder="All users" /></div>
          <DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
        </div>
        <DataTable dense loading={loading} rows={data ?? []} columns={[
          { key: 'at', label: 'When', render: r => <span className="whitespace-nowrap text-xs text-muted">{dateTime(r.at)}</span> },
          { key: 'user_name', label: 'User' }, { key: 'action', label: 'Action', render: r => <Badge tone={r.action === 'delete' ? 'red' : r.action === 'create' ? 'green' : r.action === 'login' ? 'gray' : 'blue'}>{r.action}</Badge> },
          { key: 'entity', label: 'Area', render: r => <span className="text-xs text-muted">{r.entity}</span> }, { key: 'summary', label: 'Details' },
        ]} />
        <div className="flex justify-end gap-2 border-t border-line p-3"><Button size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Newer</Button><Button size="sm" disabled={(data?.length ?? 0) < 100} onClick={() => setPage(p => p + 1)}>Older</Button></div>
      </Card>
    </Guard>
  );
}

