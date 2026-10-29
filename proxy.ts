import { NextResponse, type NextRequest } from 'next/server';

// Cheap gate: no session cookie → login page. Full validation happens in the RPC handler.
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has('auralit_session');
  const { pathname } = req.nextUrl;
  if (!hasSession && pathname !== '/login') {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico|login|.*\\.(?:svg|png|jpg|ico|webp)).*)'],
};
