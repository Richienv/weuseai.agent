import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'weuseai.agent admin',
  description: 'Internal admin — manual provision, customer list, fleet.',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Instrument+Serif&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <header className="topbar">
            <div className="brand">
              weuseai<span className="dot">.</span>agent admin
            </div>
            <nav>
              <a href="/manual-provision">Manual provision</a>
              <a href="/logout">Keluar</a>
            </nav>
          </header>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
