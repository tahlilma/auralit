import fs from 'node:fs';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/server/db';
import { SESSION_COOKIE, userByToken } from '@/lib/server/auth';

// Downloads a consistent copy of the SQLite database (administrators only).
export async function POST(req: NextRequest) {
  const user = userByToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user?.is_admin) return NextResponse.json({ error: 'Only administrators can download backups.' }, { status: 403 });
  const dir = path.join(process.cwd(), 'data');
  const out = path.join(dir, `backup-${Date.now()}.db`);
  db().exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
  const buf = fs.readFileSync(out);
  fs.unlinkSync(out);
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="auralit-${new Date().toISOString().slice(0, 10)}.db"` },
  });
}
