'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, Printer, RotateCcw, Save } from 'lucide-react';
import { rpc, useRpc } from '@/lib/client/rpc';
import { money, todayISO } from '@/lib/format';
import { Badge, Button, Card, Field, Input, Loading, PageHeader, Select } from '@/components/ui/primitives';
import { RefSelect } from '@/components/ui/combobox';
import { DataTable } from '@/components/ui/table';
import { Modal, useUI } from '@/components/ui/overlay';
import { Guard, useSession } from '@/components/shell/session';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function Period({ year, month, branch, set }: { year: number; month: number; branch: number | null; set: (p: { year?: number; month?: number; branch?: number | null }) => void }) {
  return (
    <Card>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Year"><Select value={year} onChange={e => set({ year: Number(e.target.value) })}>{Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(y => <option key={y}>{y}</option>)}</Select></Field>
        <Field label="Salary month"><Select value={month} onChange={e => set({ month: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select></Field>
        <Field label="Branch"><RefSelect refKey="branch" value={branch} onChange={v => set({ branch: v })} placeholder="All branches" /></Field>
      </div>
    </Card>
  );
}

export function Attendance() {
  const { toast } = useUI();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [branch, setBranch] = useState<number | null>(null);
  const [salaryDate, setSalaryDate] = useState(todayISO());
  const { data, loading, reload } = useRpc('payroll.attendanceSheet', [year, month, branch ?? undefined], [year, month, branch]);
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setRows(data.rows.map((r: any) => ({ ...r }))); }, [data]);
  const set = (i: number, k: string, v: string) => setRows(rs => rs.map((r, j) => {
    if (j !== i) return r;
    const n = { ...r, [k]: Number(v) || 0 };
    if (k === 'absent' || k === 'leave') n.present_days = Math.max(0, (data?.days ?? 30) - n.absent - n.leave);
    return n;
  }));
  const save = async () => {
    setBusy(true);
    try { await rpc('payroll.saveAttendance', year, month, salaryDate, rows, branch ?? undefined); toast('Attendance saved'); reload(); } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const numIn = (i: number, k: string, r: any) => <Input inputSize="sm" type="number" className="num w-20 text-right" value={r[k]} disabled={r.posted} onChange={e => set(i, k, e.target.value)} />;
  return (
    <Guard module="payroll">
      <PageHeader title="Attendance & Leave Entry" subtitle={data ? `${MONTHS[month - 1]} ${year} · ${data.days} days · ${data.latePerDay} lates = 1 day deduction` : ' '}
        actions={<><Field label=""><Input type="date" value={salaryDate} onChange={e => setSalaryDate(e.target.value)} title="Salary date" /></Field><Button variant="primary" icon={<Save className="size-4" />} loading={busy} onClick={save}>Save attendance</Button></>} />
      <Period year={year} month={month} branch={branch} set={p => { if (p.year) setYear(p.year); if (p.month) setMonth(p.month); if ('branch' in p) setBranch(p.branch ?? null); }} />
      <Card className="mt-4" pad={false}>
        {loading && !rows.length ? <Loading /> : (
          <DataTable dense rows={rows} rowKey="employee_id" columns={[
            { key: 'name', label: 'Name', render: r => <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.code} · {r.designation}</p></div> },
            { key: 'salary', label: 'G.Salary', render: (r, i) => numIn(i, 'salary', r) },
            { key: 'absent', label: 'Absent', render: (r, i) => numIn(i, 'absent', r) },
            { key: 'late', label: 'Late', render: (r, i) => numIn(i, 'late', r) },
            { key: 'leave', label: 'Leave', render: (r, i) => <div>{numIn(i, 'leave', r)}{r.approved_leave > 0 && <p className="text-[10px] text-muted">{r.approved_leave} approved</p>}</div> },
            { key: 'present_days', label: 'P.Day', render: (r, i) => numIn(i, 'present_days', r) },
            { key: 'bonus_pct', label: 'F.Bonus (%)', render: (r, i) => numIn(i, 'bonus_pct', r) },
            { key: 'posted', label: '', render: r => r.posted ? <Badge tone="green">Posted</Badge> : null },
          ]} empty={<p className="py-10 text-center text-sm text-muted">No active employees. Add employees under Payroll → Employees.</p>} />
        )}
      </Card>
    </Guard>
  );
}

export function SalarySheet() {
  const { toast, confirm } = useUI();
  const { company } = useSession();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [branch, setBranch] = useState<number | null>(null);
  const [slip, setSlip] = useState<number | null>(null);
  const { data, loading, reload } = useRpc('payroll.salarySheet', [year, month, branch ?? undefined], [year, month, branch]);
  const post = async () => {
    if (!(await confirm({ title: `Post salary for ${MONTHS[month - 1]} ${year}?`, body: 'Salary and bonus are booked as expense and credited to each employee. Pay them with a payment voucher.', confirm: 'Post salary' }))) return;
    try { const r = await rpc('payroll.postSalary', year, month, branch ?? undefined); toast(`${r.posted} salary posting(s) created`); reload(); } catch (e: any) { toast(e.message, 'error'); }
  };
  const unpost = async () => {
    const ids = (data?.rows ?? []).filter((r: any) => r.posted).map((r: any) => r.id);
    if (!ids.length || !(await confirm({ title: 'Reverse salary posting?', danger: true, confirm: 'Reverse' }))) return;
    try { await rpc('payroll.unpostSalary', ids); toast('Posting reversed'); reload(); } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <Guard module="payroll">
      <PageHeader title="Salary Sheet & Payslip" subtitle={`${MONTHS[month - 1]} ${year}`} actions={<><Button variant="ghost" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print sheet</Button><Button icon={<RotateCcw className="size-4" />} onClick={unpost}>Reverse posting</Button><Button variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={post}>Post salary</Button></>} />
      <div className="no-print"><Period year={year} month={month} branch={branch} set={p => { if (p.year) setYear(p.year); if (p.month) setMonth(p.month); if ('branch' in p) setBranch(p.branch ?? null); }} /></div>
      <Card className="print-area mt-4" pad={false}>
        <div className="hidden p-4 text-center print:block"><p className="text-lg font-bold">{company?.name}</p><p className="font-semibold">Salary sheet — {MONTHS[month - 1]} {year}</p></div>
        <DataTable dense loading={loading} rows={data?.rows ?? []} totals columns={[
          { key: 'name', label: 'Name', render: r => <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.code} · {r.designation}</p></div> },
          { key: 'salary', label: 'G.Salary', type: 'money' }, { key: 'absent', label: 'Absent', type: 'number', total: false }, { key: 'd_absent', label: 'D.Absent', type: 'money' }, { key: 'late', label: 'Late', type: 'number', total: false },
          { key: 'd_late', label: 'D.Late', type: 'money' }, { key: 'leave', label: 'A.Leave', type: 'number', total: false }, { key: 'present_days', label: 'P.Day', type: 'number', total: false },
          { key: 'payable', label: 'P.Amo', type: 'money' }, { key: 'bonus_pct', label: 'B(%)', type: 'number', total: false }, { key: 'bonus', label: 'B.Amo', type: 'money' }, { key: 'net', label: 'Net.Pay', type: 'money' },
          { key: 'posted', label: '', render: r => <div className="flex items-center justify-end gap-1 no-print">{r.posted ? <Badge tone="green">Posted</Badge> : <Badge tone="amber">Draft</Badge>}<Button size="xs" onClick={() => setSlip(r.id)}>Payslip</Button></div> },
        ]} empty={<p className="py-10 text-center text-sm text-muted">No attendance saved for this month yet. Fill Attendance first.</p>} />
      </Card>
      <Payslip id={slip} onClose={() => setSlip(null)} />
    </Guard>
  );
}

