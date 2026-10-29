import { NextResponse, type NextRequest } from 'next/server';
import { HttpError, SESSION_COOKIE, userByToken } from '@/lib/server/auth';
import { resolve } from '@/lib/server/rpc';

export async function POST(req: NextRequest) {
  const user = userByToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: 'Your session has expired. Please sign in again.' }, { status: 401 });
  let body: { fn?: string; args?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const fn = body.fn ? resolve(body.fn) : null;
  if (!fn) return NextResponse.json({ error: `Unknown function ${body.fn}` }, { status: 404 });
  try {
    const result = await fn(user, ...(Array.isArray(body.args) ? body.args : []));
    return NextResponse.json({ result: result ?? null });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`[rpc] ${body.fn}`, e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: /constraint|SQLITE/i.test(msg) ? `Database error: ${msg}` : msg || 'Something went wrong.' }, { status: 500 });
  }
}
