'use client';

/**
 * Admin app sidebar — five tab nav + logout. Renders on every page
 * via the root layout. Highlights the active route by matching the
 * current pathname against each link's prefix (so nested routes like
 * /customers/<id> stay highlighted on the Customer List tab).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string };

const NAV: NavItem[] = [
  { href: '/manual-provision', label: 'Manual Provision' },
  { href: '/customers', label: 'Customer List' },
  { href: '/fleet', label: 'Fleet Summary' },
  { href: '/cost', label: 'Cost Monitoring' },
  { href: '/templates', label: 'Template no-match' },
];

export function Sidebar() {
  const pathname = usePathname() ?? '';
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        weuseai<span className="dot">.</span>agent
        <div className="sidebar-brand-sub">admin</div>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${active ? ' is-active' : ''}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <a href="/logout" className="sidebar-link sidebar-link-muted">
          Keluar
        </a>
      </div>
    </aside>
  );
}
