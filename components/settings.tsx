'use client';
import { useEffect, useMemo, useState } from 'react';
import { Database, Download, Save, Send, Trash2 } from 'lucide-react';
import { rpc, useRpc } from '@/lib/client/rpc';
import { dateTime } from '@/lib/format';
import { Badge, Button, Card, Checkbox, Field, Input, Loading, PageHeader, Select, Switch, Textarea } from '@/components/ui/primitives';
import { Combobox } from '@/components/ui/combobox';
import { DataTable } from '@/components/ui/table';
import { useUI } from '@/components/ui/overlay';
import { ImageInput } from '@/components/forms';
import { HistoryButton } from '@/components/history';
import { Guard, useSession } from '@/components/shell/session';

export function CompanySetup() {
  const { toast } = useUI();
  const { reloadSettings } = useSession();
  const { data } = useRpc('admin.getCompany', [], []);
  const [v, setV] = useState<Record<string, any> | null>(null);
  useEffect(() => { if (data) setV(data); }, [data]);
  if (!v) return <Loading />;
  const f = (k: string, label: string, opts: { area?: boolean; ph?: string; span?: boolean } = {}) => (
    <Field label={label} className={opts.span || opts.area ? 'sm:col-span-2' : ''}>
      {opts.area ? <Textarea value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })} placeholder={opts.ph} /> : <Input value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })} placeholder={opts.ph} />}
    </Field>
  );
  const save = async () => { try { await rpc('admin.saveCompany', v); toast('Company updated'); await reloadSettings(); } catch (e: any) { toast(e.message, 'error'); } };
  return (
    <Guard module="setting">
      <PageHeader title="Company Setup" subtitle="Shown on invoices, vouchers, reports and the sidebar." actions={<><HistoryButton entities={['company']} /><Button variant="primary" icon={<Save className="size-4" />} onClick={save}>Save</Button></>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            {f('name', 'Name (English)')}{f('bname', 'নাম (বাংলা)')}{f('slogan', 'Slogan (English)')}{f('bslogan', 'স্লোগান (বাংলা)')}
            {f('mobile', 'Mobile')}{f('phone', 'Phone')}{f('fax', 'Fax')}{f('web', 'Web', { ph: 'https://' })}{f('email', 'Email')}{f('tin', 'TIN')}{f('vat', 'VAT / BIN')}
            {f('address', 'Address (English)', { area: true })}{f('baddress', 'ঠিকানা (বাংলা)', { area: true })}{f('saddress', 'Address (single line, for POS receipts)', { area: true })}
          </div>
        </Card>
        <Card title="Logo"><ImageInput value={v.logo} onChange={logo => setV({ ...v, logo })} /></Card>
      </div>
    </Guard>
  );
}

const yesNo = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

