import { redirect } from 'next/navigation';

export default function Index() {
  // Middleware already gates this page on the cookie. If we got here,
  // the cookie was valid — send the founder to the only tab that exists.
  redirect('/manual-provision');
}
