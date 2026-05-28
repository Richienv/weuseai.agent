import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  getAdminSecret,
  timingSafeEqualStrings,
} from '../lib/auth';

// Server Action — runs on the Node runtime. Validates the submitted
// password with a timing-safe compare and sets the session cookie.
async function loginAction(formData: FormData) {
  'use server';
  const password = (formData.get('password') ?? '').toString();
  const secret = getAdminSecret();
  if (!secret) {
    redirect('/login?error=misconfigured');
  }
  if (!timingSafeEqualStrings(password, secret)) {
    redirect('/login?error=invalid');
  }
  // Same-secret-as-cookie model: cookie value IS the secret. Middleware
  // timing-safe-compares it back. No DB-backed session needed.
  cookies().set({
    name: SESSION_COOKIE,
    value: secret,
    httpOnly: true,
    sameSite: 'strict',
    secure: true,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  redirect('/manual-provision');
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const errorMsg =
    searchParams.error === 'invalid'
      ? 'Password salah. Coba lagi.'
      : searchParams.error === 'misconfigured'
        ? 'Admin app belum dikonfigurasi. Set OBSERVABILITY_ADMIN_SECRET di Vercel.'
        : null;

  return (
    <div className="card" style={{ maxWidth: 400, margin: '60px auto' }}>
      <h1>Masuk admin</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Akses internal — masukkan password admin untuk lanjut.
      </p>
      {errorMsg ? <div className="alert error">{errorMsg}</div> : null}
      <form action={loginAction}>
        <div className="field">
          <label htmlFor="password">Password admin</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
          />
        </div>
        <button type="submit" className="btn">
          Masuk <span className="arrow">↗</span>
        </button>
      </form>
    </div>
  );
}
