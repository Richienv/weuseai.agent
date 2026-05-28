/**
 * Auth middleware for the Next.js admin sub-app.
 *
 * Every request that isn't /login or /api/login must carry a valid
 * weuseai_admin_session cookie. The cookie value is timing-safe-compared
 * against OBSERVABILITY_ADMIN_SECRET (see app/lib/auth.ts).
 *
 * NOTE: middleware runs on the Edge runtime by default. node:crypto is
 * NOT available there. We use Web Crypto subtle.timingSafeEqual via a
 * pure-JS constant-time fallback (see timingSafeStringsEdge) to keep
 * the byte-level guarantee.
 */

import { NextResponse, type NextRequest } from 'next/server';

export const config = {
  matcher: [
    // Match everything except Next.js internals and static assets.
    '/((?!_next/static|_next/image|favicon.ico|api/login|login).*)',
  ],
};

const SESSION_COOKIE = 'weuseai_admin_session';

function timingSafeStringsEdge(a: string, b: string): boolean {
  // Constant-time comparison without node:crypto (Edge runtime).
  if (!a || !b) return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const secret = process.env.OBSERVABILITY_ADMIN_SECRET ?? '';
  if (!secret) {
    // Misconfigured deployment — surface clearly rather than letting
    // unauth'd requests through. A 503 with a hint matches what the
    // existing /api/admin/* endpoints return on missing secret (500).
    return new NextResponse(
      'Admin app misconfigured: OBSERVABILITY_ADMIN_SECRET unset.',
      { status: 503 },
    );
  }
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!cookie || !timingSafeStringsEdge(cookie, secret)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
