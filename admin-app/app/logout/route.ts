import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../lib/auth';

// GET /logout — clears the session cookie, redirects to /login.
// Defined as GET so a plain link can trigger it; CSRF risk is bounded
// because the worst outcome is "founder is signed out".
export function GET(req: Request) {
  cookies().set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'strict',
    secure: true,
    path: '/',
    maxAge: 0,
  });
  const url = new URL('/login', req.url);
  return NextResponse.redirect(url);
}