function Payslip({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data } = useRpc(id ? 'payroll.payslip' : null, [id ?? 0], [id]);
  if (!id) return null;
  const r = data?.row, e = data?.employee;
  return (
    <Modal open onClose={onClose} title="Payslip" size="lg" footer={<Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print payslip</Button>}>
      {!r ? <Loading /> : (
        <div className="print-area bg-white p-4 text-black">
          <div className="border-b-2 border-black pb-2 text-center"><p className="text-lg font-bold">{data.company?.name}</p><p className="text-xs">{data.company?.address}</p><p className="mt-1 font-semibold uppercase">Payslip — {MONTHS[r.month - 1]} {r.year}</p></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><p><b>Name:</b> {e.name}</p><p><b>ID:</b> {e.code}</p><p><b>Designation:</b> {e.designation}</p><p><b>Department:</b> {e.department}</p><p><b>Branch:</b> {e.branch}</p><p><b>Salary date:</b> {r.salary_date}</p></div>
          <table className="mt-4 w-full text-sm"><tbody>
            {[['Gross salary', r.salary], ['Absent deduction', -r.d_absent], ['Late deduction', -r.d_late], ['Payable salary', r.payable], [`Festival bonus (${r.bonus_pct}%)`, r.bonus]].map(([k, v]) => <tr key={k as string} className="border-b border-neutral-300"><td className="py-1.5">{k}</td><td className="num py-1.5 text-right">{money(v, false)}</td></tr>)}
            <tr className="font-bold"><td className="py-2">Net pay</td><td className="num py-2 text-right">{money(r.net)}</td></tr>
          </tbody></table>
          <p className="mt-2 text-xs">Days: absent {r.absent} · late {r.late} · leave {r.leave} · present {r.present_days}</p>
          <div className="mt-14 grid grid-cols-2 gap-10 text-center text-xs"><div className="border-t border-black pt-1">Employee signature</div><div className="border-t border-black pt-1">Authorised signature</div></div>
        </div>
      )}
    </Modal>
  );
}
