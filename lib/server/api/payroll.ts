import 'server-only';
import { all, get, run, round2, setting, today, tx } from '../db';
import { assertCan, HttpError, log, type SessionUser } from '../auth';
import { deleteJournalsFor, ensureLedger, postJournal, sys, type JLine } from '../core';

const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();

/** Attendance sheet for a month: saved rows merged with active employees (and approved leave days). */
export function attendanceSheet(u: SessionUser, year: number, month: number, branchId?: number) {
  assertCan(u, 'payroll', 'read');
  const emps = all(`SELECT e.id, e.code, e.name, e.salary, e.ledger_id, g.name designation, e.branch_id FROM employees e LEFT JOIN designations g ON g.id = e.designation_id
    WHERE e.status = 'active' ${branchId ? 'AND (e.branch_id = ? OR e.branch_id IS NULL)' : ''} ORDER BY e.name`, branchId ? [branchId] : []);
  const mm = String(month).padStart(2, '0');
  const start = `${year}-${mm}-01`, end = `${year}-${mm}-${daysIn(year, month)}`;
  const latePerDay = Number(setting('late_per_day', '3')) || 3;
  return {
    days: daysIn(year, month), latePerDay,
    rows: emps.map(e => {
      const saved = get(`SELECT * FROM attendance WHERE year = ? AND month = ? AND employee_id = ?`, [year, month, e.id]);
      const leave = all(`SELECT from_date, to_date FROM leave_apps WHERE employee_id = ? AND status = 'approved' AND from_date <= ? AND to_date >= ?`, [e.id, end, start])
        .reduce((s, l) => {
          const a = new Date(Math.max(new Date(l.from_date).getTime(), new Date(start).getTime()));
          const b = new Date(Math.min(new Date(l.to_date).getTime(), new Date(end).getTime()));
          return s + Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
        }, 0);
      return {
        employee_id: e.id, code: e.code, name: e.name, designation: e.designation, salary: saved?.salary ?? e.salary,
        absent: saved?.absent ?? 0, late: saved?.late ?? 0, leave: saved?.leave ?? leave, approved_leave: leave,
        present_days: saved?.present_days ?? daysIn(year, month) - (saved?.absent ?? 0) - (saved?.leave ?? leave),
        bonus_pct: saved?.bonus_pct ?? 0, posted: saved?.posted ?? 0, salary_date: saved?.salary_date ?? null,
      };
    }),
  };
}

export function saveAttendance(u: SessionUser, year: number, month: number, salaryDate: string | null, rows: any[], branchId?: number) {
  assertCan(u, 'payroll', 'write');
  return tx(() => {
    for (const r of rows) {
      const ex = get(`SELECT id, posted FROM attendance WHERE year = ? AND month = ? AND employee_id = ?`, [year, month, r.employee_id]);
      if (ex?.posted) continue;
      const vals = [Number(r.salary) || 0, Number(r.absent) || 0, Number(r.late) || 0, Number(r.leave) || 0, Number(r.present_days) || 0, Number(r.bonus_pct) || 0, salaryDate, branchId ?? null];
      if (ex) run(`UPDATE attendance SET salary = ?, absent = ?, late = ?, leave = ?, present_days = ?, bonus_pct = ?, salary_date = ?, branch_id = ? WHERE id = ?`, [...vals, ex.id]);
      else run(`INSERT INTO attendance (salary, absent, late, leave, present_days, bonus_pct, salary_date, branch_id, year, month, employee_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [...vals, year, month, r.employee_id]);
    }
    log(u, 'attendance', null, 'update', `Attendance saved for ${month}/${year}`);
    return { ok: true };
  });
}

export function salarySheet(u: SessionUser, year: number, month: number, branchId?: number) {
  assertCan(u, 'payroll', 'read');
  const days = daysIn(year, month);
  const latePerDay = Number(setting('late_per_day', '3')) || 3;
  const rows = all(`SELECT a.*, e.code, e.name, e.ledger_id, g.name designation, d.name department FROM attendance a JOIN employees e ON e.id = a.employee_id
    LEFT JOIN designations g ON g.id = e.designation_id LEFT JOIN departments d ON d.id = e.department_id
    WHERE a.year = ? AND a.month = ? ${branchId ? 'AND (a.branch_id = ? OR a.branch_id IS NULL)' : ''} ORDER BY e.name`, branchId ? [year, month, branchId] : [year, month]);
  return {
    days,
    rows: rows.map(r => {
      const perDay = r.salary / days;
      const dAbsent = round2(perDay * r.absent);
      const dLate = round2(perDay * Math.floor(r.late / latePerDay));
      const payable = round2(r.salary - dAbsent - dLate);
      const bonus = round2((r.salary * r.bonus_pct) / 100);
      return { ...r, d_absent: dAbsent, d_late: dLate, payable, bonus, net: round2(payable + bonus) };
    }),
  };
}

/** Posts the month's salary: expense against each employee's payable ledger. */
export function postSalary(u: SessionUser, year: number, month: number, branchId?: number) {
  assertCan(u, 'payroll', 'write');
  return tx(() => {
    const sheet = salarySheet(u, year, month, branchId).rows.filter(r => !r.posted);
    if (!sheet.length) throw new HttpError(400, 'Nothing to post. Save attendance first (already posted rows are skipped).');
    const date = sheet[0].salary_date || today();
    for (const r of sheet) {
      const ledger = r.ledger_id || ensureLedger('employee', r.employee_id, r.name, 'Salaries,Wages & Allowance Payable');
      const lines: JLine[] = [{ ledger_id: sys('SALARY'), debit: r.payable }, { ledger_id: sys('BONUS'), debit: r.bonus }, { ledger_id: ledger, credit: r.net }];
      const jid = postJournal({ no: `SAL-${year}${String(month).padStart(2, '0')}-${r.code}`, date, type: 'salary', ref_type: 'attendance', ref_id: r.id, narration: `Salary ${month}/${year} — ${r.name}`, created_by: u.id, lines });
      run(`UPDATE attendance SET posted = 1, journal_id = ? WHERE id = ?`, [jid, r.id]);
    }
    log(u, 'salary', null, 'create', `Salary posted for ${month}/${year} (${sheet.length} employees)`);
    return { posted: sheet.length };
  });
}

export function unpostSalary(u: SessionUser, ids: number[]) {
  assertCan(u, 'payroll', 'delete');
  return tx(() => {
    for (const id of ids) { deleteJournalsFor('attendance', id); run(`UPDATE attendance SET posted = 0, journal_id = NULL WHERE id = ?`, [id]); }
    log(u, 'salary', null, 'delete', `${ids.length} salary posting(s) reversed`);
    return { ok: true };
  });
}

export function payslip(u: SessionUser, attendanceId: number) {
  assertCan(u, 'payroll', 'print');
  const a = get(`SELECT * FROM attendance WHERE id = ?`, [attendanceId]);
  if (!a) throw new HttpError(404, 'Not found.');
  const row = salarySheet(u, a.year, a.month).rows.find(r => r.id === attendanceId);
  const emp = get(`SELECT e.*, g.name designation, d.name department, b.name branch FROM employees e LEFT JOIN designations g ON g.id = e.designation_id LEFT JOIN departments d ON d.id = e.department_id LEFT JOIN branches b ON b.id = e.branch_id WHERE e.id = ?`, [a.employee_id]);
  return { row, employee: emp, company: get(`SELECT * FROM company WHERE id = 1`) };
}