export function LocalSettings() {
  const { toast } = useUI();
  const { reloadSettings } = useSession();
  const { data } = useRpc('admin.getSettings', [], []);
  const [v, setV] = useState<Record<string, string> | null>(null);
  useEffect(() => { if (data) setV(data); }, [data]);
  const zones = useMemo(() => { try { return (Intl as any).supportedValuesOf('timeZone').map((z: string) => ({ value: z, label: z })); } catch { return [{ value: 'Asia/Dhaka', label: 'Asia/Dhaka' }]; } }, []);
  if (!v) return <Loading />;
  const set = (k: string, x: string) => setV({ ...v, [k]: x });
  const sel = (k: string, label: string, opts: { value: string; label: string }[], hint?: string) => <Field label={label} hint={hint}><Select value={v[k] ?? ''} onChange={e => set(k, e.target.value)}>{opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>;
  const inp = (k: string, label: string, hint?: string, type = 'text') => <Field label={label} hint={hint}><Input type={type} value={v[k] ?? ''} onChange={e => set(k, e.target.value)} /></Field>;
  const save = async () => { try { await rpc('admin.saveSettings', v); toast('Settings saved'); await reloadSettings(); } catch (e: any) { toast(e.message, 'error'); } };
  const sample = (() => { const d = new Date(); const ddmmyy = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(2)}`; const co = v.company_short || 'BGI'; return { 'PFX-CO-DDMMYY-NNN': `SEL-${co}-${ddmmyy}-001`, 'PFX-B0-DDMMYY-NNN': `SEL-B1-${ddmmyy}-001`, 'PFX-DDMMYY-NNN-CO': `SEL-${ddmmyy}-001-${co}`, 'PFX-CO-YY-NNNNNN': `SEL-${co}-${String(d.getFullYear()).slice(2)}-000001` }; })();
  return (
    <Guard module="setting">
      <PageHeader title="Local Settings" actions={<><HistoryButton entities={['setting']} /><Button variant="primary" icon={<Save className="size-4" />} onClick={save}>Save</Button></>} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Region & format">
          <div className="grid gap-4 sm:grid-cols-2">
            {sel('language', 'Language', [{ value: 'en', label: 'English' }, { value: 'bn', label: 'বাংলা (saved for future use)' }])}
            <Field label="Time zone"><Combobox value={v.timezone} onChange={x => set('timezone', x ?? 'Asia/Dhaka')} options={zones} clearable={false} /></Field>
            {sel('date_format', 'Date format', ['dd MMM yyyy', 'dd-mm-yyyy', 'dd/mm/yyyy', 'yyyy-mm-dd', 'mm/dd/yyyy'].map(x => ({ value: x, label: x })))}
            {inp('pos_name', 'POS name (receipt header)')}
          </div>
        </Card>
        <Card title="Numbering & codes">
          <div className="grid gap-4 sm:grid-cols-2">
            {inp('code_prefix', 'Code prefix', 'Used in customer/supplier/product codes, e.g. ABA/CU/001')}
            {inp('company_short', 'Company short code', 'Used in invoice numbers')}
            <Field label="Invoice number format" className="sm:col-span-2"><Select value={v.number_format} onChange={e => set('number_format', e.target.value)}>{Object.entries(sample).map(([k, s]) => <option key={k} value={k}>{s}</option>)}</Select></Field>
            {sel('barcode_type', 'Generated barcode type', [{ value: 'numeric', label: 'Numeric' }, { value: 'alpha', label: 'Alphabet' }, { value: 'both', label: 'Both' }])}
            {sel('barcode_length', 'Barcode length', ['8', '10', '12'].map(x => ({ value: x, label: x })))}
          </div>
        </Card>
        <Card title="Sales rules">
          <div className="grid gap-4 sm:grid-cols-2">
            {sel('allow_negative_stock', 'Allow selling without stock', yesNo)}
            {sel('walkin_due_allowed', 'Allow due for walk-in customers', yesNo)}
            {sel('show_serial_on_invoice', 'Show serials on invoice', yesNo)}
            {sel('print_due_on_invoice', 'Show total due on invoice', yesNo)}
            {sel('edit_lock_hours', 'Lock editing after', [{ value: '0', label: 'Never' }, { value: '6', label: '6 hours' }, { value: '12', label: '12 hours' }, { value: '24', label: '1 day' }], 'Administrators can always edit')}
            {inp('late_per_day', 'Late arrivals per day deduction', 'Payroll: this many lates = 1 day salary', 'number')}
          </div>
        </Card>
        <Card title="Customer rewards">
          <div className="grid gap-4 sm:grid-cols-2">
            {sel('reward_enabled', 'Reward points', yesNo, 'Only customers with “Get Reward = Yes” earn points')}
            {inp('reward_spend', 'Spend per point (৳)', 'e.g. 1000 → 1 point for every ৳1000', 'number')}
            {inp('reward_point_value', 'Value of 1 point (৳)', 'Discount when redeeming', 'number')}
          </div>
        </Card>
        <Card title="Printed notes" className="xl:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Invoice footer note"><Textarea value={v.invoice_note ?? ''} onChange={e => set('invoice_note', e.target.value)} /></Field>
            <Field label="Invoice terms & conditions"><Textarea value={v.invoice_terms ?? ''} onChange={e => set('invoice_terms', e.target.value)} /></Field>
            <Field label="POS receipt note"><Textarea value={v.pos_receipt_note ?? ''} onChange={e => set('pos_receipt_note', e.target.value)} /></Field>
            <Field label="Challan note"><Textarea value={v.challan_note ?? ''} onChange={e => set('challan_note', e.target.value)} /></Field>
          </div>
        </Card>
      </div>
    </Guard>
  );
}

const TPL: [string, string, string][] = [
  ['invoice', 'Invoice SMS', '[COMPANY_NAME] [COMPANY_MOBILE] [SITE_URL] [INVOICE_NO] [INVOICE_TOTAL] [CASH_AMOUNT] [INVOICE_DUE] [TOT_DUE] [INV_URL]'],
  ['receive', 'Receive SMS', '[COMPANY_NAME] [COMPANY_MOBILE] [SITE_URL] [RECEIVE_NO] [RECEIVE_TOTAL] [TOT_DUE]'],
  ['payment', 'Payment SMS', '[COMPANY_NAME] [COMPANY_MOBILE] [SITE_URL] [PAYMENT_NO] [PAYMENT_TOTAL] [BALANCE_DUE]'],
  ['greeting', 'Greetings SMS', '[COMPANY_NAME] [COMPANY_MOBILE] [SITE_URL] [CUSTOMER_NAME]'],
];

export function SmsSettings() {
  const { toast } = useUI();
  const { data } = useRpc('admin.getSettings', [], []);
  const log = useRpc('admin.smsLog', [], []);
  const [v, setV] = useState<Record<string, string> | null>(null);
  const [test, setTest] = useState({ mobile: '', body: 'Test message from Auralit' });
  useEffect(() => { if (data) setV(data); }, [data]);
  if (!v) return <Loading />;
  const set = (k: string, x: string) => setV({ ...v, [k]: x });
  const save = async () => { try { await rpc('admin.saveSettings', v); toast('SMS settings saved'); } catch (e: any) { toast(e.message, 'error'); } };
  const g = (k: string, label: string, ph?: string) => <Field label={label}><Input value={v[k] ?? ''} onChange={e => set(k, e.target.value)} placeholder={ph} /></Field>;
  return (
    <Guard module="setting">
      <PageHeader title="SMS Templates & Gateway" actions={<Button variant="primary" icon={<Save className="size-4" />} onClick={save}>Save</Button>} />
      <div className="grid gap-4 xl:grid-cols-2">
        {TPL.map(([k, title, vars]) => (
          <Card key={k} title={title} actions={<Switch checked={v[`sms_tpl_${k}_status`] === 'active'} onChange={x => set(`sms_tpl_${k}_status`, x ? 'active' : 'inactive')} label={v[`sms_tpl_${k}_status`] === 'active' ? 'Active' : 'Off'} />}>
            <Textarea rows={3} value={v[`sms_tpl_${k}`] ?? ''} onChange={e => set(`sms_tpl_${k}`, e.target.value)} />
            <p className="mt-2 text-xs text-muted">Variables: {vars}</p>
          </Card>
        ))}
        <Card title="SMS gateway" className="xl:col-span-2" actions={<Switch checked={v.sms_status === '1'} onChange={x => set('sms_status', x ? '1' : '0')} label={v.sms_status === '1' ? 'Sending enabled' : 'Disabled'} />}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">{g('sms_gateway_url', 'Gateway URL', 'https://api.example.com/send')}</div>
            <Field label="SMS type"><Select value={v.sms_type} onChange={e => set('sms_type', e.target.value)}><option value="url">URL (GET query)</option><option value="api">API (POST JSON)</option></Select></Field>
            {g('sms_api_key', 'API key')}{g('sms_api_var', 'API-key variable', 'apikey')}{g('sms_sender', 'Sender name / ID', 'ArcticBD')}
            {g('sms_user', 'User ID')}{g('sms_user_var', 'User variable', 'username')}{g('sms_sender_var', 'Sender variable', 'SenderID')}
            {g('sms_password', 'Password')}{g('sms_pass_var', 'Password variable', 'password')}{g('sms_from_var', 'From variable', 'From')}
            {g('sms_to_var', 'To variable', 'To')}{g('sms_msg_var', 'Message variable', 'Message')}{g('sms_other_var', 'Other variable (optional)')}{g('sms_other_val', 'Other value (optional)')}
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <Field label="Test mobile"><Input value={test.mobile} onChange={e => setTest({ ...test, mobile: e.target.value })} placeholder="01XXXXXXXXX" /></Field>
            <Field label="Message" className="min-w-[280px] flex-1"><Input value={test.body} onChange={e => setTest({ ...test, body: e.target.value })} /></Field>
            <Button icon={<Send className="size-4" />} onClick={async () => { await rpc('admin.saveSettings', v); const r = await rpc('admin.testSms', test.mobile, test.body); toast(r.ok ? 'Sent' : `Not sent: ${r.response}`, r.ok ? 'ok' : 'warn'); log.reload(); }}>Save & send test</Button>
          </div>
        </Card>
        <Card title="Recent SMS" pad={false} className="xl:col-span-2">
          <DataTable dense rows={log.data ?? []} columns={[{ key: 'at', label: 'When', render: r => dateTime(r.at) }, { key: 'mobile', label: 'Mobile' }, { key: 'body', label: 'Message', render: r => <span className="line-clamp-2 text-xs">{r.body}</span> }, { key: 'status', label: 'Status', render: r => <Badge tone={r.status === 'sent' ? 'green' : r.status === 'failed' ? 'red' : 'gray'}>{r.status}</Badge> }, { key: 'response', label: 'Response', render: r => <span className="line-clamp-1 text-xs text-muted">{r.response}</span> }]} />
        </Card>
      </div>
    </Guard>
  );
}

const GROUPS: [string, string][] = [['sales', 'Sales, estimates, service & sales returns'], ['purchase', 'Purchases, orders & purchase returns'], ['vouchers', 'Payment, receipt, journal, transfer, expense vouchers & cheques'], ['inventory', 'Transfers, deliveries, receives, disposals'], ['warranty', 'Warranty claims'], ['payroll', 'Attendance, salary postings & leave'], ['enquiry', 'Customer enquiries'], ['activity', 'Activity history & SMS log']];

export function DataManagement() {
  const { toast, confirm } = useUI();
  const { me } = useSession();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pw, setPw] = useState('');
  const backup = async () => {
    const res = await fetch('/api/backup', { method: 'POST' });
    if (!res.ok) { toast((await res.json()).error ?? 'Backup failed', 'error'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob());
    a.download = `auralit-backup-${new Date().toISOString().slice(0, 10)}.db`;
    a.click();
  };
  const empty = async () => {
    if (!(await confirm({ title: 'Permanently delete selected data?', body: <>This removes {sel.size} data group(s) for good. Master data (customers, products, ledgers) is kept. Download a backup first.</>, confirm: 'Delete data', danger: true }))) return;
    try { await rpc('admin.emptyData', pw, [...sel]); toast('Data removed'); setSel(new Set()); setPw(''); } catch (e: any) { toast(e.message, 'error'); }
  };
  if (!me.is_admin) return <Card><p className="text-sm text-muted">Only administrators can manage data.</p></Card>;
  return (
    <div>
      <PageHeader title="Data Management" subtitle="Back up the whole database, or clear transaction data (e.g. after training)." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Backup">
          <p className="text-sm text-muted">Downloads a complete copy of the database (a single .db file). Keep it somewhere safe; to restore, replace <code className="rounded bg-surface-3 px-1">data/auralit.db</code> while the app is stopped.</p>
          <Button className="mt-4" variant="primary" icon={<Download className="size-4" />} onClick={backup}>Download backup</Button>
        </Card>
        <Card title="Empty transaction data">
          <div className="space-y-2">{GROUPS.map(([k, l]) => <Checkbox key={k} label={l} checked={sel.has(k)} onChange={v => { const n = new Set(sel); v ? n.add(k) : n.delete(k); setSel(n); }} />)}</div>
          <Field label="Your password" className="mt-4"><Input type="password" value={pw} onChange={e => setPw(e.target.value)} /></Field>
          <Button className="mt-4" variant="danger" icon={<Trash2 className="size-4" />} disabled={!sel.size || !pw} onClick={empty}>Delete selected data</Button>
        </Card>
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted"><Database className="size-3.5" />Database file: data/auralit.db</p>
    </div>
  );
}

export function Profile() {
  const { toast } = useUI();
  const { me, reload } = useSession();
  const [v, setV] = useState({ name: me.name ?? '', mobile: me.mobile ?? '', image: me.image ?? null });
  const [pw, setPw] = useState({ old: '', n1: '', n2: '' });
  const save = async () => { try { await rpc('admin.saveProfile', v); toast('Profile saved'); await reload(); } catch (e: any) { toast(e.message, 'error'); } };
  const change = async () => {
    if (pw.n1 !== pw.n2) { toast('New passwords do not match', 'warn'); return; }
    try { await rpc('admin.changePassword', pw.old, pw.n1); toast('Password changed'); setPw({ old: '', n1: '', n2: '' }); } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <div>
      <PageHeader title="Profile" subtitle={`${me.email} · ${me.role} · ${me.branch}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Your details">
          <div className="grid gap-4">
            <ImageInput value={v.image} onChange={image => setV({ ...v, image })} />
            <Field label="Name"><Input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></Field>
            <Field label="Mobile"><Input value={v.mobile} onChange={e => setV({ ...v, mobile: e.target.value })} /></Field>
          </div>
          <Button className="mt-4" variant="primary" onClick={save}>Save profile</Button>
        </Card>
        <Card title="Change password">
          <div className="grid gap-4">
            <Field label="Current password"><Input type="password" value={pw.old} onChange={e => setPw({ ...pw, old: e.target.value })} /></Field>
            <Field label="New password" hint="At least 6 characters"><Input type="password" value={pw.n1} onChange={e => setPw({ ...pw, n1: e.target.value })} /></Field>
            <Field label="Confirm new password"><Input type="password" value={pw.n2} onChange={e => setPw({ ...pw, n2: e.target.value })} /></Field>
          </div>
          <Button className="mt-4" variant="primary" disabled={!pw.old || !pw.n1} onClick={change}>Update password</Button>
        </Card>
      </div>
    </div>
  );
}

export function BulkSms() {
  const { toast } = useUI();
  const [group, setGroup] = useState<'customers' | 'suppliers' | 'employees' | 'custom'>('customers');
  const [mobiles, setMobiles] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const r = await rpc('admin.sendBulkSms', group === 'custom' ? { mobiles: mobiles.split(/[\s,;]+/).filter(Boolean), body } : { group, body });
      toast(`${r.sent} of ${r.total} sent`, r.sent ? 'ok' : 'warn');
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Guard module="client" action="write">
      <PageHeader title="Bulk SMS" subtitle="Send a message to all customers, suppliers, employees, or a custom list. Uses the gateway in SMS settings." />
      <Card className="max-w-2xl">
        <Field label="Send to"><Select value={group} onChange={e => setGroup(e.target.value as any)}><option value="customers">All active customers</option><option value="suppliers">All active suppliers</option><option value="employees">All active employees</option><option value="custom">Custom numbers</option></Select></Field>
        {group === 'custom' && <Field label="Mobile numbers" className="mt-4" hint="Separate with commas, spaces or new lines"><Textarea value={mobiles} onChange={e => setMobiles(e.target.value)} /></Field>}
        <Field label="Message" className="mt-4" hint={`${body.length} characters`}><Textarea rows={5} value={body} onChange={e => setBody(e.target.value)} /></Field>
        <Button className="mt-4" variant="primary" icon={<Send className="size-4" />} disabled={!body.trim()} loading={busy} onClick={send}>Send</Button>
      </Card>
    </Guard>
  );
}
