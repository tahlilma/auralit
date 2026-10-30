import { connection, NextResponse, type NextRequest } from 'next/server';
import { get } from '@/lib/server/db';
import { createSession, destroySession, log, SESSION_COOKIE, userByToken, verifyPassword } from '@/lib/server/auth';
import { DEFAULT_ADMIN, DEFAULT_PASSWORD } from '@/lib/server/seed';

// First-run hint: true while the seeded administrator still has its default password.
export async function GET() {
  await connection();
  const u = get(`SELECT password FROM users WHERE email = ?`, [DEFAULT_ADMIN]);
  return NextResponse.json({ defaultLogin: !!u && verifyPassword(DEFAULT_PASSWORD, u.password), email: DEFAULT_ADMIN });
}

// Sign in
export async function POST(req: NextRequest) {
  const { email, password, remember } = (await req.json().catch(() => ({}))) as { email?: string; password?: string; remember?: boolean };
  const u = get(`SELECT id, password, status FROM users WHERE email = ?`, [String(email ?? '').trim().toLowerCase()]);
  if (!u || !verifyPassword(String(password ?? ''), u.password)) return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
  if (u.status !== 'active') return NextResponse.json({ error: 'This account is disabled. Contact your administrator.' }, { status: 403 });
  const { token, expires } = createSession(u.id, !!remember);
  log(userByToken(token), 'user', u.id, 'login', 'Signed in');
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', expires: remember ? expires : undefined, secure: req.nextUrl.protocol === 'https:' });
  return res;
}

// Sign out
export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
